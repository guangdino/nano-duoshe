import type { Dirent } from "node:fs";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, writeConfig } from "../vault/config.js";
import { vaultPathsFor } from "../vault/paths.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_SKILLS_DIR = resolve(__dirname, "../../skills");

export type SkillStatus = {
  name: string;
  available: boolean;
  enabled: boolean;
  description: string;
  postEnableHint?: string | undefined;
};

type SkillJson = {
  name?: string;
  description?: string;
  postEnableHint?: string;
  // Optional detector names (keys from OPTIONAL_DETECTORS in stack.ts)
  detectors?: string[];
  // Domain-specific dir hints merged into scanFileTree at rescan time
  dirHints?: Record<string, string>;
};

export type SkillExtensions = {
  detectors: string[];
  dirHints: Record<string, string>;
};

function readSkillMeta(skillDir: string): SkillJson {
  const metaPath = join(skillDir, "skill.json");
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as SkillJson;
  } catch {
    return {};
  }
}

function updateEnabledSkillsConfig(configPath: string, skillName: string, enable: boolean): void {
  const cfg = readConfig(configPath);
  if (!cfg) return;
  if (enable) {
    if (!cfg.enabledSkills.includes(skillName)) cfg.enabledSkills.push(skillName);
  } else {
    cfg.enabledSkills = cfg.enabledSkills.filter((s) => s !== skillName);
  }
  writeConfig(configPath, cfg);
}

export function listAvailableSkills(projectRoot: string): SkillStatus[] {
  const paths = vaultPathsFor(projectRoot);
  if (!existsSync(paths.skillsAvailable)) return [];

  const results: SkillStatus[] = [];
  for (const entry of readdirSync(paths.skillsAvailable, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const { name } = entry;
    const enabled = existsSync(join(paths.skillsEnabled, name));
    const meta = readSkillMeta(join(paths.skillsAvailable, name));
    results.push({
      name,
      available: true,
      enabled,
      description: meta.description ?? "",
      postEnableHint: meta.postEnableHint,
    });
  }
  return results;
}

export function installBundledSkills(projectRoot: string): string[] {
  const paths = vaultPathsFor(projectRoot);
  mkdirSync(paths.skillsAvailable, { recursive: true });
  mkdirSync(paths.skillsEnabled, { recursive: true });

  const installed: string[] = [];
  let entries: Dirent<string>[] = [];
  try {
    entries = readdirSync(BUNDLED_SKILLS_DIR, { withFileTypes: true });
  } catch {
    return installed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const { name } = entry;
    const dest = join(paths.skillsAvailable, name);
    if (!existsSync(dest)) {
      cpSync(join(BUNDLED_SKILLS_DIR, name), dest, { recursive: true });
      installed.push(name);
    }
  }
  return installed;
}

export type EnableResult = {
  postEnableHint?: string | undefined;
  // First section of the skill's README.md (everything up to the first H2).
  // Surfaced to the user inline after enabling so they understand what
  // changed without having to open the file.
  readmeIntro?: string | undefined;
};

function readReadmeIntro(skillDir: string): string | undefined {
  const path = join(skillDir, "README.md");
  if (!existsSync(path)) return undefined;
  try {
    const text = readFileSync(path, "utf8");
    const h2 = text.indexOf("\n## ");
    return (h2 === -1 ? text : text.slice(0, h2)).trim();
  } catch {
    return undefined;
  }
}

export function enableSkill(projectRoot: string, skillName: string): EnableResult {
  const paths = vaultPathsFor(projectRoot);
  const availDir = join(paths.skillsAvailable, skillName);
  const enabledDir = join(paths.skillsEnabled, skillName);

  if (existsSync(enabledDir)) return {};
  mkdirSync(paths.skillsEnabled, { recursive: true });

  try {
    cpSync(availDir, enabledDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`找不到技能 "${skillName}"。运行 \`duoshe skill list\` 查看所有可用技能。`);
    }
    throw err;
  }

  updateEnabledSkillsConfig(paths.config, skillName, true);
  return {
    postEnableHint: readSkillMeta(availDir).postEnableHint,
    readmeIntro: readReadmeIntro(availDir),
  };
}

// Returns combined detectors + dirHints from all currently enabled skills.
// Called by fullScan so that enabled skills automatically enrich the scan.
export function getEnabledSkillExtensions(projectRoot: string): SkillExtensions {
  const paths = vaultPathsFor(projectRoot);
  const detectors: string[] = [];
  const dirHints: Record<string, string> = {};

  if (!existsSync(paths.skillsEnabled)) return { detectors, dirHints };

  for (const entry of readdirSync(paths.skillsEnabled, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const meta = readSkillMeta(join(paths.skillsEnabled, entry.name));
    if (meta.detectors) detectors.push(...meta.detectors);
    if (meta.dirHints) Object.assign(dirHints, meta.dirHints);
  }

  return { detectors, dirHints };
}

export function disableSkill(projectRoot: string, skillName: string): void {
  const paths = vaultPathsFor(projectRoot);
  const enabledDir = join(paths.skillsEnabled, skillName);
  if (!existsSync(enabledDir)) return;
  rmSync(enabledDir, { recursive: true, force: true });
  updateEnabledSkillsConfig(paths.config, skillName, false);
}
