import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GitInsights } from "../types.js";

const GIT_TIMEOUT_MS = 10_000;

function runGit(root: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: GIT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
    return out;
  } catch {
    return null;
  }
}

function isGitRepo(root: string): boolean {
  if (existsSync(join(root, ".git"))) return true;
  const out = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  return out?.trim() === "true";
}

function getHotFiles(root: string): GitInsights["hotFiles"] {
  const out = runGit(root, [
    "log",
    "--since=30.days.ago",
    "--name-only",
    "--pretty=format:",
    "--no-merges",
  ]);
  if (!out) return [];

  const counts = new Map<string, number>();
  for (const line of out.split("\n")) {
    const path = line.trim();
    if (!path) continue;
    if (path.startsWith(".duoshe/")) continue;
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([path, commits]) => ({ path, commits }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 10);
}

function getLargestSourceFiles(root: string): GitInsights["largestFiles"] {
  const out = runGit(root, ["ls-files"]);
  if (!out) return [];

  const sizes: { path: string; bytes: number }[] = [];
  for (const rel of out.split("\n")) {
    const path = rel.trim();
    if (!path) continue;
    if (
      /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|tar|gz|woff2?|ttf|otf|mp4|mp3|exe|dll|so|dylib)$/i.test(
        path,
      )
    )
      continue;
    if (path.startsWith(".duoshe/")) continue;
    try {
      const st = statSync(join(root, path));
      if (st.isFile()) sizes.push({ path, bytes: st.size });
    } catch {}
  }

  return sizes.sort((a, b) => b.bytes - a.bytes).slice(0, 10);
}

function getContributorCount(root: string): number | undefined {
  const out = runGit(root, ["shortlog", "-s", "-n", "HEAD"]);
  if (!out) return undefined;
  return out.split("\n").filter((l) => l.trim().length > 0).length;
}

function getAgeDays(root: string): number | undefined {
  const out = runGit(root, ["log", "--reverse", "--format=%ct", "--max-count=1"]);
  if (!out) return undefined;
  const firstTimestampSec = Number.parseInt(out.trim(), 10);
  if (!Number.isFinite(firstTimestampSec)) return undefined;
  const ageMs = Date.now() - firstTimestampSec * 1000;
  return Math.max(0, ageMs / (1000 * 60 * 60 * 24));
}

function getDefaultBranch(root: string): string | undefined {
  const out = runGit(root, ["symbolic-ref", "--short", "HEAD"]);
  return out?.trim() || undefined;
}

function getRemoteUrl(root: string): string | undefined {
  const out = runGit(root, ["remote", "get-url", "origin"]);
  return out?.trim() || undefined;
}

export function scanGit(root: string, opts: { quick?: boolean } = {}): GitInsights {
  if (!isGitRepo(root)) {
    return { isGitRepo: false };
  }
  if (opts.quick) {
    const insights: GitInsights = { isGitRepo: true };
    const branch = getDefaultBranch(root);
    if (branch !== undefined) insights.defaultBranch = branch;
    const remote = getRemoteUrl(root);
    if (remote !== undefined) insights.remoteUrl = remote;
    return insights;
  }

  const insights: GitInsights = { isGitRepo: true };
  const hot = getHotFiles(root);
  if (hot && hot.length > 0) insights.hotFiles = hot;
  const largest = getLargestSourceFiles(root);
  if (largest && largest.length > 0) insights.largestFiles = largest;
  const contributors = getContributorCount(root);
  if (contributors !== undefined) insights.contributorCount = contributors;
  const age = getAgeDays(root);
  if (age !== undefined) insights.ageDays = age;
  const branch = getDefaultBranch(root);
  if (branch !== undefined) insights.defaultBranch = branch;
  const remote = getRemoteUrl(root);
  if (remote !== undefined) insights.remoteUrl = remote;
  return insights;
}
