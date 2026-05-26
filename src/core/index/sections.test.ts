import { describe, expect, it } from "vitest";
import { slugify, splitMarkdownSections } from "./sections.js";

describe("splitMarkdownSections", () => {
  it("returns one intro section for a file with only H1", () => {
    const md = "# My Project\n\nSome intro text.\n";
    const secs = splitMarkdownSections(md);
    expect(secs).toHaveLength(1);
    expect(secs[0]?.title).toBe("My Project");
  });

  it("splits by H2 sections", () => {
    const md = `# Decisions

intro

## First decision

Body of first.

## Second decision

Body of second.
`;
    const secs = splitMarkdownSections(md);
    expect(secs).toHaveLength(3);
    expect(secs.map((s) => s.title)).toEqual(["Decisions", "First decision", "Second decision"]);
    expect(secs[1]?.body).toBe("Body of first.");
  });

  it("extracts candidate id from duoshe footer", () => {
    const md = `## Use libpq

Reason here.

<!-- duoshe: cand_abc123 | type: decision | published: 2026-01-01 -->
`;
    const secs = splitMarkdownSections(md);
    expect(secs[0]?.candidateId).toBe("cand_abc123");
  });

  it("ignores sections with empty body and empty title", () => {
    const md = "##  \n##  \n";
    const secs = splitMarkdownSections(md);
    expect(secs).toHaveLength(0);
  });

  it("handles CRLF line endings", () => {
    const md = "## A\r\nBody A\r\n## B\r\nBody B\r\n";
    const secs = splitMarkdownSections(md);
    expect(secs).toHaveLength(2);
    expect(secs[0]?.title).toBe("A");
    expect(secs[1]?.title).toBe("B");
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alnum with dashes", () => {
    expect(slugify("Use libpq, not an ORM!")).toBe("use-libpq-not-an-orm");
  });

  it("preserves CJK characters", () => {
    expect(slugify("使用 TypeScript 不用 Python")).toBe("使用-typescript-不用-python");
  });

  it("returns 'section' for empty input", () => {
    expect(slugify("!!!")).toBe("section");
  });

  it("truncates to 80 chars", () => {
    const long = "a".repeat(120);
    expect(slugify(long).length).toBe(80);
  });
});
