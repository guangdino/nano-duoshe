import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BEGIN_MARK,
  END_MARK,
  buildShellBlock,
  syncShells,
  uninstallShells,
} from "./claude-md.js";

describe("claude-md shell block manager", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates fresh shell when createIfMissing=true and file absent", () => {
    const results = syncShells(dir, { createIfMissing: true });
    const claude = results.find((r) => r.file === "CLAUDE.md");
    expect(claude?.status).toBe("created");
    const content = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(content).toContain(BEGIN_MARK);
    expect(content).toContain(END_MARK);
  });

  it("skips creation when createIfMissing=false and file absent", () => {
    const results = syncShells(dir, { createIfMissing: false });
    const claude = results.find((r) => r.file === "CLAUDE.md");
    expect(claude?.status).toBe("skipped-no-existing");
  });

  it("appends block to existing file without clobbering user content", () => {
    const userContent = "# My Project\n\nUser-written instructions here.\n";
    writeFileSync(join(dir, "CLAUDE.md"), userContent, "utf8");

    const results = syncShells(dir, { createIfMissing: false });
    const claude = results.find((r) => r.file === "CLAUDE.md");
    expect(claude?.status).toBe("appended");

    const updated = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(updated).toContain("# My Project");
    expect(updated).toContain("User-written instructions here.");
    expect(updated).toContain(BEGIN_MARK);
    expect(updated).toContain(END_MARK);
  });

  it("is idempotent — repeated sync does not duplicate the block", () => {
    syncShells(dir, { createIfMissing: true });
    const after1 = readFileSync(join(dir, "CLAUDE.md"), "utf8");

    const results2 = syncShells(dir, { createIfMissing: true });
    const claude2 = results2.find((r) => r.file === "CLAUDE.md");
    expect(claude2?.status).toBe("unchanged");

    const after2 = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(after2).toBe(after1);

    const beginCount = (after2.match(/<!-- BEGIN DUOSHE -->/g) ?? []).length;
    expect(beginCount).toBe(1);
  });

  it("updates the block in place when block content changes", () => {
    syncShells(dir, { createIfMissing: true });
    const original = readFileSync(join(dir, "CLAUDE.md"), "utf8");

    const tampered = original.replace(buildShellBlock(), `${BEGIN_MARK}\n## Old version\n${END_MARK}`);
    writeFileSync(join(dir, "CLAUDE.md"), tampered, "utf8");

    const results = syncShells(dir, { createIfMissing: true });
    const claude = results.find((r) => r.file === "CLAUDE.md");
    expect(claude?.status).toBe("updated");

    const final = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(final).not.toContain("## Old version");
    expect(final).toContain("Project Memory (managed by DuoShe)");
  });

  it("uninstall removes only the DuoShe block, preserves user content", () => {
    const userContent = "# My Project\n\nUser instructions.\n\nMore content.\n";
    writeFileSync(join(dir, "CLAUDE.md"), userContent, "utf8");
    syncShells(dir, { createIfMissing: false });

    const results = uninstallShells(dir);
    const claude = results.find((r) => r.file === "CLAUDE.md");
    expect(claude?.status).toBe("removed");

    const after = readFileSync(join(dir, "CLAUDE.md"), "utf8");
    expect(after).toContain("# My Project");
    expect(after).toContain("User instructions.");
    expect(after).toContain("More content.");
    expect(after).not.toContain(BEGIN_MARK);
    expect(after).not.toContain(END_MARK);
  });

  it("uninstall is safe when file has no DuoShe block", () => {
    writeFileSync(join(dir, "CLAUDE.md"), "# Just user content\n", "utf8");
    const results = uninstallShells(dir);
    const claude = results.find((r) => r.file === "CLAUDE.md");
    expect(claude?.status).toBe("unchanged");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("# Just user content\n");
  });
});
