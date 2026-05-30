export type Stack = {
  language: string;
  framework?: string;
  packageManager?: string;
  manifestFile: string;
  rawName?: string;
  rawVersion?: string;
};

export type TopDir = {
  name: string;
  fileCount: number;
  guessedRole?: string;
};

export type EntryPoint = {
  path: string;
  kind: "main" | "test" | "config" | "docs";
};

export type WorkspacePackage = {
  name: string;
  path: string;
  language?: string;
};

export type ProjectScan = {
  root: string;
  stacks: Stack[];
  topDirs: TopDir[];
  entryPoints: EntryPoint[];
  totalFiles: number;
  totalSourceFiles: number;
  workspaces?: WorkspacePackage[];
  scannedAt: string;
};

export type GitInsights = {
  isGitRepo: boolean;
  hotFiles?: { path: string; commits: number }[];
  largestFiles?: { path: string; bytes: number }[];
  contributorCount?: number;
  ageDays?: number;
  defaultBranch?: string;
  remoteUrl?: string;
};

// Controls how proactively the assistant offers suggestions after each command.
// "quiet"  = only speaks when something is genuinely wrong or actionable
// "normal" = default: speaks when there is a clear next step worth surfacing
// "chatty" = always adds a short follow-up, even if just encouragement
export type AssistantMode = "quiet" | "normal" | "chatty";

export type VaultConfig = {
  projectId: string;
  projectName: string;
  version: string;
  vaultPath: string;
  indexPath: string;
  contextFiles: string[];
  maxContextChars: number;
  allowAgentPublish?: boolean;
  enabledSkills: string[];
  assistantMode: AssistantMode;
  guideCompletedAt?: string;
  createdAt: string;
};

export const CANDIDATE_TYPES = [
  "decision",
  "troubleshooting",
  "module_boundary",
  "project_fact",
  "user_preference",
] as const;

export type CandidateType = (typeof CANDIDATE_TYPES)[number];

export const CANDIDATE_STATUSES = ["pending", "accepted", "rejected", "published"] as const;

export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

export type Candidate = {
  id: string;
  type: CandidateType;
  title: string;
  content: string;
  target: string;
  status: CandidateStatus;
  scope: string;
  sourceSessionId?: string;
  sourceTurnStart?: number;
  sourceTurnEnd?: number;
  source?: string;
  createdAt: string;
  publishedAt?: string;
  rejectedAt?: string;
};

export type CandidateInput = {
  type: CandidateType;
  content: string;
  title?: string;
  target?: string;
  sourceSessionId?: string;
  sourceTurnStart?: number;
  sourceTurnEnd?: number;
  source?: string;
};

export type SkillMeta = {
  name: string;
  version: string;
  description: string;
  enabledByDefault: boolean;
  triggers?: string[];
};

export type SkillDefinition = {
  meta: SkillMeta;
  run: (projectRoot: string, opts?: Record<string, unknown>) => Promise<void>;
  shouldAutoEnable?: (projectRoot: string) => Promise<boolean>;
};
