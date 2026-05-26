import type { Command } from "commander";
import { detectExistingShells, syncShells } from "../../adapters/claude-md.js";
import { vaultExists } from "../../core/vault/index.js";
import { log } from "../log.js";

type SyncOptions = {
  create?: boolean;
};

async function runSync(opts: SyncOptions): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }

  log.step("Syncing CLAUDE.md / AGENTS.md shell blocks");
  const existing = detectExistingShells(root);
  const anyExists = existing.some((e) => e.exists);
  const createIfMissing = opts.create === true || !anyExists;

  const results = syncShells(root, { createIfMissing });
  for (const r of results) {
    if (r.status === "created") log.ok(`created ${r.file}`);
    else if (r.status === "appended") log.ok(`appended DuoShe block to ${r.file}`);
    else if (r.status === "updated") log.ok(`updated DuoShe block in ${r.file}`);
    else if (r.status === "unchanged") log.info(`${r.file} block already current`);
    else if (r.status === "skipped-no-existing") log.info(`${r.file} not present (pass --create to make a fresh shell)`);
  }
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("sync the DuoShe block in CLAUDE.md / AGENTS.md (HTML-comment delimited, never clobbers user content)")
    .option("--create", "also create CLAUDE.md / AGENTS.md if they don't exist")
    .action(async (opts: SyncOptions) => {
      try {
        await runSync(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
