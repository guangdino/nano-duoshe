import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CandidateStore, publishToMarkdown } from "../candidate/index.js";
import type { GitInsights, ProjectScan } from "../types.js";
import { initVault } from "../vault/index.js";
import { reindex } from "./indexer.js";
import { search } from "./search.js";

const fakeScan = (root: string): ProjectScan => ({
  root,
  stacks: [{ language: "TypeScript", manifestFile: "package.json" }],
  topDirs: [],
  entryPoints: [],
  totalFiles: 0,
  totalSourceFiles: 0,
  scannedAt: new Date().toISOString(),
});
const fakeGit: GitInsights = { isGitRepo: false };

function seed(dir: string): void {
  initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
  const store = new CandidateStore(dir);

  const c1 = store.add({
    type: "decision",
    content:
      "Use libpq directly, not an ORM. Reason: control over query plans and connection pooling.",
    source: "manual",
  });
  publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c1.id) });

  const c2 = store.add({
    type: "troubleshooting",
    content: "When Codex returns 401, check that the API base URL does not include /v1 suffix.",
    source: "manual",
  });
  publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c2.id) });

  const c3 = store.add({
    type: "decision",
    content: "DuoShe v0.1 用 TypeScript + better-sqlite3, 12个月不转方向。",
    source: "manual",
  });
  publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c3.id) });
}

describe("search (M3)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-search-"));
    seed(dir);
    reindex(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty array on empty query", () => {
    expect(search(dir, "")).toEqual([]);
    expect(search(dir, "   ")).toEqual([]);
  });

  it("finds an English keyword", () => {
    const hits = search(dir, "libpq");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.snippet).toMatch(/«libpq»/);
  });

  it("ranks more specific matches higher", () => {
    const hits = search(dir, "Codex 401");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.title.toLowerCase()).toContain("codex");
  });

  it("filters by type", () => {
    const decisions = search(dir, "libpq", { type: "decision" });
    const troubleshooting = search(dir, "libpq", { type: "troubleshooting" });
    expect(decisions.length).toBeGreaterThanOrEqual(1);
    expect(troubleshooting.length).toBe(0);
  });

  it("respects limit", () => {
    const hits = search(dir, "Use OR Codex OR DuoShe", { limit: 1 });
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it("includes candidate id in hit when present in footer", () => {
    const hits = search(dir, "libpq");
    expect(hits[0]?.candidateId).toMatch(/^cand_/);
  });

  it("finds Chinese keywords (single-char tokenization)", () => {
    const hits = search(dir, "12个月");
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0]?.title.toLowerCase()).toContain("duoshe");
  });

  it("strips FTS5 reserved chars from query without crashing", () => {
    expect(() => search(dir, 'libpq" AND :: ^^')).not.toThrow();
    expect(() => search(dir, "()*:")).not.toThrow();
  });

  it("returns no hits when no documents match", () => {
    const hits = search(dir, "thisstringdoesnotappearanywhere12345");
    expect(hits).toHaveLength(0);
  });
});

describe("reindex (M3)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-reidx-"));
    seed(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("indexes all markdown files in the vault", () => {
    const r = reindex(dir);
    expect(r.filesIndexed).toBeGreaterThanOrEqual(4);
    expect(r.sectionsIndexed).toBeGreaterThanOrEqual(3);
  });

  it("is idempotent — rerunning produces same row count", () => {
    const r1 = reindex(dir);
    const r2 = reindex(dir);
    expect(r2.sectionsIndexed).toBe(r1.sectionsIndexed);
  });

  it("picks up newly published candidates", () => {
    reindex(dir);
    expect(search(dir, "新加的决策").length).toBe(0);

    const store = new CandidateStore(dir);
    const c = store.add({
      type: "decision",
      content: "新加的决策:用 Biome 不用 ESLint",
      source: "test",
    });
    publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c.id) });

    reindex(dir);
    expect(search(dir, "Biome").length).toBeGreaterThanOrEqual(1);
  });
});
