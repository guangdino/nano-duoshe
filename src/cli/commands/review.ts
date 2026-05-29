import type { Command } from "commander";
import kleur from "kleur";
import { CandidateStore, publishToMarkdown } from "../../core/candidate/index.js";
import { reindex } from "../../core/index/index.js";
import { CANDIDATE_STATUSES, type Candidate, type CandidateStatus } from "../../core/types.js";
import { vaultExists } from "../../core/vault/index.js";
import { nudgeAfterPublish, nudgeAfterReject, nudgeAfterReviewEmpty } from "../assistant.js";
import { log } from "../log.js";

function isStatus(s: string): s is CandidateStatus {
  return (CANDIDATE_STATUSES as readonly string[]).includes(s);
}

function ensureVault(): string {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }
  return root;
}

function shortDate(iso: string): string {
  return iso.slice(0, 10);
}

function previewContent(content: string, max = 120): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

const TYPE_LABEL: Record<string, string> = {
  decision: "决策",
  troubleshooting: "踩坑",
  module_boundary: "模块规则",
  project_fact: "项目信息",
  user_preference: "习惯偏好",
};

function printCandidate(c: Candidate): void {
  const label = TYPE_LABEL[c.type] ?? c.type;
  log.raw(`${kleur.cyan(c.id)}  ${kleur.yellow(`[${label}]`)}  ${kleur.bold(c.title)}`);
  log.raw(`  ${kleur.gray(`${shortDate(c.createdAt)}  →  .duoshe/${c.target}`)}`);
  log.raw(`  ${kleur.gray(previewContent(c.content))}`);
  log.blank();
}

type ReviewOptions = {
  status: string;
};

async function runReview(opts: ReviewOptions): Promise<void> {
  const root = ensureVault();

  if (!isStatus(opts.status)) {
    log.err(`状态 "${opts.status}" 无效。可选：${CANDIDATE_STATUSES.join(", ")}`);
    process.exit(1);
  }

  const store = new CandidateStore(root);
  const list = store.listByStatus(opts.status);

  if (list.length === 0) {
    if (opts.status === "pending") {
      log.info("没有待确认的记录。");
      nudgeAfterReviewEmpty(root);
    } else {
      log.info(`没有状态为"${opts.status}"的记录。`);
    }
    return;
  }

  log.blank();
  log.raw(kleur.bold(`  有 ${list.length} 条记录等你确认：`));
  log.blank();
  for (const c of list) printCandidate(c);

  if (opts.status === "pending") {
    log.raw(`  保存：${kleur.cyan("duoshe save <id>")}   或者   ${kleur.cyan("duoshe publish <id>")}`);
    log.raw(`  丢弃：${kleur.cyan("duoshe drop <id>")}   或者   ${kleur.cyan("duoshe reject <id>")}`);
    log.blank();
  }
}

async function runPublish(id: string): Promise<void> {
  const root = ensureVault();
  const store = new CandidateStore(root);

  const c = store.findById(id);
  if (!c) {
    log.err(`找不到记录 ${id}。运行 \`duoshe review\` 查看待确认的记录。`);
    process.exit(1);
  }

  if (c.status === "rejected") {
    log.err(`这条记录已被丢弃（${c.rejectedAt}），无法保存。`);
    process.exit(1);
  }

  const updated = store.markPublished(id);
  const result = publishToMarkdown({ projectRoot: root, candidate: updated });

  if (result.action !== "already-published") {
    log.ok(`已保存到 .duoshe/${c.target}`);
  } else {
    log.info(`这条记录已经保存过了，跳过。`);
  }

  try {
    reindex(root);
  } catch {
    // reindex failure is non-fatal; search may be stale until next reindex
  }

  nudgeAfterPublish(root);
}

async function runReject(id: string): Promise<void> {
  const root = ensureVault();
  const store = new CandidateStore(root);

  const c = store.findById(id);
  if (!c) {
    log.err(`找不到记录 ${id}。`);
    process.exit(1);
  }

  if (c.status === "published") {
    log.err(`这条记录已经保存过了，无法丢弃。`);
    process.exit(1);
  }
  if (c.status === "rejected") {
    log.info(`这条记录已经丢弃过了（${c.rejectedAt}）。`);
    return;
  }

  store.markRejected(id);
  log.ok(`已丢弃。`);

  nudgeAfterReject(root);
}

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("查看待确认的记录，决定保存还是丢弃")
    .option(
      "-s, --status <status>",
      `按状态筛选（${CANDIDATE_STATUSES.join("|")}）`,
      "pending",
    )
    .action(async (opts: ReviewOptions) => {
      try {
        await runReview(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("publish <candidateId>")
    .aliases(["save"])
    .description("把一条待确认记录正式保存到项目记忆（如 DECISIONS.md）")
    .action(async (id: string) => {
      try {
        await runPublish(id);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("reject <candidateId>")
    .aliases(["drop"])
    .description("丢弃一条待确认记录（归档到 CANDIDATES/rejected.jsonl）")
    .action(async (id: string) => {
      try {
        await runReject(id);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
