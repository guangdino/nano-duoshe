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
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }

  log.step("同步 CLAUDE.md / AGENTS.md 里的 DuoShe 块");
  const existing = detectExistingShells(root);
  const anyExists = existing.some((e) => e.exists);
  const createIfMissing = opts.create === true || !anyExists;

  const results = syncShells(root, { createIfMissing });
  for (const r of results) {
    if (r.status === "created") log.ok(`创建了 ${r.file}`);
    else if (r.status === "appended") log.ok(`已在 ${r.file} 末尾追加 DuoShe 块`);
    else if (r.status === "updated") log.ok(`更新了 ${r.file} 里的 DuoShe 块`);
    else if (r.status === "unchanged") log.info(`${r.file} 的 DuoShe 块已经是最新`);
    else if (r.status === "skipped-no-existing") log.info(`${r.file} 不存在（加 --create 强制创建）`);
  }
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description("同步 CLAUDE.md / AGENTS.md 里的 DuoShe 块（不会覆盖你已有的内容）")
    .option("--create", "如果 CLAUDE.md / AGENTS.md 不存在就一并创建")
    .action(async (opts: SyncOptions) => {
      try {
        await runSync(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
