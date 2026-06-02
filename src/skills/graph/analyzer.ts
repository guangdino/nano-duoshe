import type { Dirent } from "node:fs";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

export type DepEdge = { from: string; to: string };

export type GraphAnalysis = {
  files: string[];
  edges: DepEdge[];
  cycles: string[][];
  hotNodes: { file: string; inDegree: number }[];
};

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const RESOLVE_EXTS = [".ts", ".tsx", ".js", ".jsx"];

const IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function isRelative(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../");
}

function collectSourceFiles(dir: string, root: string, files: string[] = []): string[] {
  let entries: Dirent<string>[] = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist")
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(full, root, files);
    } else if (SOURCE_EXTS.has(extname(entry.name))) {
      files.push(relative(root, full).replace(/\\/g, "/"));
    }
  }
  return files;
}

function tryResolve(absPath: string): boolean {
  try {
    statSync(absPath);
    return true;
  } catch {
    return false;
  }
}

function resolveSpecifier(fromFile: string, spec: string, root: string): string | null {
  if (!isRelative(spec)) return null;
  const fromDir = join(root, fromFile, "..");
  const base = resolve(fromDir, spec);
  const rel = relative(root, base).replace(/\\/g, "/");

  if (extname(spec) !== "") return rel;

  for (const ext of RESOLVE_EXTS) {
    if (tryResolve(join(root, `${rel}${ext}`))) return `${rel}${ext}`;
  }
  for (const ext of RESOLVE_EXTS) {
    if (tryResolve(join(root, `${rel}/index${ext}`))) return `${rel}/index${ext}`;
  }
  return rel;
}

function extractImports(filePath: string, root: string): string[] {
  let src: string;
  try {
    src = readFileSync(join(root, filePath), "utf8");
  } catch {
    return [];
  }
  const specs = new Set<string>();
  for (const re of [IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0; // required: global-flag regexes are stateful
    let m = re.exec(src);
    while (m !== null) {
      if (m[1] !== undefined) specs.add(m[1]);
      m = re.exec(src);
    }
  }
  const resolved: string[] = [];
  for (const spec of specs) {
    const r = resolveSpecifier(filePath, spec, root);
    if (r !== null) resolved.push(r);
  }
  return resolved;
}

function detectCycles(edges: DepEdge[], files: string[]): string[][] {
  const adj = new Map<string, Set<string>>();
  for (const f of files) adj.set(f, new Set());
  for (const { from, to } of edges) adj.get(from)?.add(to);

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const stackPos = new Map<string, number>();

  function dfs(node: string): void {
    visited.add(node);
    onStack.add(node);
    stackPos.set(node, stack.length);
    stack.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (onStack.has(neighbor)) {
        const idx = stackPos.get(neighbor) ?? 0;
        cycles.push([...stack.slice(idx), neighbor]);
      }
    }
    stack.pop();
    stackPos.delete(node);
    onStack.delete(node);
  }

  for (const f of files) {
    if (!visited.has(f)) dfs(f);
  }
  return cycles;
}

export function analyzeGraph(projectRoot: string): GraphAnalysis {
  const files = collectSourceFiles(projectRoot, projectRoot);
  const edges: DepEdge[] = [];
  const fileSet = new Set(files);

  for (const file of files) {
    for (const imp of extractImports(file, projectRoot)) {
      if (fileSet.has(imp)) edges.push({ from: file, to: imp });
    }
  }

  const cycles = detectCycles(edges, files);

  const inDegree = new Map<string, number>();
  for (const f of files) inDegree.set(f, 0);
  for (const { to } of edges) inDegree.set(to, (inDegree.get(to) ?? 0) + 1);

  const hotNodes = [...inDegree.entries()]
    .filter(([, d]) => d > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([file, inDegree]) => ({ file, inDegree }));

  return { files, edges, cycles, hotNodes };
}

export function renderMermaid(analysis: GraphAnalysis): string {
  const lines: string[] = ["graph TD"];
  const nodeId = (f: string): string => f.replace(/[^a-zA-Z0-9_]/g, "_");
  const seen = new Set<string>();

  for (const { from, to } of analysis.edges) {
    const fId = nodeId(from);
    const tId = nodeId(to);
    if (!seen.has(from)) {
      lines.push(`  ${fId}["${from}"]`);
      seen.add(from);
    }
    if (!seen.has(to)) {
      lines.push(`  ${tId}["${to}"]`);
      seen.add(to);
    }
    lines.push(`  ${fId} --> ${tId}`);
  }
  if (lines.length === 1) lines.push("  empty[no import edges found]");
  return lines.join("\n");
}
