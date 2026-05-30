import { existsSync } from "node:fs";
import type { Command } from "commander";
import kleur from "kleur";
import { CandidateStore } from "../../core/candidate/index.js";
import { reindex, search } from "../../core/index/index.js";
import type { Candidate } from "../../core/types.js";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { nudgeAfterSearchEmpty } from "../assistant.js";
import { log } from "../log.js";

type SearchOpts = {
  limit: string;
  type?: string;
  noAutoIndex?: boolean;
};

type ReindexOpts = {
  quiet?: boolean;
};

const TYPE_LABEL: Record<string, string> = {
  decision: "决策",
  troubleshooting: "踩坑",
  module: "模块规则",
  project: "项目信息",
  session_summary: "会话摘要",
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
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }

  const paths = vaultPathsFor(root);
  if (!existsSync(paths.indexDb) && !opts.noAutoIndex) {
    reindex(root);
  }

  const limit = Number.parseInt(opts.limit, 10);
  if (!Number.isFinite(limit) || limit < 1) {
    log.err(`--limit "${opts.limit}" 不是有效的数字`);
    process.exit(1);
  }

  const searchOpts: { limit: number; type?: string } = { limit };
  if (opts.type) searchOpts.type = opts.type;
  const hits = search(root, query, searchOpts);
  const pendingMatches = searchPendingCandidates(root, query);

  if (hits.length === 0 && pendingMatches.length === 0) {
    log.info(`没有找到"${query}"相关的内容。`);
    nudgeAfterSearchEmpty(root, query);
    return;
  }

  log.blank();
  for (const h of hits) {
    const label = TYPE_LABEL[h.type] ?? h.type;
    const typeTag = colorByType(h.type)(`[${label}]`);
    log.raw(`${typeTag} ${kleur.bold(h.title)}`);
    log.raw(`  ${kleur.gray(`.duoshe/${h.path}`)}`);
    log.raw(`  ${highlight(h.snippet)}`);
    log.blank();
  }

  if (pendingMatches.length > 0) {
    const lead = hits.length > 0
      ? `还有 ${pendingMatches.length} 条 ${kleur.yellow("[待确认]")} 记录也匹配`
      : `找到 ${pendingMatches.length} 条 ${kleur.yellow("[待确认]")} 记录匹配`;
    log.raw(kleur.bold(`  ${lead}（运行 ${kleur.cyan("duoshe review")} 决定是否保存）：`));
    log.blank();
    for (const c of pendingMatches) {
      log.raw(`${kleur.yellow("[待确认]")} ${kleur.cyan(c.id)}  ${kleur.bold(c.title)}`);
      log.raw(`  ${kleur.gray(highlightSubstring(c.content, query))}`);
      log.blank();
    }
  }
}

function searchPendingCandidates(root: string, query: string): Candidate[] {
  try {
    const store = new CandidateStore(root);
    const needle = query.toLowerCase().trim();
    if (needle.length === 0) return [];
    return store
      .listByStatus("pending")
      .filter((c) => c.content.toLowerCase().includes(needle) || c.title.toLowerCase().includes(needle))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function highlightSubstring(content: string, query: string, max = 160): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  if (oneLine.length === 0) return "";
  const idx = oneLine.toLowerCase().indexOf(query.toLowerCase());
  const pivot = idx >= 0 ? idx : 0;
  const half = Math.floor(max / 2);
  const start = Math.max(0, pivot - half);
  const end = Math.min(oneLine.length, start + max);
  let out = oneLine.slice(start, end);
  if (start > 0) out = `…${out}`;
  if (end < oneLine.length) out = `${out}…`;
  if (idx >= 0) {
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    out = out.replace(re, (m) => kleur.bgYellow().black(m));
  }
  return out;
}

async function runReindex(opts: ReindexOpts): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }

  if (!opts.quiet) log.step("重建搜索索引");
  const r = reindex(root);
  if (!opts.quiet) {
    log.ok(`已索引 ${r.sectionsIndexed} 个条目（${r.filesIndexed} 个文件，${r.durationMs}ms）`);
  }
}

export function registerSearchCommand(program: Command): void {
  program
    .command("search <query>")
    .description("在项目记忆里搜索（PROJECT / DECISIONS / TROUBLESHOOTING 等）")
    .option("--limit <n>", "最多返回几条结果", "8")
    .option("--type <type>", "按类型筛选：project（项目）| decision（决策）| troubleshooting（踩坑）| module（模块）| session_summary（会话摘要）")
    .option("--no-auto-index", "不自动建索引")
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
    .description("重建搜索索引（刚发布了新记录后运行）")
    .option("-q, --quiet", "静默模式")
    .action(async (opts: ReindexOpts) => {
      try {
        await runReindex(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
