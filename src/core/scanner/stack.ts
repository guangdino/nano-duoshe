import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Stack } from "../types.js";

type NpmPkg = {
  name?: string;
  version?: string;
  packageManager?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

// Reads a JSON file and tolerates a UTF-8 BOM. Windows editors (notepad,
// PowerShell `Set-Content -Encoding utf8`) commonly emit BOMs that vanilla
// JSON.parse rejects — silently breaking detection on user repos.
function readJsonSafe<T>(path: string): T | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// Cheap workspace-tsconfig probe: looks at a few first-level directory entries
// matched by simple glob prefixes (no full glob lib needed here).
function workspacesContainTsconfig(root: string, workspaces: NpmPkg["workspaces"]): boolean {
  for (const sub of iterWorkspaceDirs(root, workspaces)) {
    if (existsSync(join(sub, "tsconfig.json"))) return true;
  }
  return false;
}

function* iterWorkspaceDirs(
  root: string,
  workspaces: NpmPkg["workspaces"],
): Iterable<string> {
  const patterns = Array.isArray(workspaces) ? workspaces : (workspaces?.packages ?? []);
  for (const pat of patterns) {
    const dir = pat.replace(/\/\*+$/, "").replace(/\*+$/, "");
    if (!dir) continue;
    const abs = join(root, dir);
    let subs: string[];
    try {
      subs = readdirSync(abs);
    } catch {
      continue;
    }
    for (const sub of subs) {
      const subAbs = join(abs, sub);
      if (existsSync(join(subAbs, "package.json"))) yield subAbs;
    }
  }
}

export type WorkspacePkgInfo = { name: string; path: string; language?: string };

export function detectWorkspacePackages(root: string): WorkspacePkgInfo[] {
  const pkg = readJsonSafe<NpmPkg>(join(root, "package.json"));
  if (!pkg?.workspaces) return [];

  const results: WorkspacePkgInfo[] = [];
  for (const subAbs of iterWorkspaceDirs(root, pkg.workspaces)) {
    const subPkg = readJsonSafe<NpmPkg>(join(subAbs, "package.json")) ?? {};
    const name = subPkg.name ?? subAbs.split(/[\\/]/).pop() ?? "?";
    const rel = subAbs.replace(root, "").replace(/^[\\/]+/, "").replace(/\\/g, "/");
    const info: WorkspacePkgInfo = { name, path: rel };
    if (existsSync(join(subAbs, "tsconfig.json"))) info.language = "TypeScript";
    results.push(info);
    if (results.length >= 30) break; // cap for safety
  }
  return results;
}

function detectNpm(root: string): Stack | null {
  const manifest = join(root, "package.json");
  if (!existsSync(manifest)) return null;
  const pkg: NpmPkg = readJsonSafe<NpmPkg>(manifest) ?? {};

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  let framework: string | undefined;
  // AI / agent stacks take priority — they're a strong signal about what the
  // project is *for*, more so than the host web framework. Check them first.
  if (deps["@anthropic-ai/sdk"]) framework = "Anthropic Claude";
  else if (deps["@openai/agents"] || deps.openai) framework = "OpenAI";
  else if (deps["@google/genai"] || deps["@google/generative-ai"]) framework = "Google Gemini";
  else if (deps.langchain || hasScopedDep(deps, "@langchain/")) framework = "LangChain";
  else if (deps.llamaindex || hasScopedDep(deps, "@llamaindex/")) framework = "LlamaIndex";
  else if (deps.ai || hasScopedDep(deps, "@ai-sdk/")) framework = "Vercel AI SDK";
  else if (deps["@modelcontextprotocol/sdk"]) framework = "MCP server";
  // Otherwise pick the web framework signal.
  else if (deps.next) framework = "Next.js";
  else if (deps["@nestjs/core"]) framework = "NestJS";
  else if (deps.react) framework = "React";
  else if (deps.vue) framework = "Vue";
  else if (deps.svelte) framework = "Svelte";
  else if (deps.express) framework = "Express";
  else if (deps.fastify) framework = "Fastify";

  // Workspace-style monorepos often have tsconfig only inside packages, not at root.
  const hasWorkspaceTs = Array.isArray(pkg.workspaces) && workspacesContainTsconfig(root, pkg.workspaces);
  const hasTs =
    !!deps.typescript ||
    existsSync(join(root, "tsconfig.json")) ||
    existsSync(join(root, "tsconfig.base.json")) ||
    hasWorkspaceTs;
  const language = hasTs ? "TypeScript" : "JavaScript";

  let pm: string | undefined;
  if (pkg.packageManager) pm = pkg.packageManager.split("@")[0];
  else if (existsSync(join(root, "pnpm-lock.yaml"))) pm = "pnpm";
  else if (existsSync(join(root, "yarn.lock"))) pm = "yarn";
  else if (existsSync(join(root, "bun.lockb"))) pm = "bun";
  else if (existsSync(join(root, "package-lock.json"))) pm = "npm";

  const stack: Stack = {
    language,
    manifestFile: "package.json",
  };
  if (framework !== undefined) stack.framework = framework;
  if (pm !== undefined) stack.packageManager = pm;
  if (pkg.name !== undefined) stack.rawName = pkg.name;
  if (pkg.version !== undefined) stack.rawVersion = pkg.version;
  return stack;
}

function detectPython(root: string): Stack | null {
  const manifests = ["pyproject.toml", "requirements.txt", "setup.py", "Pipfile"];
  for (const m of manifests) {
    const p = join(root, m);
    if (!existsSync(p)) continue;
    let framework: string | undefined;
    try {
      const txt = readFileSync(p, "utf8").toLowerCase();
      if (txt.includes("django")) framework = "Django";
      else if (txt.includes("fastapi")) framework = "FastAPI";
      else if (txt.includes("flask")) framework = "Flask";
      else if (txt.includes("torch") || txt.includes("pytorch")) framework = "PyTorch";
      else if (txt.includes("tensorflow")) framework = "TensorFlow";
    } catch {
    }
    let pm: string | undefined;
    if (existsSync(join(root, "poetry.lock"))) pm = "poetry";
    else if (existsSync(join(root, "uv.lock"))) pm = "uv";
    else if (existsSync(join(root, "Pipfile.lock"))) pm = "pipenv";
    else pm = "pip";

    const stack: Stack = { language: "Python", manifestFile: m };
    if (framework !== undefined) stack.framework = framework;
    if (pm !== undefined) stack.packageManager = pm;
    return stack;
  }

  // Fallback: bare Python scripts with no manifest. Common with beginners,
  // students, data exploration, and one-off automation. Recognize when there
  // are at least 2 .py files anywhere in the first level.
  try {
    const entries = readdirSync(root);
    const rootPy = entries.filter((e) => e.endsWith(".py"));
    if (rootPy.length >= 2) {
      return {
        language: "Python",
        manifestFile: rootPy[0]!,
        framework: "scripts",
      };
    }
  } catch {
    // ignore
  }
  return null;
}

function detectDotNet(root: string): Stack | null {
  try {
    const entries = readdirSync(root);
    const sln = entries.find((e) => e.endsWith(".sln"));
    const csproj = entries.find((e) => e.endsWith(".csproj"));
    const fsproj = entries.find((e) => e.endsWith(".fsproj"));
    const vbproj = entries.find((e) => e.endsWith(".vbproj"));

    const manifest = sln ?? csproj ?? fsproj ?? vbproj;
    if (!manifest) return null;

    let language = "C#";
    if (fsproj) language = "F#";
    else if (vbproj) language = "VB.NET";

    let framework: string | undefined;
    const projFile = csproj ?? fsproj ?? vbproj;
    if (projFile) {
      try {
        const txt = readFileSync(join(root, projFile), "utf8");
        if (/<UseWPF>true<\/UseWPF>/i.test(txt)) framework = "WPF";
        else if (/<UseWindowsForms>true<\/UseWindowsForms>/i.test(txt)) framework = "WinForms";
        else if (/<Project Sdk="Microsoft\.NET\.Sdk\.Web"/i.test(txt)) framework = "ASP.NET Core";
        else if (/<Project Sdk="Microsoft\.NET\.Sdk\.Worker"/i.test(txt)) framework = "Worker Service";
      } catch {
      }
    }

    const stack: Stack = { language, manifestFile: manifest, packageManager: "NuGet" };
    if (framework !== undefined) stack.framework = framework;
    return stack;
  } catch {
    return null;
  }
}

function detectGo(root: string): Stack | null {
  const manifest = join(root, "go.mod");
  if (!existsSync(manifest)) return null;
  let rawName: string | undefined;
  try {
    const first = readFileSync(manifest, "utf8").split("\n").find((l) => l.startsWith("module "));
    if (first) rawName = first.replace("module ", "").trim();
  } catch {
  }
  const stack: Stack = { language: "Go", manifestFile: "go.mod", packageManager: "go modules" };
  if (rawName !== undefined) stack.rawName = rawName;
  return stack;
}

function hasScopedDep(deps: Record<string, string>, prefix: string): boolean {
  return Object.keys(deps).some((k) => k.startsWith(prefix));
}

// MATLAB / Octave: no standard manifest. Use strong signals:
// - .slx / .mdl (Simulink models — unambiguous)
// - .mlx (MATLAB Live Scripts — unambiguous)
// - matlab/ subdir
// - >=3 .m files at root or in matlab/ (more than typical Objective-C top-level)
function detectMatlab(root: string): Stack | null {
  // Strong signals first.
  let entries: string[];
  try {
    entries = readdirSync(root);
  } catch {
    return null;
  }
  const hasSimulink =
    entries.some((e) => e.endsWith(".slx") || e.endsWith(".mdl")) ||
    findFirstByExt(join(root, "matlab"), [".slx", ".mdl"], 2);
  const hasLiveScript =
    entries.some((e) => e.endsWith(".mlx")) || findFirstByExt(join(root, "matlab"), [".mlx"], 2);
  const matlabDirExists = existsSync(join(root, "matlab"));

  if (hasSimulink) {
    const manifest =
      entries.find((e) => e.endsWith(".slx") || e.endsWith(".mdl")) ??
      findFirstByExt(join(root, "matlab"), [".slx", ".mdl"], 2);
    return {
      language: "MATLAB",
      manifestFile: manifest ?? "(Simulink models)",
      framework: "Simulink",
    };
  }
  if (hasLiveScript || matlabDirExists) {
    return { language: "MATLAB", manifestFile: matlabDirExists ? "matlab/" : "(MATLAB scripts)" };
  }

  // Weaker signal: >=3 .m files at root. Risks confusion with Objective-C, but
  // ObjC projects typically have .xcodeproj / Podfile (caught by detectDotNet
  // or just left undetected) — a bare repo of .m files is much more likely
  // MATLAB in practice.
  const mFiles = entries.filter((e) => e.endsWith(".m"));
  if (mFiles.length >= 3) {
    return { language: "MATLAB", manifestFile: mFiles[0]! };
  }
  return null;
}

function findFirstByExt(dir: string, exts: string[], maxDepth: number): string | null {
  if (maxDepth < 0) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (exts.some((e) => name.toLowerCase().endsWith(e))) return name;
  }
  for (const name of entries) {
    const sub = join(dir, name);
    try {
      if (readdirSync(sub).length === 0) continue;
    } catch {
      continue;
    }
    const found = findFirstByExt(sub, exts, maxDepth - 1);
    if (found) return `${name}/${found}`;
  }
  return null;
}

function detectEmbedded(root: string): Stack | null {
  // PlatformIO is the strongest signal — it tells us this is firmware
  // regardless of which framework is configured inside.
  const hasPlatformio = existsSync(join(root, "platformio.ini"));
  if (hasPlatformio) {
    let framework: string | undefined;
    try {
      const ini = readFileSync(join(root, "platformio.ini"), "utf8");
      const m = ini.match(/^\s*framework\s*=\s*(\w+)/m);
      if (m) {
        const fw = m[1]!.toLowerCase();
        if (fw === "espidf") framework = "ESP-IDF";
        else if (fw === "arduino") framework = "Arduino";
        else if (fw === "zephyr") framework = "Zephyr";
        else if (fw === "mbed") framework = "Mbed OS";
        else framework = m[1];
      }
    } catch {
      // ignore — still report PlatformIO without specific framework
    }
    const stack: Stack = {
      language: "C/C++",
      manifestFile: "platformio.ini",
      packageManager: "PlatformIO",
    };
    if (framework) stack.framework = framework;
    return stack;
  }

  // ESP-IDF: sdkconfig + root CMakeLists.txt is the canonical layout.
  const hasSdkconfig = existsSync(join(root, "sdkconfig")) || existsSync(join(root, "sdkconfig.defaults"));
  const rootCMake = join(root, "CMakeLists.txt");
  const hasCMake = existsSync(rootCMake);
  if (hasSdkconfig && hasCMake) {
    return {
      language: "C/C++",
      manifestFile: "CMakeLists.txt",
      framework: "ESP-IDF",
      packageManager: "ESP-IDF",
    };
  }
  // Zephyr: west.yml at root or Zephyr-specific build files.
  if (existsSync(join(root, "west.yml")) || existsSync(join(root, "prj.conf"))) {
    return {
      language: "C/C++",
      manifestFile: existsSync(join(root, "west.yml")) ? "west.yml" : "prj.conf",
      framework: "Zephyr",
    };
  }
  // Arduino sketch: any .ino file in root or src/.
  try {
    const rootEntries = readdirSync(root);
    const ino = rootEntries.find((e) => e.endsWith(".ino"));
    if (ino) {
      return { language: "C/C++", manifestFile: ino, framework: "Arduino" };
    }
  } catch {
    // ignore
  }
  // Bare CMake: root CMakeLists.txt with a project() call.
  if (hasCMake) {
    try {
      const txt = readFileSync(rootCMake, "utf8");
      if (/^\s*project\s*\(/im.test(txt)) {
        return { language: "C/C++", manifestFile: "CMakeLists.txt", packageManager: "CMake" };
      }
    } catch {
      // ignore
    }
  }
  // Plain Makefile: root Makefile with .c files anywhere — lowest priority.
  if (existsSync(join(root, "Makefile"))) {
    try {
      const rootEntries = readdirSync(root);
      if (rootEntries.some((e) => e.endsWith(".c") || e.endsWith(".cpp") || e.endsWith(".cc"))) {
        return { language: "C/C++", manifestFile: "Makefile", packageManager: "make" };
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function detectFpga(root: string): Stack | null {
  // Walk a couple of common directories looking for HDL files or vendor project files.
  // Industrial / FPGA repos rarely keep these at root.
  const probe = (dir: string): Stack | null => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return null;
    }
    // Xilinx Vivado project (.xpr) or Quartus (.qpf/.qsf)
    const xpr = entries.find((e) => e.endsWith(".xpr"));
    if (xpr) {
      return { language: "VHDL / Verilog", manifestFile: xpr, framework: "Vivado", packageManager: "Vivado" };
    }
    const qpf = entries.find((e) => e.endsWith(".qpf") || e.endsWith(".qsf"));
    if (qpf) {
      return { language: "VHDL / Verilog", manifestFile: qpf, framework: "Quartus", packageManager: "Quartus" };
    }
    // Bare HDL: any .vhd / .v / .sv at the root of the probed dir
    const hdl = entries.find((e) => /\.(vhdl?|sv|svh)$/i.test(e)) ?? entries.find((e) => e.endsWith(".v"));
    if (hdl) {
      const lang = hdl.endsWith(".vhd") || hdl.endsWith(".vhdl") ? "VHDL" : hdl.endsWith(".sv") || hdl.endsWith(".svh") ? "SystemVerilog" : "Verilog";
      return { language: lang, manifestFile: hdl };
    }
    return null;
  };
  // Root first, then common subdirs (rtl/, hdl/, src/).
  for (const subdir of ["", "rtl", "hdl", "src", "sources"]) {
    const dir = subdir ? join(root, subdir) : root;
    const found = probe(dir);
    if (found) {
      if (subdir) found.manifestFile = `${subdir}/${found.manifestFile}`;
      return found;
    }
  }
  return null;
}

function detectPlc(root: string): Stack | null {
  // TwinCAT 3 project files
  try {
    const entries = readdirSync(root);
    const tspproj = entries.find((e) => e.endsWith(".tspproj") || e.endsWith(".tsproj"));
    if (tspproj) {
      return { language: "IEC 61131-3", manifestFile: tspproj, framework: "TwinCAT" };
    }
    const plcproj = entries.find((e) => e.endsWith(".plcproj"));
    if (plcproj) {
      return { language: "IEC 61131-3", manifestFile: plcproj, framework: "TwinCAT" };
    }
    // Codesys / generic PLC: .project file + .st/.scl files anywhere
    const codesysProj = entries.find((e) => e.endsWith(".project") || e.endsWith(".library"));
    if (codesysProj && hasAnyExtRecursive(root, [".st", ".scl"], 2)) {
      return { language: "IEC 61131-3", manifestFile: codesysProj, framework: "Codesys" };
    }
    // Bare PLC: any .st file at root or 1 level deep
    if (hasAnyExtRecursive(root, [".st", ".scl", ".iec"], 1)) {
      return { language: "IEC 61131-3", manifestFile: "(structured text)" };
    }
  } catch {
    return null;
  }
  return null;
}

function hasAnyExtRecursive(dir: string, exts: string[], maxDepth: number): boolean {
  if (maxDepth < 0) return false;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const name of entries) {
    const lower = name.toLowerCase();
    if (exts.some((e) => lower.endsWith(e))) return true;
  }
  for (const name of entries) {
    const sub = join(dir, name);
    try {
      if (readdirSync(sub).length > 0 && hasAnyExtRecursive(sub, exts, maxDepth - 1)) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function detectPhp(root: string): Stack | null {
  const hasComposer = existsSync(join(root, "composer.json"));
  const hasIndexPhp = existsSync(join(root, "index.php"));
  let entries: string[] = [];
  try {
    entries = readdirSync(root);
  } catch {
    // ignore
  }
  const hasAnyPhp = entries.some((e) => e.endsWith(".php"));
  if (!hasComposer && !hasIndexPhp && !hasAnyPhp) return null;

  const manifest = hasComposer ? "composer.json" : hasIndexPhp ? "index.php" : entries.find((e) => e.endsWith(".php"))!;

  let framework: string | undefined;
  if (hasComposer) {
    try {
      const composer = readJsonSafe<{ require?: Record<string, string>; "require-dev"?: Record<string, string> }>(join(root, "composer.json"));
      const txt = composer ? JSON.stringify(composer).toLowerCase() : readFileSync(join(root, "composer.json"), "utf8").toLowerCase();
      if (txt.includes("laravel/framework")) framework = "Laravel";
      else if (txt.includes("symfony/symfony") || txt.includes("symfony/framework-bundle")) framework = "Symfony";
      else if (txt.includes("codeigniter4/framework")) framework = "CodeIgniter";
      else if (txt.includes("cakephp/cakephp")) framework = "CakePHP";
      else if (txt.includes("yiisoft/yii2")) framework = "Yii";
    } catch {
      // ignore
    }
  }
  if (!framework) {
    if (existsSync(join(root, "wp-config.php")) || existsSync(join(root, "wp-config-sample.php"))) {
      framework = "WordPress";
    } else if (existsSync(join(root, "artisan"))) {
      framework = "Laravel";
    } else if (existsSync(join(root, "bin/console"))) {
      framework = "Symfony";
    }
  }

  const stack: Stack = {
    language: "PHP",
    manifestFile: manifest,
  };
  if (framework !== undefined) stack.framework = framework;
  if (hasComposer) stack.packageManager = "composer";
  return stack;
}

function detectTerraform(root: string): Stack | null {
  try {
    const rootTf = readdirSync(root).find((e) => e.endsWith(".tf"));
    if (rootTf) {
      return { language: "Terraform", manifestFile: rootTf, packageManager: "terraform" };
    }
    // Common IaC layout: terraform/, infra/, tf/ subdirs hold the .tf files.
    for (const subdir of ["terraform", "infra", "tf"]) {
      const subPath = join(root, subdir);
      if (!existsSync(subPath)) continue;
      const found = findFirstTfInTree(subPath, 3);
      if (found) {
        return {
          language: "Terraform",
          manifestFile: `${subdir}/${found}`,
          packageManager: "terraform",
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function findFirstTfInTree(dir: string, maxDepth: number): string | null {
  if (maxDepth < 0) return null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (name.endsWith(".tf")) return name;
  }
  for (const name of entries) {
    const sub = join(dir, name);
    try {
      if (!readdirSync(sub).length) continue;
    } catch {
      continue;
    }
    const found = findFirstTfInTree(sub, maxDepth - 1);
    if (found) return `${name}/${found}`;
  }
  return null;
}

function detectAnsible(root: string): Stack | null {
  const markers = ["ansible.cfg", "playbook.yml", "playbook.yaml", "site.yml", "site.yaml"];
  for (const m of markers) {
    if (existsSync(join(root, m))) {
      return { language: "Ansible", manifestFile: m, packageManager: "ansible-galaxy" };
    }
  }
  return null;
}

function detectDocker(root: string): Stack | null {
  if (existsSync(join(root, "Dockerfile"))) {
    return { language: "Docker", manifestFile: "Dockerfile" };
  }
  if (existsSync(join(root, "compose.yml")) || existsSync(join(root, "docker-compose.yml"))) {
    return {
      language: "Docker Compose",
      manifestFile: existsSync(join(root, "compose.yml")) ? "compose.yml" : "docker-compose.yml",
    };
  }
  return null;
}

function detectRust(root: string): Stack | null {
  const manifest = join(root, "Cargo.toml");
  if (!existsSync(manifest)) return null;
  let rawName: string | undefined;
  try {
    const m = readFileSync(manifest, "utf8").match(/^\s*name\s*=\s*"([^"]+)"/m);
    if (m?.[1]) rawName = m[1];
  } catch {
  }
  const stack: Stack = { language: "Rust", manifestFile: "Cargo.toml", packageManager: "cargo" };
  if (rawName !== undefined) stack.rawName = rawName;
  return stack;
}

// Core detectors run on every init/rescan — language-agnostic and universal.
const CORE_DETECTORS = [
  detectNpm,
  detectPython,
  detectDotNet,
  detectGo,
  detectRust,
  detectPhp,
  detectDocker,
];

// Optional detectors keyed by name. They are bundled in the package (larger
// install is acceptable) but only run when the matching skill is enabled.
// Activate via: duoshe skill enable <name>  →  duoshe rescan
const OPTIONAL_DETECTORS: Record<string, (root: string) => Stack | null> = {
  matlab: detectMatlab,
  embedded: detectEmbedded,
  fpga: detectFpga,
  plc: detectPlc,
  terraform: detectTerraform,
  ansible: detectAnsible,
};

export function detectStacks(root: string, enabledDetectors: string[] = []): Stack[] {
  const stacks: Stack[] = [];
  for (const fn of CORE_DETECTORS) {
    const s = fn(root);
    if (s) stacks.push(s);
  }
  for (const name of enabledDetectors) {
    const fn = OPTIONAL_DETECTORS[name];
    if (fn) {
      const s = fn(root);
      if (s) stacks.push(s);
    }
  }
  return stacks;
}
