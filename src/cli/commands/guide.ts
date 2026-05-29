import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import kleur from "kleur";
import { readConfig, writeConfig } from "../../core/vault/config.js";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { nudgeAfterGuide } from "../assistant.js";
import { log } from "../log.js";

const BEGIN_GUIDE = "<!-- BEGIN DUOSHE-GUIDE -->";
const END_GUIDE = "<!-- END DUOSHE-GUIDE -->";

type GuideAnswers = {
  overview: string;
  users: string;
  inspectFirst: string[];
  conventions: string[];
  gotchas: string[];
  decisions: string[];
  nextTasks: string[];
};

function splitList(answer: string): string[] {
  return answer
    .split(/[;\n；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bulletList(items: string[]): string {
  if (items.length === 0) return "- _(not specified)_";
  return items.map((item) => `- ${item}`).join("\n");
}

function stripGuideSection(md: string): string {
  const start = md.indexOf(BEGIN_GUIDE);
  const end = md.indexOf(END_GUIDE);
  if (start === -1 || end === -1 || end < start) return md.trimEnd();
  return `${md.slice(0, start).trimEnd()}\n${md.slice(end + END_GUIDE.length).trimStart()}`.trimEnd();
}

function upsertGuideSection(path: string, title: string, body: string): void {
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const base = stripGuideSection(current);
  const section = `${BEGIN_GUIDE}\n\n## ${title}\n\n${body.trim()}\n\n${END_GUIDE}\n`;
  writeFileSync(path, `${base}\n\n${section}`, "utf8");
}

function hasUsefulAnswer(a: GuideAnswers): boolean {
  return Boolean(
    a.overview ||
      a.users ||
      a.inspectFirst.length ||
      a.conventions.length ||
      a.gotchas.length ||
      a.decisions.length ||
      a.nextTasks.length,
  );
}

function renderProjectGuide(a: GuideAnswers): string {
  return [
    "### Overview",
    "",
    a.overview || "_Not specified._",
    "",
    "### Primary users",
    "",
    a.users || "_Not specified._",
    "",
    "### Conventions AI agents should remember",
    "",
    bulletList(a.conventions),
    "",
    "### Constraints and gotchas",
    "",
    bulletList(a.gotchas),
  ].join("\n");
}

function renderCodeMapGuide(a: GuideAnswers): string {
  return [
    "### Inspect first",
    "",
    bulletList(a.inspectFirst),
    "",
    "### Routing notes",
    "",
    a.inspectFirst.length === 0
      ? "_Add directories, files, or workflows that agents should inspect before editing._"
      : "Use these paths as the first stop before making code changes.",
  ].join("\n");
}

function renderDecisionGuide(a: GuideAnswers): string {
  return [
    "### Initial decisions",
    "",
    bulletList(a.decisions),
    "",
    "_Review these and convert stable items into normal decision entries when they mature._",
  ].join("\n");
}

function renderTodoGuide(a: GuideAnswers): string {
  return ["### Next tasks", "", bulletList(a.nextTasks)].join("\n");
}

function hint(text: string): void {
  log.raw(kleur.gray(`     例：${text}`));
}

async function promptAnswers(): Promise<GuideAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    log.blank();
    log.raw(kleur.bold("  几个小问题，帮 AI 认识这个项目"));
    log.raw(kleur.gray("  多个答案用分号隔开，不知道的直接回车跳过。"));
    log.blank();

    log.raw(kleur.bold("  1. 这个项目是做什么的？"));
    hint("给中小电商团队用的库存管理后台");
    const overview = (await rl.question("  > ")).trim();

    log.blank();
    log.raw(kleur.bold("  2. 谁在用它？"));
    hint("仓库管理员、运营人员");
    const users = (await rl.question("  > ")).trim();

    log.blank();
    log.raw(kleur.bold("  3. 最重要的几个文件或文件夹是哪些？"));
    hint("src/services/order.ts; src/routes/");
    const inspectFirst = splitList(await rl.question("  > "));

    log.blank();
    log.raw(kleur.bold("  4. 有什么规矩 AI 必须记住？"));
    hint("所有数据库操作走 service 层，不能在 route 里直接查；错误码统一在 errors/codes.ts");
    const conventions = splitList(await rl.question("  > "));

    log.blank();
    log.raw(kleur.bold("  5. 有什么地方绝对不能乱动？"));
    hint("发货状态机（shipping.ts）；库存扣减的分布式锁逻辑");
    const gotchas = splitList(await rl.question("  > "));

    log.blank();
    log.raw(kleur.bold("  6. 已经拍板不用的东西？"));
    hint("不用 ORM，直接写 SQL；不引入 Redux，用 React Context 就够");
    const decisions = splitList(await rl.question("  > "));

    log.blank();
    log.raw(kleur.bold("  7. 现在最紧急要做的事？"));
    hint("修复退款流程的并发 bug；加库存预警通知");
    const nextTasks = splitList(await rl.question("  > "));

    return { overview, users, inspectFirst, conventions, gotchas, decisions, nextTasks };
  } finally {
    rl.close();
  }
}

export async function runGuide(root = process.cwd()): Promise<void> {
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log.warn("问答模式需要在终端中运行。请直接运行 `duoshe guide`。");
    return;
  }

  const answers = await promptAnswers();
  if (!hasUsefulAnswer(answers)) {
    log.blank();
    log.info("没有填写任何内容，跳过保存。");
    return;
  }

  const paths = vaultPathsFor(root);
  upsertGuideSection(paths.project, "Guided project brief", renderProjectGuide(answers));
  upsertGuideSection(paths.codeMap, "Guided code routing", renderCodeMapGuide(answers));
  upsertGuideSection(paths.decisions, "Guided decisions", renderDecisionGuide(answers));
  upsertGuideSection(paths.todo, "Guided next steps", renderTodoGuide(answers));

  // Mark guide as completed so the assistant knows not to nag about it
  const cfg = readConfig(paths.config);
  if (cfg) {
    cfg.guideCompletedAt = new Date().toISOString();
    writeConfig(paths.config, cfg);
  }

  log.blank();
  log.ok("已保存到项目记忆。AI 下次进来就能看到这些内容了。");

  nudgeAfterGuide(root);
}

export function registerGuideCommand(program: Command): void {
  program
    .command("guide")
    .description("回答几个问题，帮 AI 认识这个项目（3 分钟）")
    .action(async () => {
      try {
        await runGuide();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
