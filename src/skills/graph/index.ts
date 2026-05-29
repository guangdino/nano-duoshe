import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SkillDefinition } from "../../core/types.js";
import { analyzeGraph, renderMermaid } from "./analyzer.js";

export { analyzeGraph, renderMermaid };

export const graphSkill: SkillDefinition = {
  meta: {
    name: "graph",
    version: "0.1.0",
    description:
      "Analyze source file import dependencies, detect cycles, identify hot modules, and write a Mermaid dependency graph to .duoshe/CODEMAP.md",
    enabledByDefault: false,
    triggers: ["large codebase", "cyclic dependencies", "refactor", "architecture review"],
  },

  async shouldAutoEnable(projectRoot: string): Promise<boolean> {
    const srcDir = join(projectRoot, "src");
    if (!existsSync(srcDir)) return false;
    try {
      return statSync(srcDir).isDirectory();
    } catch {
      return false;
    }
  },

  async run(projectRoot: string): Promise<void> {
    const analysis = analyzeGraph(projectRoot);
    const mermaid = renderMermaid(analysis);
    process.stdout.write(`${mermaid}\n`);
    process.stdout.write(
      `\nFiles: ${analysis.files.length}  Edges: ${analysis.edges.length}  Cycles: ${analysis.cycles.length}\n`,
    );
  },
};
