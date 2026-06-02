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

// A soft profile of what kind of project this is and what kind of user is
// likely working on it. Used to pick a friendlier PROJECT.md template, a
// more relevant first-step hint, and (later) a more relevant guide question
// set. Auto-detected at init time, shown to the user transparently, and
// overridable via `duoshe profile set <name>` — we never lock anyone in.
export const PROJECT_PROFILES = [
  "kid", // 学生 / 小学生学编程 / 教程跟做
  "non_dev_site", // 不懂代码的人维护网站（WordPress / 静态站 / 部署到云）
  "algo", // 算法 / 控制 / ML 研究为主（MATLAB / Jupyter）
  "embedded", // 嵌入式 C / FPGA / PLC / 固件
  "ai_app", // 用 Claude / OpenAI / LangChain 等构建 AI 应用
  "general", // 通用：web / 服务端 / 库开发 / 其他
] as const;

export type ProjectProfile = (typeof PROJECT_PROFILES)[number];

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
  guideCompletedAt?: string;
  profile?: ProjectProfile;
  profileSetBy?: "auto" | "user";
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
