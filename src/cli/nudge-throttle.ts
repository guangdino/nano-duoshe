import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { vaultPathsFor } from "../core/vault/index.js";

const FILE_NAME = "nudges.json";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type State = Record<string, string>;

function pathFor(root: string): string {
  return join(vaultPathsFor(root).vault, FILE_NAME);
}

function read(root: string): State {
  const p = pathFor(root);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, "utf8")) as State;
  } catch {
    return {};
  }
}

function write(root: string, state: State): void {
  const p = pathFor(root);
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // best-effort
  }
}

// Returns true if the named nudge has NOT been shown within `ttlMs`.
// Marks it as shown when it returns true.
export function shouldShowAndMark(
  root: string,
  nudgeKey: string,
  ttlMs: number = DEFAULT_TTL_MS,
): boolean {
  const state = read(root);
  const lastIso = state[nudgeKey];
  if (lastIso) {
    const last = Date.parse(lastIso);
    if (!Number.isNaN(last) && Date.now() - last < ttlMs) return false;
  }
  state[nudgeKey] = new Date().toISOString();
  write(root, state);
  return true;
}
