import type { Command } from "commander";
import kleur from "kleur";
import { CandidateStore, publishToMarkdown } from "../../core/candidate/index.js";
import { reindex } from "../../core/index/index.js";
import { CANDIDATE_STATUSES, type Candidate, type CandidateStatus } from "../../core/types.js";
import { vaultExists } from "../../core/vault/index.js";
import { log } from "../log.js";

function isStatus(s: string): s is CandidateStatus {
  return (CANDIDATE_STATUSES as readonly string[]).includes(s);
}

function ensureVault(): string {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }
  return root;
}

function shortDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

function previewContent(content: string, max = 120): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function printCandidate(c: Candidate): void {
  const statusColor: Record<CandidateStatus, (s: string) => string> = {
    pending: kleur.yellow,
    published: kleur.green,
    accepted: kleur.green,
    rejected: kleur.gray,
  };
  const tag = statusColor[c.status](`[${c.status}]`);
  log.raw(`${kleur.cyan(c.id)}  ${tag}  ${kleur.bold(`(${c.type})`)}  ${c.title}`);
  log.raw(`  ${kleur.gray(`→ ${c.target}  ·  ${shortDate(c.createdAt)}`)}`);
  log.raw(`  ${kleur.gray(previewContent(c.content))}`);
  log.blank();
}

type ReviewOptions = {
  status: string;
};

async function runReview(opts: ReviewOptions): Promise<void> {
  const root = ensureVault();

  if (!isStatus(opts.status)) {
    log.err(`Invalid --status "${opts.status}". Valid: ${CANDIDATE_STATUSES.join(", ")}`);
    process.exit(1);
  }

  const store = new CandidateStore(root);
  const list = store.listByStatus(opts.status);

  if (list.length === 0) {
    log.info(`No ${opts.status} candidates.`);
    if (opts.status === "pending") {
      log.blank();
      log.raw(`Tip: add one with ${kleur.cyan('duoshe remember "..." --type decision')}`);
    }
    return;
  }

  log.step(`${list.length} ${opts.status} candidate(s)`);
  log.blank();
  for (const c of list) printCandidate(c);

  if (opts.status === "pending") {
    log.raw(`Publish:   ${kleur.cyan("duoshe publish <id>")}`);
    log.raw(`Reject:    ${kleur.cyan("duoshe reject <id>")}`);
  }
}

async function runPublish(id: string): Promise<void> {
  const root = ensureVault();
  const store = new CandidateStore(root);

  const c = store.findById(id);
  if (!c) {
    log.err(`Candidate not found: ${id}`);
    log.info(`Run \`duoshe review\` to see pending candidates.`);
    process.exit(1);
  }

  if (c.status === "rejected") {
    log.err(`Candidate ${id} was rejected on ${c.rejectedAt}; cannot publish.`);
    process.exit(1);
  }

  log.step(`Publishing ${kleur.cyan(id)} → .duoshe/${c.target}`);

  const updated = store.markPublished(id);
  const result = publishToMarkdown({ projectRoot: root, candidate: updated });

  if (result.action === "already-published") {
    log.info("section with this id already exists in the target file — skipped append");
  } else {
    log.ok(`appended ${result.bytesWritten} byte(s) to ${result.targetPath}`);
  }
  log.ok(`status: pending → ${kleur.green("published")}`);

  try {
    const r = reindex(root);
    log.info(`reindexed ${r.sectionsIndexed} section(s) (${r.durationMs}ms)`);
  } catch (err) {
    log.warn(`auto-reindex failed: ${err instanceof Error ? err.message : String(err)}`);
    log.info("run `duoshe reindex` manually to refresh search index");
  }
}

async function runReject(id: string): Promise<void> {
  const root = ensureVault();
  const store = new CandidateStore(root);

  const c = store.findById(id);
  if (!c) {
    log.err(`Candidate not found: ${id}`);
    process.exit(1);
  }

  if (c.status === "published") {
    log.err(`Candidate ${id} was already published; cannot reject.`);
    process.exit(1);
  }
  if (c.status === "rejected") {
    log.info(`Candidate ${id} was already rejected on ${c.rejectedAt}.`);
    return;
  }

  store.markRejected(id);
  log.ok(`rejected ${kleur.cyan(id)} (archived to CANDIDATES/rejected.jsonl)`);
}

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("list pending candidate memories awaiting your decision")
    .option(
      "-s, --status <status>",
      `filter by status (${CANDIDATE_STATUSES.join("|")})`,
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
    .description("publish a candidate memory to its target Markdown file (e.g. DECISIONS.md), with a traceability footer")
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
    .description("reject a candidate memory; it will be archived in CANDIDATES/rejected.jsonl")
    .action(async (id: string) => {
      try {
        await runReject(id);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
