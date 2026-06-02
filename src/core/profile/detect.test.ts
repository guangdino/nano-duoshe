import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectScan, Stack, TopDir } from "../types.js";
import { detectProfile } from "./detect.js";

function makeScan(opts: {
  stacks?: Stack[];
  topDirs?: TopDir[];
  totalFiles?: number;
}): ProjectScan {
  return {
    root: "/tmp/x",
    stacks: opts.stacks ?? [],
    topDirs: opts.topDirs ?? [],
    entryPoints: [],
    totalFiles: opts.totalFiles ?? 0,
    totalSourceFiles: opts.totalFiles ?? 0,
    scannedAt: "2026-01-01T00:00:00Z",
  };
}

describe("detectProfile", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-profile-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("kid: Scratch .sb3 files trigger high-confidence kid", () => {
    writeFileSync(join(dir, "猫追老鼠.sb3"), "");
    const g = detectProfile(makeScan({ totalFiles: 1 }), dir);
    expect(g.profile).toBe("kid");
    expect(g.confidence).toBe("high");
  });

  it("kid: tiny project with CJK filenames triggers kid mode", () => {
    writeFileSync(join(dir, "猜数字.py"), "");
    writeFileSync(join(dir, "口算游戏.py"), "");
    const g = detectProfile(makeScan({ totalFiles: 2 }), dir);
    expect(g.profile).toBe("kid");
  });

  it("kid: empty project with handful of files falls through to kid", () => {
    writeFileSync(join(dir, "a.txt"), "");
    const g = detectProfile(makeScan({ totalFiles: 1 }), dir);
    expect(g.profile).toBe("kid");
    expect(g.confidence).toBe("low");
  });

  it("non_dev_site: WordPress is high-confidence", () => {
    const scan = makeScan({
      stacks: [{ language: "PHP", framework: "WordPress", manifestFile: "index.php" }],
      topDirs: [{ name: "wp-content", fileCount: 10 }],
      totalFiles: 20,
    });
    const g = detectProfile(scan, dir);
    expect(g.profile).toBe("non_dev_site");
  });

  it("non_dev_site: bare index.html with no manifest is static site", () => {
    writeFileSync(join(dir, "index.html"), "");
    const g = detectProfile(makeScan({ totalFiles: 5 }), dir);
    expect(g.profile).toBe("non_dev_site");
  });

  it("algo: MATLAB stack is high-confidence", () => {
    const scan = makeScan({
      stacks: [{ language: "MATLAB", framework: "Simulink", manifestFile: "x.slx" }],
      totalFiles: 5,
    });
    const g = detectProfile(scan, dir);
    expect(g.profile).toBe("algo");
  });

  it("algo: Python + notebooks/ dir is medium-confidence", () => {
    const scan = makeScan({
      stacks: [{ language: "Python", manifestFile: "pyproject.toml" }],
      topDirs: [{ name: "notebooks", fileCount: 5 }],
      totalFiles: 10,
    });
    const g = detectProfile(scan, dir);
    expect(g.profile).toBe("algo");
  });

  it("embedded: C/C++ stack triggers embedded", () => {
    const scan = makeScan({
      stacks: [{ language: "C/C++", framework: "ESP-IDF", manifestFile: "CMakeLists.txt" }],
      totalFiles: 20,
    });
    const g = detectProfile(scan, dir);
    expect(g.profile).toBe("embedded");
  });

  it("embedded: VHDL stack triggers embedded", () => {
    const scan = makeScan({
      stacks: [{ language: "VHDL / Verilog", framework: "Vivado", manifestFile: "x.xpr" }],
      totalFiles: 10,
    });
    expect(detectProfile(scan, dir).profile).toBe("embedded");
  });

  it("embedded: IEC 61131-3 (PLC) triggers embedded", () => {
    const scan = makeScan({
      stacks: [{ language: "IEC 61131-3", framework: "Codesys", manifestFile: "x.project" }],
      totalFiles: 15,
    });
    expect(detectProfile(scan, dir).profile).toBe("embedded");
  });

  it("ai_app: Anthropic SDK is high-confidence", () => {
    const scan = makeScan({
      stacks: [
        { language: "TypeScript", framework: "Anthropic Claude", manifestFile: "package.json" },
      ],
      totalFiles: 10,
    });
    expect(detectProfile(scan, dir).profile).toBe("ai_app");
  });

  it("ai_app: TS + prompts/ dir is medium-confidence", () => {
    const scan = makeScan({
      stacks: [{ language: "TypeScript", manifestFile: "package.json" }],
      topDirs: [{ name: "prompts", fileCount: 5 }],
      totalFiles: 10,
    });
    expect(detectProfile(scan, dir).profile).toBe("ai_app");
  });

  it("general: a normal Next.js project lands on general", () => {
    const scan = makeScan({
      stacks: [{ language: "TypeScript", framework: "Next.js", manifestFile: "package.json" }],
      topDirs: [{ name: "src", fileCount: 30 }],
      totalFiles: 50,
    });
    expect(detectProfile(scan, dir).profile).toBe("general");
  });
});
