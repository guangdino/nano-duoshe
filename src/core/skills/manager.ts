import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
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

type SkillJson = { name?: string; description?: string; postEnableHint?: string };

function readSkillMeta(skillDir: string): SkillJson {
  const metaPath = join(skillDir, "skill.json");
  try {
    return JSON.parse(readFileSync(metaPath, "utf8")) as SkillJson;
  } catch {
    return {};
  }
}

function updateEnabledSkillsConfig(
  configPath: string,
  skillName: string,
  enable: boolean,
): void {
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
  let entries;
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

export function enableSkill(projectRoot: string, skillName: string): string | undefined {
  const paths = vaultPathsFor(projectRoot);
  const availDir = join(paths.skillsAvailable, skillName);
  const enabledDir = join(paths.skillsEnabled, skillName);

  if (existsSync(enabledDir)) return undefined;
  mkdirSync(paths.skillsEnabled, { recursive: true });

  try {
    cpSync(availDir, enabledDir, { recursive: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `skill "${skillName}" not in available skills. Run \`duoshe skill list\` to see options.`,
      );
    }
    throw err;
  }

  updateEnabledSkillsConfig(paths.config, skillName, true);
  return readSkillMeta(availDir).postEnableHint;
}

export function disableSkill(projectRoot: string, skillName: string): void {
  const paths = vaultPathsFor(projectRoot);
  const enabledDir = join(paths.skillsEnabled, skillName);
  if (!existsSync(enabledDir)) return;
  rmSync(enabledDir, { recursive: true, force: true });
  updateEnabledSkillsConfig(paths.config, skillName, false);
}
