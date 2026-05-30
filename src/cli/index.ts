#!/usr/bin/env node
import kleur from "kleur";
import { Command } from "commander";
import { checkForUpdate } from "../core/update/check.js";
import { getVersion } from "../core/version.js";
import { registerGraphCommand } from "./commands/graph.js";
import { registerGuideCommand } from "./commands/guide.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerProfileCommand } from "./commands/profile.js";
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
  .helpOption("-h, --help", "显示帮助")
  .showSuggestionAfterError(true)
  .configureOutput({
    writeErr: (s) => process.stderr.write(translateCommanderError(s)),
  });

// Translates the most common commander-emitted English errors into Chinese.
// Anything we don't recognize falls through unchanged.
function translateCommanderError(s: string): string {
  return s
    .replace(/^error: missing required argument '([^']+)'/, "错误：缺少必填参数 '$1'")
    .replace(/^error: unknown option '([^']+)'/, "错误：不认识的选项 '$1'")
    .replace(/^error: unknown command '([^']+)'/, "错误：不认识的命令 '$1'")
    .replace(/^error: option '([^']+)' argument missing/, "错误：选项 '$1' 缺少参数值")
    .replace(/^error: too many arguments/, "错误：参数太多")
    .replace(/\(Did you mean ([^)]+)\?\)/, "（你是不是想说 $1？）");
}

// Default action: when user runs `duoshe` with no subcommand AT ALL,
// show a warm welcome. If they typed something that didn't match a known
// command, fall through to suggest-on-typo (handled by the unknown-command
// path below).
program.action(() => {
  // Guard: if user did pass args, commander only lands here when nothing
  // matched. In that case, route to the unknown-command suggester instead of
  // the welcome screen.
  if (process.argv.slice(2).length > 0) {
    suggestUnknownCommand(process.argv[2] ?? "");
    process.exit(1);
  }
  const here = process.cwd();
  process.stdout.write(`\n${kleur.bold("  DuoShe（夺舍） — 让 AI 真正认识你的项目")}\n\n`);
  process.stdout.write(`  ${kleur.gray("项目记忆层，本地优先。给 Claude Code / Codex / Cursor 用。")}\n\n`);
  process.stdout.write(`  ${kleur.bold("第一次用？")}  在项目目录里运行：\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe init")}     ${kleur.gray(`# 在 ${here} 初始化记忆库`)}\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe guide")}    ${kleur.gray("# 回答 3 个核心问题，让 AI 认识这个项目")}\n\n`);
  process.stdout.write(`  ${kleur.bold("常用命令：")}\n`);
  process.stdout.write(`      ${kleur.cyan('duoshe remember "..."')}    记一条重要的事\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe review")}             看待确认的记录\n`);
  process.stdout.write(`      ${kleur.cyan('duoshe search "..."')}       在项目记忆里搜索\n`);
  process.stdout.write(`      ${kleur.cyan("duoshe upgrade")}            检查新版本\n\n`);
  process.stdout.write(`  ${kleur.gray("完整命令列表：")}${kleur.cyan("duoshe --help")}\n\n`);
});

function suggestUnknownCommand(typed: string): void {
  const knownCommands = program.commands.map((c) => c.name());
  const closest = closestMatch(typed, knownCommands);
  process.stderr.write(`错误：不认识的命令 '${typed}'`);
  if (closest) process.stderr.write(`（你是不是想说 ${kleur.cyan(closest)}？）`);
  process.stderr.write("\n");
  process.stderr.write(`运行 ${kleur.cyan("duoshe --help")} 查看所有命令。\n`);
}

// Levenshtein-based pick: returns the closest match if distance ≤ 3, else null.
function closestMatch(input: string, candidates: string[]): string | null {
  if (!input) return null;
  let bestName: string | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const d = editDistance(input, c);
    if (d < bestDist) {
      bestDist = d;
      bestName = c;
    }
  }
  return bestDist <= 3 ? bestName : null;
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

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
registerProfileCommand(program);
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
