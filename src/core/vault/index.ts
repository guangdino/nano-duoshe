import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import type { GitInsights, ProjectScan } from "../types.js";
import { defaultConfig, writeConfig } from "./config.js";
import { vaultPathsFor, type VaultPaths } from "./paths.js";
import {
  renderCodeMapMd,
  renderDecisionsMd,
  renderModulesMd,
  renderProjectMd,
  renderTodoMd,
  renderTroubleshootingMd,
} from "./templates.js";

export { vaultPathsFor, type VaultPaths } from "./paths.js";
export { defaultConfig, readConfig, writeConfig } from "./config.js";

export function vaultExists(projectRoot: string): boolean {
  return existsSync(vaultPathsFor(projectRoot).vault);
}

const USER_CONFIRMED_MARKER = /^<!--\s*USER-CONFIRMED\s*-->\s*$/im;

function isUserConfirmed(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    return USER_CONFIRMED_MARKER.test(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

function writeMd(path: string, content: string, opts: { force: boolean }): "wrote" | "skipped-existing" | "skipped-confirmed" {
  if (existsSync(path)) {
    if (isUserConfirmed(path)) return "skipped-confirmed";
    if (!opts.force) return "skipped-existing";
  }
  writeFileSync(path, content, "utf8");
  return "wrote";
}

export type VaultInitResult = {
  paths: VaultPaths;
  created: boolean;
  fileActions: Record<string, "wrote" | "skipped-existing" | "skipped-confirmed">;
};

export function initVault(opts: {
  projectRoot: string;
  scan: ProjectScan;
  git: GitInsights;
  force?: boolean;
}): VaultInitResult {
  const paths = vaultPathsFor(opts.projectRoot);
  const force = opts.force === true;

  const created = !existsSync(paths.vault);
  mkdirSync(paths.vault, { recursive: true });
  mkdirSync(paths.sessions, { recursive: true });
  mkdirSync(paths.candidates, { recursive: true });
  mkdirSync(paths.skills, { recursive: true });

  if (!existsSync(paths.candidatesPending)) writeFileSync(paths.candidatesPending, "", "utf8");
  if (!existsSync(paths.candidatesAccepted)) writeFileSync(paths.candidatesAccepted, "", "utf8");
  if (!existsSync(paths.candidatesRejected)) writeFileSync(paths.candidatesRejected, "", "utf8");

  const projectName = basename(opts.projectRoot);
  if (!existsSync(paths.config)) {
    writeConfig(
      paths.config,
      defaultConfig({
        projectId: projectName.toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
        projectName,
        vaultPath: paths.vault,
        indexPath: paths.indexDb,
      }),
    );
  }

  const fileActions: VaultInitResult["fileActions"] = {
    "PROJECT.md": writeMd(paths.project, renderProjectMd({ projectName, scan: opts.scan, git: opts.git }), { force }),
    "CODEMAP.md": writeMd(paths.codeMap, renderCodeMapMd({ projectName, scan: opts.scan, git: opts.git }), { force }),
    "DECISIONS.md": writeMd(paths.decisions, renderDecisionsMd(), { force }),
    "TROUBLESHOOTING.md": writeMd(paths.troubleshooting, renderTroubleshootingMd(), { force }),
    "MODULES.md": writeMd(paths.modules, renderModulesMd({ scan: opts.scan }), { force }),
    "TODO.md": writeMd(paths.todo, renderTodoMd(), { force }),
  };

  return { paths, created, fileActions };
}
