import { existsSync } from "node:fs";
import type { Command } from "commander";
import kleur from "kleur";
import { reindex, search } from "../../core/index/index.js";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { log } from "../log.js";

type SearchOpts = {
  limit: string;
  type?: string;
  noAutoIndex?: boolean;
};

type ReindexOpts = {
  quiet?: boolean;
};

function colorByType(type: string): (s: string) => string {
  switch (type) {
    case "decision":
      return kleur.magenta;
    case "troubleshooting":
      return kleur.red;
    case "module":
      return kleur.blue;
    case "project":
      return kleur.cyan;
    case "session_summary":
      return kleur.gray;
    default:
      return kleur.white;
  }
}

function highlight(snippet: string): string {
  return snippet.replace(/«([^»]+)»/g, (_m, inner: string) => kleur.bgYellow().black(inner));
}

async function runSearch(query: string, opts: SearchOpts): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }

  const paths = vaultPathsFor(root);
  if (!existsSync(paths.indexDb) && !opts.noAutoIndex) {
    log.info("index not built yet — building now...");
    const r = reindex(root);
    log.ok(`indexed ${r.sectionsIndexed} section(s) in ${r.filesIndexed} file(s) (${r.durationMs}ms)`);
    log.blank();
  }

  const limit = Number.parseInt(opts.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    log.err(`Invalid --limit "${opts.limit}"`);
    process.exit(1);
  }

  const t0 = Date.now();
  const searchOpts: { limit: number; type?: string } = { limit };
  if (opts.type) searchOpts.type = opts.type;
  const hits = search(root, query, searchOpts);
  const ms = Date.now() - t0;

  if (hits.length === 0) {
    log.info(`No matches for ${kleur.bold(`"${query}"`)} (${ms}ms)`);
    log.info("If you just published something, try `duoshe reindex` first.");
    return;
  }

  log.step(`${hits.length} hit(s) for ${kleur.bold(`"${query}"`)} (${ms}ms)`);
  log.blank();
  for (const h of hits) {
    const typeTag = colorByType(h.type)(`[${h.type}]`);
    log.raw(`${typeTag} ${kleur.bold(h.title)}`);
    log.raw(`  ${kleur.gray(`.duoshe/${h.path}`)}${h.candidateId ? kleur.gray(` · ${h.candidateId}`) : ""}`);
    log.raw(`  ${highlight(h.snippet)}`);
    log.blank();
  }
}

async function runReindex(opts: ReindexOpts): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("No .duoshe/ found in this directory. Run `duoshe init` first.");
    process.exit(1);
  }

  if (!opts.quiet) log.step("Rebuilding SQLite FTS5 index");
  const r = reindex(root);
  if (!opts.quiet) {
    log.ok(`indexed ${r.sectionsIndexed} section(s) across ${r.filesIndexed} file(s) in ${r.durationMs}ms`);
  }
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("search long-term memory (PROJECT/DECISIONS/TROUBLESHOOTING/MODULES) via SQLite FTS5")
    .option("--limit <n>", "max results", "8")
    .option("--type <type>", "filter by type: project|decision|troubleshooting|module|session_summary")
    .option("--no-auto-index", "do not build index automatically if missing")
    .action(async (query: string, opts: SearchOpts) => {
      try {
        await runSearch(query, opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("reindex")
    .description("rebuild SQLite FTS5 index from Markdown files")
    .option("-q, --quiet", "suppress output (useful when chained from other commands)")
    .action(async (opts: ReindexOpts) => {
      try {
        await runReindex(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
