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
  if (deps.next) framework = "Next.js";
  else if (deps["@nestjs/core"]) framework = "NestJS";
  else if (deps.react) framework = "React";
  else if (deps.vue) framework = "Vue";
  else if (deps.svelte) framework = "Svelte";
  else if (deps.express) framework = "Express";
  else if (deps.fastify) framework = "Fastify";
  else if (deps["@modelcontextprotocol/sdk"]) framework = "MCP server";

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

export function detectStacks(root: string): Stack[] {
  const detectors = [
    detectNpm,
    detectPython,
    detectDotNet,
    detectGo,
    detectRust,
    detectPhp,
    detectTerraform,
    detectAnsible,
    detectDocker,
  ];
  const stacks: Stack[] = [];
  for (const fn of detectors) {
    const s = fn(root);
    if (s) stacks.push(s);
  }
  return stacks;
}
