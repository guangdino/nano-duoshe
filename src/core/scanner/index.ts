import type { GitInsights, ProjectScan } from "../types.js";
import { scanFileTree } from "./filetree.js";
import { scanGit } from "./git.js";
import { detectStacks } from "./stack.js";

export { scanFileTree } from "./filetree.js";
export { scanGit } from "./git.js";
export { detectStacks } from "./stack.js";

export function scanProject(root: string): ProjectScan {
  const tree = scanFileTree(root);
  return {
    root,
    stacks: detectStacks(root),
    topDirs: tree.topDirs,
    entryPoints: tree.entryPoints,
    totalFiles: tree.totalFiles,
    totalSourceFiles: tree.totalSourceFiles,
    scannedAt: new Date().toISOString(),
  };
}

export function fullScan(root: string, opts: { quick?: boolean } = {}): {
  scan: ProjectScan;
  git: GitInsights;
} {
  return {
    scan: scanProject(root),
    git: scanGit(root, opts),
  };
}
