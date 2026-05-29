import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import kleur from "kleur";
import { CandidateStore } from "../../core/candidate/index.js";
import { CANDIDATE_TYPES, type CandidateType } from "../../core/types.js";
import { vaultExists } from "../../core/vault/index.js";
import { nudgeAfterRemember } from "../assistant.js";
import { log } from "../log.js";

type RememberOptions = {
  type?: string;
  title?: string;
  target?: string;
  sessionId?: string;
  source?: string;
};

const TYPE_MENU: { label: string; type: CandidateType }[] = [
  { label: "我们决定了某件事（技术选型、架构方向等）", type: "decision" },
  { label: "发现了一个坑，或者修好了一个 bug", type: "troubleshooting" },
  { label: "某个模块有特殊规则，要让 AI 知道", type: "module_boundary" },
  { label: "其他项目信息", type: "project_fact" },
];

function isCandidateType(t: string): t is CandidateType {
  return (CANDIDATE_TYPES as readonly string[]).includes(t);
}

async function pickTypeInteractive(): Promise<CandidateType> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    log.blank();
    log.raw(kleur.bold("  这条记录属于哪种情况？"));
    for (let i = 0; i < TYPE_MENU.length; i++) {
      log.raw(`  ${kleur.cyan(String(i + 1))}. ${TYPE_MENU[i]!.label}`);
    }
    log.blank();
    const answer = (await rl.question("  请输入序号（默认 1）> ")).trim();
    const idx = answer === "" ? 0 : Number.parseInt(answer, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= TYPE_MENU.length) {
      return "decision";
    }
    return TYPE_MENU[idx]!.type;
  } finally {
    rl.close();
  }
}

async function runRemember(content: string, opts: RememberOptions): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }
  if (content.trim().length === 0) {
    log.err("内容不能为空。");
    process.exit(1);
  }

  let resolvedType: CandidateType;
  if (opts.type !== undefined) {
    if (!isCandidateType(opts.type)) {
      log.err(`类型 "${opts.type}" 无效。可选值：${CANDIDATE_TYPES.join(", ")}`);
      process.exit(1);
    }
    resolvedType = opts.type;
  } else if (process.stdin.isTTY && process.stdout.isTTY) {
    resolvedType = await pickTypeInteractive();
  } else {
    resolvedType = "decision";
  }

  const store = new CandidateStore(root);
  const input: Parameters<CandidateStore["add"]>[0] = {
    type: resolvedType,
    content,
  };
  if (opts.title !== undefined) input.title = opts.title;
  if (opts.target !== undefined) input.target = opts.target;
  if (opts.sessionId !== undefined) input.sourceSessionId = opts.sessionId;
  if (opts.source !== undefined) input.source = opts.source;

  const c = store.add(input);

  log.blank();
  log.ok(`已记录：${kleur.bold(c.title)}`);
  log.raw(kleur.gray(`  将保存到 .duoshe/${c.target}，等你确认后正式生效。`));
  log.raw(kleur.gray(`  运行 ${kleur.cyan("duoshe review")} 确认或丢弃。`));

  nudgeAfterRemember(root, content.length);
}

export function registerRememberCommand(program: Command): void {
  program
    .command("remember <content>")
    .description("记录一条知识（决策、踩坑、模块规则等），暂存为待确认状态")
    .option(
      "-t, --type <type>",
      `指定类型（${CANDIDATE_TYPES.join("|")}），不指定则交互选择`,
    )
    .option("--title <title>", "自定义标题（默认取内容第一行）")
    .option("--target <file>", "覆盖目标文件（DECISIONS.md | TROUBLESHOOTING.md | MODULES.md | PROJECT.md）")
    .option("--session-id <id>", "关联来源 session id")
    .option("--source <source>", "来源标签（如 'claude-code'、'manual'）")
    .action(async (content: string, opts: RememberOptions) => {
      try {
        await runRemember(content, opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
