import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { getVersion } from "../version.js";

const REGISTRY_URL = "https://registry.npmjs.org/nano-duoshe/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 2000;

type UpdateCache = {
  checkedAt: string;
  latestVersion: string;
};

export type UpdateInfo = {
  current: string;
  latest: string;
  hasUpdate: boolean;
};

function cachePath(): string {
  return join(homedir(), ".duoshe", "update-check.json");
}

function readCache(): UpdateCache | null {
  const path = cachePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as UpdateCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  const path = cachePath();
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cache, null, 2), "utf8");
  } catch {
    // best-effort; ignore write failures (read-only HOME, etc.)
  }
}

function cacheIsFresh(cache: UpdateCache): boolean {
  const checkedAt = Date.parse(cache.checkedAt);
  if (Number.isNaN(checkedAt)) return false;
  return Date.now() - checkedAt < CHECK_INTERVAL_MS;
}

// Pure semver compare: returns true if `latest` > `current`.
// Treats anything containing "-" (prerelease) on `current` as wanting updates from any newer stable.
export function isNewer(current: string, latest: string): boolean {
  const parse = (v: string): [number, number, number, string] => {
    const [core, pre = ""] = v.split("-", 2);
    const [maj = "0", min = "0", pat = "0"] = (core ?? "0.0.0").split(".");
    return [
      Number.parseInt(maj, 10) || 0,
      Number.parseInt(min, 10) || 0,
      Number.parseInt(pat, 10) || 0,
      pre,
    ];
  };
  const [cMaj, cMin, cPat, cPre] = parse(current);
  const [lMaj, lMin, lPat, lPre] = parse(latest);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  if (lPat !== cPat) return lPat > cPat;
  // Same x.y.z: a stable release (no prerelease) beats a prerelease.
  if (cPre && !lPre) return true;
  if (!cPre && lPre) return false;
  return lPre > cPre;
}

function shouldSkipCheck(): boolean {
  if (process.env.DUOSHE_NO_UPDATE_CHECK === "1") return true;
  if (process.env.CI) return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(REGISTRY_URL, {
      signal: controller.signal,
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns cached info immediately if fresh; otherwise fetches in background and
// returns null (next invocation will see the new cache).
//
// This means update notifications are always one run behind — that is by design.
// We never block the user's command on a network call.
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (shouldSkipCheck()) return null;

  const current = getVersion();
  const cache = readCache();

  if (cache && cacheIsFresh(cache)) {
    return {
      current,
      latest: cache.latestVersion,
      hasUpdate: isNewer(current, cache.latestVersion),
    };
  }

  // Refresh cache in the background — never await on the main path.
  void (async () => {
    const latest = await fetchLatestVersion();
    if (latest) {
      writeCache({ checkedAt: new Date().toISOString(), latestVersion: latest });
    }
  })();

  return null;
}

// Synchronous-style check that fetches now and updates cache. Used by `duoshe upgrade`.
export async function checkForUpdateNow(): Promise<UpdateInfo> {
  const current = getVersion();
  const latest = await fetchLatestVersion();
  if (!latest) {
    return { current, latest: current, hasUpdate: false };
  }
  writeCache({ checkedAt: new Date().toISOString(), latestVersion: latest });
  return {
    current,
    latest,
    hasUpdate: isNewer(current, latest),
  };
}
