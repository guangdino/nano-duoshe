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
  .description("DuoShe（夺舍）— 本地优先的项目记忆层，让 Claude Code / Codex / Cursor 等 AI 工具真正认识你的项目")
  .version(getVersion(), "-v, --version", "显示版本号")
  .helpOption("-h, --help", "显示帮助");

// Default action: when user just runs `duoshe` with no subcommand,
// show a warm welcome instead of commander's default error.
program.action(() => {
  const here = process.cwd();
  process.stdout.write(`\n${kleur.bold("  DuoShe（夺舍） — 让 AI 真正认识你的项目")}\n\n`);
  process.stdout.write(`  ${kleur.gray("项目记忆层，本地优先。给 Claude Code / Codex / Cursor 用。")}\n\n`);
  process.stdout.write(`  ${kleur.bold("第一次用？")}  在项目目录里运行：\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe init")}     ${kleur.gray(`# 在 ${here} 初始化记忆库`)}\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe guide")}    ${kleur.gray("# 回答 7 个小问题，让 AI 认识这个项目")}\n\n`);
  process.stdout.write(`  ${kleur.bold("常用命令：")}\n`);
  process.stdout.write(`      ${kleur.cyan('duoshe remember "..."')}    记一条重要的事\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe review")}             看待确认的记录\n`);
  process.stdout.write(`      ${kleur.cyan('duoshe search "..."')}       在项目记忆里搜索\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe upgrade")}            检查新版本\n\n`);
  process.stdout.write(`  ${kleur.gray("完整命令列表：")}${kleur.cyan("duoshe --help")}\n\n`);
});

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
