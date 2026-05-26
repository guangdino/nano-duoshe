import type { Command } from "commander";
import kleur from "kleur";
import { CandidateStore } from "../../core/candidate/index.js";
import { CANDIDATE_TYPES, type CandidateType } from "../../core/types.js";
import { vaultExists } from "../../core/vault/index.js";
import { log } from "../log.js";

type RememberOptions = {
  type: string;
  title?: string;
  target?: string;
  sessionId?: string;
  source?: string;
};

function isCandidateType(t: string): t is CandidateType {
  return (CANDIDATE_TYPES as readonly string[]).includes(t);
}

async function runRemember(content: string, opts: RememberOptions): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }
  if (!isCandidateType(opts.type)) {
    log.err(`Invalid --type "${opts.type}". Valid types: ${CANDIDATE_TYPES.join(", ")}`);
    process.exit(1);
  }
  if (content.trim().length === 0) {
    log.err("Content cannot be empty.");
    process.exit(1);
  }

  const store = new CandidateStore(root);
  const input: Parameters<CandidateStore["add"]>[0] = {
    type: opts.type,
    content,
  };
  if (opts.title !== undefined) input.title = opts.title;
  if (opts.target !== undefined) input.target = opts.target;
  if (opts.sessionId !== undefined) input.sourceSessionId = opts.sessionId;
  if (opts.source !== undefined) input.source = opts.source;

  const c = store.add(input);

  log.ok(`added candidate ${kleur.cyan(c.id)} (${c.type}) — status: pending`);
  log.info(`title: ${c.title}`);
  log.info(`target: ${c.target}`);
  log.blank();
  log.raw(`Next: ${kleur.cyan("duoshe review")} to see pending candidates,`);
  log.raw(`      ${kleur.cyan(`duoshe publish ${c.id}`)} to write it to .duoshe/${c.target}`);
}

export function registerRememberCommand(program: Command): void {
  program
    .command("remember <content>")
    .description("quickly add a candidate memory (status: pending). Use `duoshe review` to see them, `duoshe publish <id>` to write to long-term Markdown.")
    .option(
      "-t, --type <type>",
      `candidate type (${CANDIDATE_TYPES.join("|")})`,
      "decision",
    )
    .option("--title <title>", "short title; defaults to first line of <content>")
    .option("--target <file>", "override target Markdown (DECISIONS.md | TROUBLESHOOTING.md | MODULES.md | PROJECT.md)")
    .option("--session-id <id>", "link this candidate to a source session id")
    .option("--source <source>", "free-form source tag (e.g. 'claude-code', 'manual')")
    .action(async (content: string, opts: RememberOptions) => {
      try {
        await runRemember(content, opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
