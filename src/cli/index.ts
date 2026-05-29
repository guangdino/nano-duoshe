#!/usr/bin/env node
import kleur from "kleur";
import { Command } from "commander";
import { checkForUpdate } from "../core/update/check.js";
import { getVersion } from "../core/version.js";
import { registerGraphCommand } from "./commands/graph.js";
import { registerGuideCommand } from "./commands/guide.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerRememberCommand } from "./commands/remember.js";
import { registerReviewCommand } from "./commands/review.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerSessionCommand } from "./commands/session.js";
import { registerSkillCommand } from "./commands/skill.js";
import { registerSyncCommand } from "./commands/sync.js";
import { registerUpgradeCommand } from "./commands/upgrade.js";

const program = new Command();

program
  .name("duoshe")
  .description(
    "DuoShe — local-first project memory layer for AI coding agents (Claude Code / Codex / Cursor)",
  )
  .version(getVersion(), "-v, --version", "print version")
  .helpOption("-h, --help", "show help");

registerInitCommand(program);
registerGuideCommand(program);
registerSearchCommand(program);
registerRememberCommand(program);
registerReviewCommand(program);
registerSessionCommand(program);
registerSyncCommand(program);
registerMcpCommand(program);
registerSkillCommand(program);
registerGraphCommand(program);
registerUpgradeCommand(program);

// Soft update notifier — runs after the command finishes, never blocks it.
// Suppressed for `upgrade` (it does its own check), `--version`, and `--help`.
async function maybeNotifyUpdate(): Promise<void> {
  const argv2 = process.argv[2] ?? "";
  if (argv2 === "upgrade" || argv2 === "-v" || argv2 === "--version" || argv2 === "-h" || argv2 === "--help") {
    return;
  }
  const info = await checkForUpdate();
  if (!info?.hasUpdate) return;
  process.stderr.write(
    `\n${kleur.gray(`  💡 nano-duoshe 有新版本：${info.current} → ${kleur.bold(info.latest)}（运行 ${kleur.cyan("duoshe upgrade")} 查看升级方法）`)}\n`,
  );
}

program
  .parseAsync(process.argv)
  .then(() => maybeNotifyUpdate())
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`duoshe: ${msg}\n`);
    process.exit(1);
  });
