import { readFileSync, writeFileSync } from "node:fs";
import type { Command } from "commander";
import kleur from "kleur";
import { analyzeGraph, renderMermaid } from "../../skills/graph/index.js";
import { readConfig } from "../../core/vault/config.js";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { log } from "../log.js";

const GRAPH_START = "<!-- BEGIN DUOSHE-GRAPH -->";
const GRAPH_END = "<!-- END DUOSHE-GRAPH -->";

type GraphOptions = {
  output?: "codemap" | "stdout";
  hot?: boolean;
};

function mergeGraphBlock(existing: string, block: string): string {
  if (existing.includes(GRAPH_START)) {
    const before = existing.slice(0, existing.indexOf(GRAPH_START)).trimEnd();
    const after = existing.slice(existing.indexOf(GRAPH_END) + GRAPH_END.length).trimStart();
    return after ? `${before}\n\n${block}\n\n${after}` : `${before}\n\n${block}\n`;
  }
  return existing.trimEnd() ? `${existing.trimEnd()}\n\n${block}\n` : `${block}\n`;
}

async function runGraph(opts: GraphOptions): Promise<void> {
  const root = process.cwd();

  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }

  const paths = vaultPathsFor(root);
  const cfg = readConfig(paths.config);

  if (cfg && !cfg.enabledSkills.includes("graph")) {
    log.warn(`"graph" 技能还没启用。`);
    log.raw(`  先启用：${kleur.cyan("duoshe skill enable graph")}`);
    log.raw(`  查看所有技能：${kleur.cyan("duoshe skill list")}`);
    process.exit(1);
  }

  log.step("分析代码依赖关系");
  const start = Date.now();
  const analysis = analyzeGraph(root);
  const elapsed = Date.now() - start;

  if (analysis.files.length === 0) {
    log.warn("没扫描到任何源码文件。");
    log.raw(kleur.gray("  当前 graph 技能只支持 JavaScript / TypeScript（.ts/.tsx/.js/.jsx/.mjs/.cjs）。"));
    log.raw(kleur.gray("  其他语言（Go / Python / Rust / C/C++ / VHDL / Verilog / Terraform 等）的依赖分析还在路上。"));
    return;
  }

  log.ok(`扫描了 ${analysis.files.length} 个源码文件，发现 ${analysis.edges.length} 条依赖关系（${elapsed}ms）`);

  if (analysis.cycles.length > 0) {
    log.warn(`发现 ${analysis.cycles.length} 个循环依赖：`);
    for (const cycle of analysis.cycles.slice(0, 5)) {
      log.raw(`  ${kleur.yellow(cycle.join(" → "))}`);
    }
    if (analysis.cycles.length > 5) {
      log.raw(`  ${kleur.gray(`...还有 ${analysis.cycles.length - 5} 个`)}`);
    }
  } else {
    log.ok("没有循环依赖");
  }

  if (opts.hot !== false && analysis.hotNodes.length > 0) {
    log.blank();
    log.raw(kleur.bold("热点模块（被依赖最多）："));
    for (const { file, inDegree } of analysis.hotNodes.slice(0, 5)) {
      log.raw(`  ${kleur.cyan(String(inDegree).padStart(3))}  ${file}`);
    }
  }

  const mermaid = renderMermaid(analysis);

  if ((opts.output ?? "codemap") === "stdout") {
    log.blank();
    log.raw(mermaid);
    return;
  }

  const block = `${GRAPH_START}\n## 代码依赖图\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n\n_由 \`duoshe graph\` 于 ${new Date().toISOString()} 生成_\n${GRAPH_END}`;

  let existing: string;
  try {
    existing = readFileSync(paths.codeMap, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    existing = "";
  }

  writeFileSync(paths.codeMap, mergeGraphBlock(existing, block), "utf8");
  log.blank();
  log.ok(`已写入依赖图到 ${kleur.cyan(".duoshe/CODEMAP.md")}`);
}

export function registerGraphCommand(program: Command): void {
  program
    .command("graph")
    .description("分析代码 import 依赖，生成依赖图写入 .duoshe/CODEMAP.md（需要先启用 graph 技能）")
    .option("--output <模式>", "输出到哪：codemap（默认）| stdout", "codemap")
    .option("--no-hot", "不显示热点模块")
    .action(async (opts: GraphOptions) => {
      try {
        await runGraph(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
