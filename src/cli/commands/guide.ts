import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import kleur from "kleur";
import { readConfig, writeConfig } from "../../core/vault/config.js";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { log } from "../log.js";

const BEGIN_GUIDE = "<!-- BEGIN DUOSHE-GUIDE -->";
const END_GUIDE = "<!-- END DUOSHE-GUIDE -->";

type GuideAnswers = {
  overview: string;
  conventions: string[];
  gotchas: string[];
};

function splitList(answer: string): string[] {
  return answer
    .split(/[;\n；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function bulletList(items: string[]): string {
  if (items.length === 0) return "- _(暂无)_";
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
  return Boolean(a.overview || a.conventions.length || a.gotchas.length);
}

function renderProjectGuide(a: GuideAnswers): string {
  return [
    "### 项目简介",
    "",
    a.overview || "_未填写。_",
    "",
    "### AI 必须记住的规矩",
    "",
    bulletList(a.conventions),
    "",
    "### 不要乱动的地方",
    "",
    bulletList(a.gotchas),
  ].join("\n");
}

function hint(text: string): void {
  log.raw(kleur.gray(`     例：${text}`));
}

async function promptAnswers(): Promise<GuideAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    log.blank();
    log.raw(kleur.bold("  3 个小问题，帮 AI 认识这个项目"));
    log.raw(kleur.gray("  多个答案用分号隔开，不知道的直接回车跳过。"));
    log.blank();

    log.raw(kleur.bold("  1. 这个项目是做什么的？给谁用？"));
    hint("给中小电商团队用的库存管理后台，用户是仓库管理员");
    const overview = (await rl.question("  > ")).trim();

    log.blank();
    log.raw(kleur.bold("  2. 有什么规矩 AI 必须记住？"));
    hint("数据库操作走 service 层，不能在 route 里直接查；错误码统一在 errors/codes.ts");
    const conventions = splitList(await rl.question("  > "));

    log.blank();
    log.raw(kleur.bold("  3. 有什么地方绝对不能乱动？"));
    hint("发货状态机 shipping.ts；库存扣减的分布式锁逻辑");
    const gotchas = splitList(await rl.question("  > "));

    return { overview, conventions, gotchas };
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
  upsertGuideSection(paths.project, "项目引导", renderProjectGuide(answers));

  const cfg = readConfig(paths.config);
  if (cfg) {
    cfg.guideCompletedAt = new Date().toISOString();
    writeConfig(paths.config, cfg);
  }

  log.blank();
  log.ok("已写入 .duoshe/PROJECT.md。AI 下次进来就能看到这些内容了。");
  log.raw(kleur.gray('  之后想到什么，随时用 `duoshe remember "..."` 记一条。'));
}

export function registerGuideCommand(program: Command): void {
  program
    .command("guide")
    .description("回答 3 个核心问题，让 AI 认识这个项目（1 分钟）")
    .action(async () => {
      try {
        await runGuide();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
