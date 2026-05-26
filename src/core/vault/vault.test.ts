import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GitInsights, ProjectScan } from "../types.js";
import { initVault, readConfig, vaultExists } from "./index.js";

const fakeScan = (root: string): ProjectScan => ({
  root,
  stacks: [{ language: "TypeScript", framework: "Node", manifestFile: "package.json" }],
  topDirs: [{ name: "src", fileCount: 12, guessedRole: "source code" }],
  entryPoints: [{ path: "src/index.ts", kind: "main" }],
  totalFiles: 25,
  totalSourceFiles: 12,
  scannedAt: new Date().toISOString(),
});

const fakeGit: GitInsights = { isGitRepo: false };

describe("vault", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-vault-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the full .duoshe/ skeleton on init", () => {
    expect(vaultExists(dir)).toBe(false);
    const r = initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    expect(r.created).toBe(true);
    expect(vaultExists(dir)).toBe(true);
    expect(existsSync(r.paths.project)).toBe(true);
    expect(existsSync(r.paths.decisions)).toBe(true);
    expect(existsSync(r.paths.troubleshooting)).toBe(true);
    expect(existsSync(r.paths.modules)).toBe(true);
    expect(existsSync(r.paths.todo)).toBe(true);
    expect(existsSync(r.paths.config)).toBe(true);
    expect(existsSync(r.paths.sessions)).toBe(true);
    expect(existsSync(r.paths.candidatesPending)).toBe(true);
  });

  it("writes a valid config.json", () => {
    const r = initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    const cfg = readConfig(r.paths.config);
    expect(cfg).not.toBeNull();
    expect(cfg?.version).toBe("0.1");
    expect(cfg?.contextFiles).toContain("PROJECT.md");
    expect(cfg?.allowAgentPublish).toBe(false);
  });

  it("renders detected stacks into PROJECT.md", () => {
    initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    const project = readFileSync(join(dir, ".duoshe", "PROJECT.md"), "utf8");
    expect(project).toContain("TypeScript");
    expect(project).toContain("Node");
    expect(project).toContain("src/");
    expect(project).toContain("src/index.ts");
  });

  it("preserves user-confirmed sections on re-init without --force", () => {
    initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    const projectPath = join(dir, ".duoshe", "PROJECT.md");
    const confirmed = "<!-- USER-CONFIRMED -->\n# My Custom Project\n\nDon't overwrite me.\n";
    writeFileSync(projectPath, confirmed, "utf8");

    const r2 = initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit, force: false });
    expect(r2.fileActions["PROJECT.md"]).toBe("skipped-confirmed");

    const after = readFileSync(projectPath, "utf8");
    expect(after).toBe(confirmed);
  });

  it("skips existing files without --force", () => {
    initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    const projectPath = join(dir, ".duoshe", "PROJECT.md");
    writeFileSync(projectPath, "# Edited\n", "utf8");

    const r2 = initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit, force: false });
    expect(r2.fileActions["PROJECT.md"]).toBe("skipped-existing");
    expect(readFileSync(projectPath, "utf8")).toBe("# Edited\n");
  });

  it("overwrites existing files with --force (when not user-confirmed)", () => {
    initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit });
    const projectPath = join(dir, ".duoshe", "PROJECT.md");
    writeFileSync(projectPath, "# Edited\n", "utf8");

    const r2 = initVault({ projectRoot: dir, scan: fakeScan(dir), git: fakeGit, force: true });
    expect(r2.fileActions["PROJECT.md"]).toBe("wrote");
    expect(readFileSync(projectPath, "utf8")).not.toBe("# Edited\n");
  });
});
