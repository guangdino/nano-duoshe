import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import kleur from "kleur";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
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

async function promptAnswers(): Promise<GuideAnswers> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    log.raw(kleur.bold("DuoShe guided setup"));
    log.raw("Answer briefly. Use semicolons for multiple items. Press Enter to skip.");
    log.blank();

    const overview = (await rl.question("What is this project, in one sentence? ")).trim();
    const users = (await rl.question("Who is it for? ")).trim();
    const inspectFirst = splitList(
      await rl.question("Which directories/files should an AI inspect first? "),
    );
    const conventions = splitList(
      await rl.question("Project conventions or style rules to remember? "),
    );
    const gotchas = splitList(await rl.question("Anything AI must not break or should be careful with? "));
    const decisions = splitList(await rl.question("Important decisions already made? "));
    const nextTasks = splitList(await rl.question("Current next tasks? "));

    return { overview, users, inspectFirst, conventions, gotchas, decisions, nextTasks };
  } finally {
    rl.close();
  }
}

export async function runGuide(root = process.cwd()): Promise<void> {
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log.warn("Guided setup needs an interactive terminal. Run `duoshe guide` in a TTY.");
    return;
  }

  const answers = await promptAnswers();
  if (!hasUsefulAnswer(answers)) {
    log.info("No guided notes added.");
    return;
  }

  const paths = vaultPathsFor(root);
  upsertGuideSection(paths.project, "Guided project brief", renderProjectGuide(answers));
  upsertGuideSection(paths.codeMap, "Guided code routing", renderCodeMapGuide(answers));
  upsertGuideSection(paths.decisions, "Guided decisions", renderDecisionGuide(answers));
  upsertGuideSection(paths.todo, "Guided next steps", renderTodoGuide(answers));

  log.blank();
  log.ok("updated guided sections in .duoshe/PROJECT.md, CODEMAP.md, DECISIONS.md, and TODO.md");
}

export function registerGuideCommand(program: Command): void {
  program
    .command("guide")
    .description("interactive setup that asks a few questions and writes guided project memory")
    .action(async () => {
      try {
        await runGuide();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
