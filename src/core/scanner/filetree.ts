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
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".pyi",
  ".cs", ".vb", ".fs",
  ".go",
  ".rs",
  ".java", ".kt", ".scala",
  ".rb", ".php", ".swift", ".m", ".mm",
  ".c", ".cc", ".cpp", ".cxx", ".h", ".hpp",
  ".lua", ".dart", ".ex", ".exs",
  ".sql",
  ".tf", ".tfvars",
  // Embedded / firmware
  ".ino",
  // HDL — FPGA / ASIC
  ".vhd", ".vhdl",
  ".v", ".sv", ".svh",
  // IEC 61131-3 — PLC structured text and friends
  ".st", ".scl", ".iec",
]);

const DIR_ROLE_HINTS: Record<string, string> = {
  src: "source code",
  source: "source code",
  lib: "library code",
  app: "application code",
  apps: "application(s)",
  packages: "monorepo packages",
  pkg: "packages",
  cmd: "command-line entry points",
  internal: "internal (non-public) code",
  test: "tests",
  tests: "tests",
  __tests__: "tests",
  spec: "tests/specs",
  e2e: "end-to-end tests",
  docs: "documentation",
  doc: "documentation",
  examples: "example usage",
  example: "example usage",
  scripts: "build/dev scripts",
  bin: "executable scripts",
  tools: "tooling",
  config: "configuration",
  configs: "configuration",
  public: "public/static assets",
  static: "static assets",
  assets: "assets",
  templates: "templates",
  migrations: "database migrations",
  models: "data models",
  views: "views/UI",
  controllers: "controllers",
  services: "services",
  components: "UI components",
  pages: "pages/routes",
  api: "API surface",
  routes: "routes",
  utils: "utilities",
  helpers: "helpers",
  types: "type definitions",
  hooks: "hooks",
  middleware: "middleware libraries",
  vendor: "vendored dependencies",
  third_party: "third-party code",
  ".github": "GitHub workflows/config",
  ".claude": "Claude Code settings",

  // ─── domain-specific (overrides above) ─────────────────────────────────────
  terraform: "infrastructure (Terraform)",
  tf: "infrastructure (Terraform)",
  infra: "infrastructure (Terraform)",
  ansible: "infrastructure (Ansible)",
  playbooks: "infrastructure (Ansible)",
  roles: "Ansible roles",
  docker: "container images",
  // AI / agent
  prompts: "AI prompts",
  prompt: "AI prompts",
  eval: "evaluations",
  evals: "evaluations",
  agents: "agent definitions",
  // Embedded firmware (C / C++)
  main: "firmware entry",
  drivers: "drivers",
  driver: "drivers",
  bsp: "board support package",
  hal: "hardware abstraction",
  freertos: "RTOS",
  inc: "C header files",
  include: "C header files",
  includes: "C header files",
  startup: "startup / boot code",
  boot: "startup / boot code",
  cmsis: "CMSIS (Cortex-M)",
  middlewares: "middleware libraries",
  // HDL / FPGA
  rtl: "RTL (HDL sources)",
  hdl: "HDL sources",
  sim: "HDL simulation",
  tb: "testbench",
  constraints: "FPGA constraints",
  ip: "IP cores",
  // PLC / industrial (Codesys, TwinCAT)
  plc: "PLC programs",
  pou: "PLC POUs",
  pous: "PLC POUs",
  programs: "PLC programs",
  functionblocks: "PLC function blocks",
  functions: "PLC functions",
  gvl: "PLC global variables",
  fb: "PLC function blocks",
  dut: "PLC data types (DUT)",
  duts: "PLC data types (DUT)",
  visualizations: "Codesys visualizations",
  visus: "Codesys visualizations",
  libraries: "library references",
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

export function scanFileTree(root: string): FileTreeResult {
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
      const role = DIR_ROLE_HINTS[name.toLowerCase()];
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
