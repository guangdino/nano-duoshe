import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile, ProjectScan } from "../types.js";

export type ProfileGuess = {
  profile: ProjectProfile;
  // One short Chinese line explaining the signals that triggered this guess.
  // Shown to the user during init so they can sanity-check it.
  reason: string;
  // How confident we are; not currently used to suppress display, just useful
  // for future tuning and tests.
  confidence: "high" | "medium" | "low";
};

const KID_FILE_PATTERN = /\.sb[23]$/i;
const CJK_RE = /[一-鿿]/;
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u;

// Quick depth-1 scan of a directory's filenames. Returns just names, never
// throws, never recurses. Used to look for kid signals (Scratch projects,
// Chinese filenames) and non-dev signals (lots of HTML at root).
function rootFileNames(root: string): string[] {
  try {
    return readdirSync(root);
  } catch {
    return [];
  }
}

function hasFile(names: string[], predicate: (name: string) => boolean): boolean {
  return names.some(predicate);
}

export function detectProfile(scan: ProjectScan, root: string): ProfileGuess {
  const names = rootFileNames(root);
  const langs = new Set(scan.stacks.map((s) => s.language));
  const fws = new Set(scan.stacks.map((s) => s.framework).filter((f): f is string => !!f));

  // ─── kid ────────────────────────────────────────────────────────────
  // Highest priority because it gates UX simplification — we'd rather treat
  // a serious project as a kid project than the reverse (false-positive kid
  // mode is mildly silly; false-negative kid mode confronts a 9-year-old with
  // "lint rules" and "performance budgets").
  if (hasFile(names, (n) => KID_FILE_PATTERN.test(n))) {
    return {
      profile: "kid",
      reason: "发现了 Scratch 项目文件（.sb2/.sb3）",
      confidence: "high",
    };
  }
  // Tiny project + filenames have CJK or emoji → almost certainly a kid or
  // tutorial follower. Real production projects don't name files this way.
  const cjkOrEmojiFiles = names.filter(
    (n) => CJK_RE.test(n) || EMOJI_RE.test(n),
  );
  if (
    scan.totalFiles <= 8 &&
    scan.topDirs.length === 0 &&
    cjkOrEmojiFiles.length >= 2
  ) {
    return {
      profile: "kid",
      reason: "项目很小，文件名是中文或带 emoji（看起来像练习项目）",
      confidence: "high",
    };
  }

  // ─── non_dev_site ─────────────────────────────────────────────────
  // WordPress is the canonical non-developer site builder; even technical
  // users running WordPress usually delegate to plugins, not code.
  if (fws.has("WordPress")) {
    return {
      profile: "non_dev_site",
      reason: "识别到 WordPress",
      confidence: "high",
    };
  }
  // Static HTML at root (no manifest, no framework, index.html present).
  // This is the "I bought a template and uploaded it" pattern.
  if (
    scan.stacks.length === 0 &&
    hasFile(names, (n) => /^index\.html?$/i.test(n)) &&
    scan.topDirs.length <= 3
  ) {
    return {
      profile: "non_dev_site",
      reason: "根目录有 index.html、没有代码工程的标志（看起来是静态站点）",
      confidence: "medium",
    };
  }
  // Hugo / Jekyll / Astro — static-site generators that non-devs often use
  // by following a tutorial. Astro can also be a dev framework, so confidence
  // is medium.
  if (
    existsSync(join(root, "hugo.toml")) ||
    existsSync(join(root, "hugo.yaml")) ||
    existsSync(join(root, "config.toml")) && existsSync(join(root, "content"))
  ) {
    return { profile: "non_dev_site", reason: "识别到 Hugo 静态站点", confidence: "high" };
  }
  if (
    existsSync(join(root, "_config.yml")) &&
    (existsSync(join(root, "_posts")) || existsSync(join(root, "_layouts")))
  ) {
    return { profile: "non_dev_site", reason: "识别到 Jekyll 静态站点", confidence: "high" };
  }

  // ─── algo ──────────────────────────────────────────────────────────
  if (langs.has("MATLAB") || fws.has("Simulink")) {
    return {
      profile: "algo",
      reason: "识别到 MATLAB / Simulink（算法 / 控制工程）",
      confidence: "high",
    };
  }
  // Jupyter-style data work: notebooks/ or derivations/ at root + Python.
  const hasAlgoDirs = scan.topDirs.some((d) =>
    ["notebooks", "algorithms", "algo", "derivations", "golden", "captures"].includes(
      d.name.toLowerCase(),
    ),
  );
  if (hasAlgoDirs && langs.has("Python")) {
    return {
      profile: "algo",
      reason: "Python + algorithms/notebooks/derivations 等目录（看起来是算法或研究项目）",
      confidence: "medium",
    };
  }

  // ─── embedded ──────────────────────────────────────────────────────
  if (
    langs.has("C/C++") ||
    langs.has("VHDL") ||
    langs.has("Verilog") ||
    langs.has("SystemVerilog") ||
    langs.has("VHDL / Verilog") ||
    langs.has("IEC 61131-3")
  ) {
    const which = scan.stacks[0]?.framework ?? scan.stacks[0]?.language ?? "嵌入式";
    return {
      profile: "embedded",
      reason: `识别到 ${which}（嵌入式 / FPGA / PLC）`,
      confidence: "high",
    };
  }

  // ─── ai_app ────────────────────────────────────────────────────────
  const aiFrameworks = ["Anthropic Claude", "OpenAI", "Google Gemini", "LangChain", "LlamaIndex", "Vercel AI SDK", "MCP server"];
  const aiFw = aiFrameworks.find((f) => fws.has(f));
  if (aiFw) {
    return {
      profile: "ai_app",
      reason: `识别到 ${aiFw}（构建 AI 应用 / Agent）`,
      confidence: "high",
    };
  }
  // prompts/ + at least one mainstream backend stack — signals "we're
  // adding AI into an existing app" rather than a pure agent product.
  if (
    scan.topDirs.some((d) => d.name.toLowerCase() === "prompts") &&
    (langs.has("TypeScript") || langs.has("Python"))
  ) {
    return {
      profile: "ai_app",
      reason: "TS/Python 项目里有 prompts/ 目录（看起来在做 AI 集成）",
      confidence: "medium",
    };
  }

  // ─── minimal but no other signal → kid (catch-all for tutorials) ─────
  if (
    scan.stacks.length === 0 &&
    scan.topDirs.length === 0 &&
    scan.totalFiles <= 8
  ) {
    return {
      profile: "kid",
      reason: "项目很小、没有任何工程结构（看起来是练习或教程）",
      confidence: "low",
    };
  }

  // ─── general fallback ──────────────────────────────────────────────
  return {
    profile: "general",
    reason: "看起来是常规的代码项目",
    confidence: "medium",
  };
}

export function profileLabel(profile: ProjectProfile): string {
  switch (profile) {
    case "kid":
      return "学习 / 练习项目";
    case "non_dev_site":
      return "网站维护（非开发者）";
    case "algo":
      return "算法 / 研究";
    case "embedded":
      return "嵌入式 / 固件 / FPGA / PLC";
    case "ai_app":
      return "AI 应用 / Agent";
    case "general":
      return "通用代码项目";
  }
}

export function profileDescription(profile: ProjectProfile): string {
  switch (profile) {
    case "kid":
      return "做练习、跟教程、小游戏。不会被 lint / 性能预算之类的词烦到。";
    case "non_dev_site":
      return "维护网站，最关心的是「别动哪个文件」「域名 / SSL / 部署在哪」。";
    case "algo":
      return "MATLAB / Jupyter / 控制算法 / 数据分析。关心实验版本、参数对照。";
    case "embedded":
      return "C / VHDL / Verilog / Codesys。关心硬件边界、ISR、内存约束。";
    case "ai_app":
      return "用 Anthropic / OpenAI / LangChain 构建 AI 产品。关心 prompt 演化、模型选择、eval。";
    case "general":
      return "Web、后端、库、CLI 等常规项目。默认模式。";
  }
}
