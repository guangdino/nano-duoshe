import type { GitInsights, ProjectScan } from "../types.js";
import { getEnabledSkillExtensions, type SkillExtensions } from "../skills/manager.js";
import { scanFileTree } from "./filetree.js";
import { scanGit } from "./git.js";
import { detectStacks, detectWorkspacePackages } from "./stack.js";

export { scanFileTree } from "./filetree.js";
export { scanGit } from "./git.js";
export { detectStacks, detectWorkspacePackages } from "./stack.js";

export function scanProject(root: string, extensions?: SkillExtensions): ProjectScan {
  const ext = extensions ?? { detectors: [], dirHints: {} };
  const tree = scanFileTree(root, ext.dirHints);
  const workspaces = detectWorkspacePackages(root);
  const out: ProjectScan = {
    root,
    stacks: detectStacks(root, ext.detectors),
    topDirs: tree.topDirs,
    entryPoints: tree.entryPoints,
    totalFiles: tree.totalFiles,
    totalSourceFiles: tree.totalSourceFiles,
    scannedAt: new Date().toISOString(),
  };
  if (workspaces.length > 0) out.workspaces = workspaces;
  return out;
}

export function fullScan(root: string, opts: { quick?: boolean } = {}): {
  scan: ProjectScan;
  git: GitInsights;
} {
  const extensions = getEnabledSkillExtensions(root);
  return {
    scan: scanProject(root, extensions),
    git: scanGit(root, opts),
  };
}
