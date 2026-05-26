import type { CandidateType } from "../types.js";

const DEFAULT_TARGETS: Record<CandidateType, string> = {
  decision: "DECISIONS.md",
  troubleshooting: "TROUBLESHOOTING.md",
  module_boundary: "MODULES.md",
  project_fact: "PROJECT.md",
  user_preference: "PROJECT.md",
};

const PUBLISHABLE_TARGETS = new Set<string>([
  "DECISIONS.md",
  "TROUBLESHOOTING.md",
  "MODULES.md",
  "PROJECT.md",
]);

export function defaultTargetFor(type: CandidateType): string {
  return DEFAULT_TARGETS[type];
}

export function isValidTarget(target: string): boolean {
  return PUBLISHABLE_TARGETS.has(target);
}

export function titleFromContent(content: string): string {
  const firstLine = content.split("\n", 1)[0]?.trim() ?? "";
  if (firstLine.length === 0) return "(untitled)";
  if (firstLine.length <= 80) return firstLine;
  return `${firstLine.slice(0, 77)}...`;
}
