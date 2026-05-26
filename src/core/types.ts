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

export type ProjectScan = {
  root: string;
  stacks: Stack[];
  topDirs: TopDir[];
  entryPoints: EntryPoint[];
  totalFiles: number;
  totalSourceFiles: number;
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

export type VaultConfig = {
  projectId: string;
  projectName: string;
  version: string;
  vaultPath: string;
  indexPath: string;
  contextFiles: string[];
  maxContextChars: number;
  allowAgentPublish?: boolean;
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
