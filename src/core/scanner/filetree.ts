import { readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import type { EntryPoint, TopDir } from "../types.js";

const ALWAYS_IGNORE = new Set([
  ".git",
  "node_modules",
  ".duoshe",
  ".vscode",
  ".idea",
  ".vs",
  "dist",
  "build",
  "out",
  "target",
  "bin",
  "obj",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
  "__pycache__",
  ".pytest_cache",
  ".venv",
  "venv",
  "env",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  ".gradle",
  ".mvn",
]);

const SOURCE_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".pyi",
  ".cs",
  ".vb",
  ".fs",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".scala",
  ".rb",
  ".php",
  ".swift",
  ".m",
  ".mm",
  ".c",
  ".cc",
  ".cpp",
  ".cxx",
  ".h",
  ".hpp",
  ".lua",
  ".dart",
  ".ex",
  ".exs",
  ".sql",
  ".tf",
  ".tfvars",
  // Embedded / firmware
  ".ino",
  // HDL — FPGA / ASIC
  ".vhd",
  ".vhdl",
  ".v",
  ".sv",
  ".svh",
  // IEC 61131-3 — PLC structured text and friends
  ".st",
  ".scl",
  ".iec",
  // MATLAB / Simulink — .m already covered (as Obj-C overlap)
  ".mlx", // MATLAB Live Script (XML)
  ".slx",
  ".mdl", // Simulink models (binary but THE source asset)
  // Scratch (kids learning to code) — binary but it IS their code
  ".sb3",
  ".sb2",
]);

// Role hints are in Chinese — they go directly into generated Markdown.
// Domain-specific hints (embedded, FPGA, PLC, MATLAB, Terraform, WordPress…)
// live in each skill's skill.json and are merged in at scan time when the
// skill is enabled. Keep this list to universal, cross-domain entries.
const DIR_ROLE_HINTS: Record<string, string> = {
  src: "源代码",
  source: "源代码",
  lib: "库代码",
  app: "应用代码",
  apps: "应用",
  packages: "monorepo 包",
  pkg: "包",
  cmd: "命令行入口",
  internal: "内部代码（不对外）",
  test: "测试",
  tests: "测试",
  __tests__: "测试",
  spec: "测试 / 规格",
  e2e: "端到端测试",
  docs: "文档",
  doc: "文档",
  examples: "示例代码",
  example: "示例代码",
  scripts: "构建 / 开发脚本",
  bin: "可执行脚本",
  tools: "工具",
  config: "配置",
  configs: "配置",
  public: "公共 / 静态资源",
  static: "静态资源",
  assets: "资源",
  templates: "模板",
  migrations: "数据库迁移",
  models: "数据模型",
  views: "视图 / UI",
  controllers: "控制器",
  services: "服务",
  components: "UI 组件",
  pages: "页面 / 路由",
  api: "API 接口",
  routes: "路由",
  utils: "工具函数",
  helpers: "辅助函数",
  types: "类型定义",
  hooks: "hooks",
  middleware: "中间件",
  middlewares: "中间件",
  vendor: "vendored 依赖",
  third_party: "第三方代码",
  ".github": "GitHub workflows / 配置",
  ".claude": "Claude Code 设置",
  data: "数据集 / fixtures",
  python: "Python 代码",
  notebooks: "notebook",
  nb: "notebook",
  // AI / agent (mainstream enough to be universal)
  prompts: "Prompt 模板",
  prompt: "Prompt 模板",
  eval: "评测集",
  evals: "评测集",
  agents: "Agent 定义",
  functions: "函数 / 无服务器函数",
};

const ENTRY_PATTERNS: { pattern: RegExp; kind: EntryPoint["kind"] }[] = [
  { pattern: /^index\.(t|j)sx?$/i, kind: "main" },
  { pattern: /^main\.(t|j)sx?$/i, kind: "main" },
  { pattern: /^server\.(t|j)sx?$/i, kind: "main" },
  { pattern: /^app\.(t|j)sx?$/i, kind: "main" },
  { pattern: /^main\.py$/i, kind: "main" },
  { pattern: /^__main__\.py$/i, kind: "main" },
  { pattern: /^app\.py$/i, kind: "main" },
  { pattern: /^manage\.py$/i, kind: "main" },
  { pattern: /^Program\.cs$/i, kind: "main" },
  { pattern: /^main\.go$/i, kind: "main" },
  { pattern: /^main\.rs$/i, kind: "main" },
  { pattern: /^lib\.rs$/i, kind: "main" },
  { pattern: /^index\.php$/i, kind: "main" },
  { pattern: /^app\.php$/i, kind: "main" },
  { pattern: /^artisan$/i, kind: "main" },
  { pattern: /^main\.(c|cc|cpp|cxx)$/i, kind: "main" },
  { pattern: /^main\.ino$/i, kind: "main" },
  // FPGA — top-level module convention is top.{vhd,v,sv} or top_level.{vhd,v,sv}
  { pattern: /^top(_level)?\.(vhd|vhdl|v|sv)$/i, kind: "main" },
  // PLC — Codesys / IEC 61131-3 program named MAIN is the cyclic task entry
  { pattern: /^main\.st$/i, kind: "main" },
];

const TIME_BUDGET_MS = 30_000;
const MAX_FILES = 200_000;

type WalkAccumulator = {
  topDirs: Map<string, { fileCount: number }>;
  entryPoints: EntryPoint[];
  totalFiles: number;
  totalSourceFiles: number;
  startTime: number;
  aborted: boolean;
};

function isIgnored(name: string): boolean {
  if (name.startsWith(".") && !DIR_ROLE_HINTS[name]) return true;
  return ALWAYS_IGNORE.has(name);
}

function walk(root: string, dir: string, acc: WalkAccumulator, topDirName: string | null): void {
  if (acc.aborted) return;
  if (Date.now() - acc.startTime > TIME_BUDGET_MS) {
    acc.aborted = true;
    return;
  }
  if (acc.totalFiles >= MAX_FILES) {
    acc.aborted = true;
    return;
  }

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    if (isIgnored(name)) continue;
    const full = join(dir, name);
    let st: ReturnType<typeof statSync>;
    try {
      st = statSync(full);
    } catch {
      continue;
    }

    if (st.isDirectory()) {
      const nextTop = topDirName ?? name;
      walk(root, full, acc, nextTop);
    } else if (st.isFile()) {
      acc.totalFiles += 1;
      const ext = extname(name).toLowerCase();
      if (SOURCE_EXTS.has(ext)) acc.totalSourceFiles += 1;

      if (topDirName) {
        const td = acc.topDirs.get(topDirName) ?? { fileCount: 0 };
        td.fileCount += 1;
        acc.topDirs.set(topDirName, td);
      }

      for (const { pattern, kind } of ENTRY_PATTERNS) {
        if (pattern.test(name)) {
          const rel = relative(root, full).split(sep).join("/");
          if (acc.entryPoints.length < 10) acc.entryPoints.push({ path: rel, kind });
          break;
        }
      }
    }
  }
}

export type FileTreeResult = {
  topDirs: TopDir[];
  entryPoints: EntryPoint[];
  totalFiles: number;
  totalSourceFiles: number;
  aborted: boolean;
};

export function scanFileTree(
  root: string,
  extraDirHints: Record<string, string> = {},
): FileTreeResult {
  const acc: WalkAccumulator = {
    topDirs: new Map(),
    entryPoints: [],
    totalFiles: 0,
    totalSourceFiles: 0,
    startTime: Date.now(),
    aborted: false,
  };

  walk(root, root, acc, null);

  const topDirs: TopDir[] = [...acc.topDirs.entries()]
    .map(([name, v]) => {
      const td: TopDir = { name, fileCount: v.fileCount };
      const key = name.toLowerCase();
      const role = DIR_ROLE_HINTS[key] ?? extraDirHints[key];
      if (role !== undefined) td.guessedRole = role;
      return td;
    })
    .sort((a, b) => b.fileCount - a.fileCount)
    .slice(0, 12);

  return {
    topDirs,
    entryPoints: acc.entryPoints,
    totalFiles: acc.totalFiles,
    totalSourceFiles: acc.totalSourceFiles,
    aborted: acc.aborted,
  };
}
