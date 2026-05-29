import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Command } from "commander";
import kleur from "kleur";
import {
  detectExistingShells,
  syncShells,
  uninstallShells,
} from "../../adapters/claude-md.js";
import { fullScan } from "../../core/scanner/index.js";
import { installBundledSkills } from "../../core/skills/manager.js";
import { initVault, vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { runGuide } from "./guide.js";
import { log } from "../log.js";

type InitOptions = {
  force?: boolean;
  quick?: boolean;
  withHooks?: boolean;
  guided?: boolean;
  shells?: "auto" | "always" | "never";
};

function shouldCreateShells(shells: InitOptions["shells"], anyExists: boolean): boolean {
  if (shells === "always") return true;
  if (shells === "never") return false;
  return !anyExists;
}

async function runInit(opts: InitOptions): Promise<void> {
  const root = process.cwd();
  const start = Date.now();

  log.step(`Initializing DuoShe in ${kleur.bold(root)}`);

  if (vaultExists(root) && !opts.force) {
    log.warn(".duoshe/ already exists. Use --force to overwrite, or `duoshe rescan` for non-destructive refresh.");
    process.exit(1);
  }

  log.step("Scanning project");
  const { scan, git } = fullScan(root, opts.quick === true ? { quick: true } : {});
  log.ok(`Detected ${scan.stacks.length} stack(s): ${scan.stacks.map((s) => s.language + (s.framework ? `/${s.framework}` : "")).join(", ") || "(none)"}`);
  log.ok(`Walked ${scan.totalFiles} files (${scan.totalSourceFiles} source files) across ${scan.topDirs.length} top-level director(ies)`);
  if (git.isGitRepo) {
    log.ok(`Git repo: ${git.hotFiles?.length ?? 0} hot file(s), ${git.contributorCount ?? "?"} contributor(s)`);
  } else {
    log.info("Not a git repo — skipping git history insights");
  }

  log.step("Writing vault files");
  const init = initVault({ projectRoot: root, scan, git, force: opts.force === true });
  for (const [name, action] of Object.entries(init.fileActions)) {
    if (action === "wrote") log.ok(`wrote .duoshe/${name}`);
    else if (action === "skipped-existing") log.info(`kept existing .duoshe/${name}`);
    else if (action === "skipped-confirmed") log.info(`preserved user-confirmed .duoshe/${name}`);
  }

  log.step("Installing bundled skills");
  const installedSkills = installBundledSkills(root);
  if (installedSkills.length > 0) {
    log.ok(`installed ${installedSkills.length} skill(s) to .duoshe/SKILLS/available/: ${installedSkills.join(", ")}`);
    log.info(`Skills are disabled by default — run \`duoshe skill enable <name>\` to activate`);
  } else {
    log.info("skills already installed (skipped)");
  }

  log.step("Syncing CLAUDE.md / AGENTS.md shell blocks");
  const existing = detectExistingShells(root);
  const anyExists = existing.some((e) => e.exists);
  const createIfMissing = shouldCreateShells(opts.shells, anyExists);
  if (opts.shells === undefined && anyExists) {
    log.info("found existing CLAUDE.md/AGENTS.md — appending DuoShe block only (will not create the other)");
  } else if (createIfMissing) {
    log.info("creating fresh CLAUDE.md and AGENTS.md as thin shells");
  }
  const shellResults = syncShells(root, { createIfMissing });
  for (const r of shellResults) {
    if (r.status === "created") log.ok(`created ${r.file} (thin shell pointing at .duoshe/)`);
    else if (r.status === "appended") log.ok(`appended DuoShe block to ${r.file} (your existing content untouched)`);
    else if (r.status === "updated") log.ok(`updated DuoShe block in ${r.file}`);
    else if (r.status === "unchanged") log.info(`${r.file} block already current`);
    else if (r.status === "skipped-no-existing") log.info(`${r.file} not present, skipped`);
  }

  if (opts.withHooks) {
    log.step("Generating Claude Code hooks template");
    log.warn("hooks template not yet implemented (planned for M6) — coming soon");
  }

  if (opts.guided) {
    log.blank();
    await runGuide(root);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log.blank();
  log.raw(kleur.green().bold("  准备好了。"));
  log.raw(kleur.gray(`  用时 ${elapsed}s`));
  log.blank();
  log.raw(kleur.bold("  现在做一件事就够了："));
  log.raw(`    运行 ${kleur.cyan("duoshe guide")}，回答 7 个小问题，让 AI 真正认识这个项目。`);
  log.blank();
  log.raw(kleur.gray("  之后想到什么，随时用 `duoshe remember \"...\"` 记下来。"));
  log.raw(kleur.gray("  连接到 AI 工具的方法见 .duoshe/SETUP.md。"));
  log.blank();
}

async function runRescan(): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }
  log.step("Re-scanning project");
  const { scan, git } = fullScan(root);
  log.ok(`Detected ${scan.totalFiles} files, ${scan.stacks.length} stack(s)`);

  log.step("Refreshing vault files (user-confirmed sections preserved)");
  const init = initVault({ projectRoot: root, scan, git, force: false });
  for (const [name, action] of Object.entries(init.fileActions)) {
    if (action === "wrote") log.ok(`wrote .duoshe/${name}`);
    else if (action === "skipped-existing") log.info(`kept existing .duoshe/${name} (no --force)`);
    else if (action === "skipped-confirmed") log.info(`preserved user-confirmed .duoshe/${name}`);
  }
  log.blank();
  log.raw(kleur.green("Rescan complete."));
}

async function runUninstall(): Promise<void> {
  const root = process.cwd();
  log.step("Removing DuoShe blocks from CLAUDE.md / AGENTS.md");
  const results = uninstallShells(root);
  for (const r of results) {
    if (r.status === "removed") log.ok(`removed DuoShe block from ${r.file}`);
    else if (r.status === "skipped-no-existing") log.info(`${r.file} not present`);
    else if (r.status === "unchanged") log.info(`${r.file} had no DuoShe block`);
  }
  if (existsSync(resolve(root, ".duoshe"))) {
    log.blank();
    log.raw(kleur.yellow("Note: .duoshe/ was NOT deleted (it contains your memory)."));
    log.raw("  To remove fully, delete the directory manually:");
    log.raw(`    ${kleur.gray(`rm -rf .duoshe/   (or  rmdir /s /q .duoshe  on Windows)`)}`);
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("initialize a .duoshe/ vault in the current project (scans code skeleton, generates PROJECT.md / CODEMAP.md / MODULES.md drafts)")
    .option("--force", "overwrite existing .duoshe/ files (preserves <!-- USER-CONFIRMED --> sections)")
    .option("--quick", "skip git history scan (faster on huge repos)")
    .option("--guided", "ask setup questions after init and write guided memory sections")
    .option("--with-hooks", "also generate Claude Code hooks template (M6)")
    .option(
      "--shells <mode>",
      "CLAUDE.md/AGENTS.md handling: auto | always | never",
      "auto",
    )
    .action(async (opts: InitOptions) => {
      try {
        await runInit(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("rescan")
    .description("re-scan code skeleton; preserves user-confirmed sections in PROJECT.md / MODULES.md")
    .action(async () => {
      try {
        await runRescan();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("uninstall")
    .description("remove DuoShe blocks from CLAUDE.md / AGENTS.md (does not delete .duoshe/)")
    .action(async () => {
      try {
        await runUninstall();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
