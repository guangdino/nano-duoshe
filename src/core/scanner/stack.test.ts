import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectStacks } from "./stack.js";

describe("detectStacks", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "duoshe-stack-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("detects npm + TypeScript + React", () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "demo",
        version: "1.2.3",
        dependencies: { react: "^18" },
        devDependencies: { typescript: "^5" },
      }),
    );
    writeFileSync(join(dir, "tsconfig.json"), "{}");
    writeFileSync(join(dir, "package-lock.json"), "{}");

    const stacks = detectStacks(dir);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.language).toBe("TypeScript");
    expect(stacks[0]?.framework).toBe("React");
    expect(stacks[0]?.packageManager).toBe("npm");
    expect(stacks[0]?.rawName).toBe("demo");
  });

  it("detects Python with FastAPI", () => {
    writeFileSync(
      join(dir, "pyproject.toml"),
      `[project]\nname = "x"\ndependencies = ["fastapi"]\n`,
    );
    const stacks = detectStacks(dir);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.language).toBe("Python");
    expect(stacks[0]?.framework).toBe("FastAPI");
  });

  it("detects .NET WPF", () => {
    writeFileSync(
      join(dir, "MyApp.csproj"),
      `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><UseWPF>true</UseWPF></PropertyGroup></Project>`,
    );
    const stacks = detectStacks(dir);
    expect(stacks).toHaveLength(1);
    expect(stacks[0]?.language).toBe("C#");
    expect(stacks[0]?.framework).toBe("WPF");
  });

  it("detects Go", () => {
    writeFileSync(join(dir, "go.mod"), "module github.com/x/y\n\ngo 1.22\n");
    const stacks = detectStacks(dir);
    expect(stacks[0]?.language).toBe("Go");
    expect(stacks[0]?.rawName).toBe("github.com/x/y");
  });

  it("returns empty array for unknown project", () => {
    const stacks = detectStacks(dir);
    expect(stacks).toHaveLength(0);
  });

  it("detects multiple stacks in one project (e.g. Node + Python)", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "a" }));
    writeFileSync(join(dir, "requirements.txt"), "django==5\n");
    const stacks = detectStacks(dir);
    expect(stacks).toHaveLength(2);
    expect(stacks.map((s) => s.language).sort()).toEqual(["JavaScript", "Python"]);
  });
});
