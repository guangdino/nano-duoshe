import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitInsights, ProjectScan } from "../types.js";
import { initVault } from "../vault/index.js";
import { publishToMarkdown } from "./publish.js";
import { CandidateStore } from "./store.js";

const fakeScan = (root: string): ProjectScan => ({
  root,
  stacks: [],
  topDirs: [],
  entryPoints: [],
  totalFiles: 0,
  totalSourceFiles: 0,
  scannedAt: new Date().toISOString(),
});
const fakeGit: GitInsights = { isGitRepo: false };

describe("publishToMarkdown", () => {
  let dir: string;
  let store: CandidateStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-pub-"));
    initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    store = new CandidateStore(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends a section with title, content, and traceability footer", () => {
    const c = store.add({
      type: "decision",
      content: "Use libpq directly. ORM-free.",
      sourceSessionId: "session_001",
      sourceTurnStart: 3,
      sourceTurnEnd: 4,
    });
    const published = store.markPublished(c.id);
    const result = publishToMarkdown({ projectRoot: dir, candidate: published });

    expect(result.action).toBe("appended");
    const md = readFileSync(join(dir, ".duoshe", "DECISIONS.md"), "utf8");
    expect(md).toContain("## Use libpq directly. ORM-free.");
    expect(md).toContain("Use libpq directly. ORM-free.");
    expect(md).toContain(`duoshe: ${c.id}`);
    expect(md).toContain("type: decision");
    expect(md).toContain("source: session=session_001,turns=3-4");
  });

  it("removes '(no decisions recorded yet)' sentinel on first publish", () => {
    const before = readFileSync(join(dir, ".duoshe", "DECISIONS.md"), "utf8");
    expect(before).toContain("_(no decisions recorded yet)_");

    const c = store.add({ type: "decision", content: "First one" });
    publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c.id) });

    const after = readFileSync(join(dir, ".duoshe", "DECISIONS.md"), "utf8");
    expect(after).not.toContain("_(no decisions recorded yet)_");
  });

  it("is idempotent — publishing the same candidate twice does not duplicate", () => {
    const c = store.add({ type: "decision", content: "X" });
    const published = store.markPublished(c.id);

    publishToMarkdown({ projectRoot: dir, candidate: published });
    const result2 = publishToMarkdown({ projectRoot: dir, candidate: published });

    expect(result2.action).toBe("already-published");
    const md = readFileSync(join(dir, ".duoshe", "DECISIONS.md"), "utf8");
    const sectionCount = (md.match(/^## X$/gm) ?? []).length;
    expect(sectionCount).toBe(1);
  });

  it("publishes troubleshooting to TROUBLESHOOTING.md", () => {
    const c = store.add({
      type: "troubleshooting",
      content: "When X happens, do Y.",
    });
    const published = store.markPublished(c.id);
    publishToMarkdown({ projectRoot: dir, candidate: published });

    const md = readFileSync(join(dir, ".duoshe", "TROUBLESHOOTING.md"), "utf8");
    expect(md).toContain("When X happens, do Y.");
    expect(md).toContain("type: troubleshooting");
  });

  it("publishes project_fact to PROJECT.md and creates 'Memorized facts' section", () => {
    const c = store.add({
      type: "project_fact",
      content: "Built for Windows-only deployment.",
    });
    const published = store.markPublished(c.id);
    publishToMarkdown({ projectRoot: dir, candidate: published });

    const md = readFileSync(join(dir, ".duoshe", "PROJECT.md"), "utf8");
    expect(md).toContain("## Memorized facts");
    expect(md).toContain("Built for Windows-only deployment.");
  });

  it("source footer uses single turn when start==end", () => {
    const c = store.add({
      type: "decision",
      content: "Y",
      sourceSessionId: "s1",
      sourceTurnStart: 7,
      sourceTurnEnd: 7,
    });
    publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c.id) });
    const md = readFileSync(join(dir, ".duoshe", "DECISIONS.md"), "utf8");
    expect(md).toContain("source: session=s1,turns=7");
    expect(md).not.toContain("turns=7-7");
  });

  it("falls back to free-form source tag when no session id", () => {
    const c = store.add({ type: "decision", content: "Z", source: "manual" });
    publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c.id) });
    const md = readFileSync(join(dir, ".duoshe", "DECISIONS.md"), "utf8");
    expect(md).toContain("source: manual");
  });

  it("throws when target file does not exist", () => {
    const c = store.add({ type: "decision", content: "X", target: "NOT_REAL.md" });
    expect(() =>
      publishToMarkdown({ projectRoot: dir, candidate: store.markPublished(c.id) }),
    ).toThrow(/does not exist/);
  });
});
