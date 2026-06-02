import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitInsights, ProjectScan } from "../types.js";
import { initVault } from "../vault/index.js";
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

describe("CandidateStore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-cand-"));
    initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("add() returns a candidate with generated id, pending status, defaulted target/title", () => {
    const store = new CandidateStore(dir);
    const c = store.add({
      type: "decision",
      content: "Use libpq, not an ORM.\nReason: control over query plans.",
    });
    expect(c.id).toMatch(/^cand_/);
    expect(c.status).toBe("pending");
    expect(c.target).toBe("DECISIONS.md");
    expect(c.title).toBe("Use libpq, not an ORM.");
    expect(c.scope).toBe("project");
  });

  it("defaults target based on type", () => {
    const store = new CandidateStore(dir);
    expect(store.add({ type: "troubleshooting", content: "x" }).target).toBe("TROUBLESHOOTING.md");
    expect(store.add({ type: "module_boundary", content: "x" }).target).toBe("MODULES.md");
    expect(store.add({ type: "project_fact", content: "x" }).target).toBe("PROJECT.md");
  });

  it("listByStatus('pending') returns only pending candidates", () => {
    const store = new CandidateStore(dir);
    const a = store.add({ type: "decision", content: "A" });
    const b = store.add({ type: "decision", content: "B" });
    store.add({ type: "decision", content: "C" });

    expect(store.listByStatus("pending")).toHaveLength(3);

    store.markPublished(a.id);
    store.markRejected(b.id);

    expect(store.listByStatus("pending")).toHaveLength(1);
    expect(store.listByStatus("published")).toHaveLength(1);
    expect(store.listByStatus("rejected")).toHaveLength(1);
  });

  it("findById returns the latest version after status change", () => {
    const store = new CandidateStore(dir);
    const c = store.add({ type: "decision", content: "X" });
    store.markPublished(c.id);
    const found = store.findById(c.id);
    expect(found?.status).toBe("published");
    expect(found?.publishedAt).toBeTruthy();
  });

  it("markPublished is idempotent", () => {
    const store = new CandidateStore(dir);
    const c = store.add({ type: "decision", content: "X" });
    store.markPublished(c.id);
    const second = store.markPublished(c.id);
    expect(second.status).toBe("published");
  });

  it("markRejected throws when already published", () => {
    const store = new CandidateStore(dir);
    const c = store.add({ type: "decision", content: "X" });
    store.markPublished(c.id);
    expect(() => store.markRejected(c.id)).toThrow(/already published/);
  });

  it("markPublished throws when already rejected", () => {
    const store = new CandidateStore(dir);
    const c = store.add({ type: "decision", content: "X" });
    store.markRejected(c.id);
    expect(() => store.markPublished(c.id)).toThrow(/already rejected/);
  });

  it("findById on unknown id returns undefined", () => {
    const store = new CandidateStore(dir);
    expect(store.findById("cand_nope")).toBeUndefined();
  });

  it("preserves source session/turn fields in the JSONL", () => {
    const store = new CandidateStore(dir);
    const c = store.add({
      type: "decision",
      content: "X",
      sourceSessionId: "session_001",
      sourceTurnStart: 3,
      sourceTurnEnd: 5,
    });
    const pendingPath = join(dir, ".duoshe", "CANDIDATES", "pending.jsonl");
    const raw = readFileSync(pendingPath, "utf8");
    expect(raw).toContain('"sourceSessionId":"session_001"');
    expect(raw).toContain('"sourceTurnStart":3');
    expect(raw).toContain('"sourceTurnEnd":5');
    expect(c.sourceSessionId).toBe("session_001");
  });
});
