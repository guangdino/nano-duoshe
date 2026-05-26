import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Candidate } from "../types.js";
import { vaultPathsFor } from "../vault/paths.js";

const EMPTY_SENTINELS = [
  /_\(no decisions recorded yet\)_/i,
  /_\(no troubleshooting entries yet\)_/i,
  /_\(no top-level directories detected\.\)_/i,
];

function makeFooter(c: Candidate): string {
  const parts: string[] = [`duoshe: ${c.id}`, `type: ${c.type}`];
  if (c.publishedAt) parts.push(`published: ${c.publishedAt}`);
  if (c.sourceSessionId) {
    let src = `source: session=${c.sourceSessionId}`;
    if (c.sourceTurnStart !== undefined) {
      src += `,turns=${c.sourceTurnStart}`;
      if (c.sourceTurnEnd !== undefined && c.sourceTurnEnd !== c.sourceTurnStart) {
        src += `-${c.sourceTurnEnd}`;
      }
    }
    parts.push(src);
  } else if (c.source) {
    parts.push(`source: ${c.source}`);
  }
  return `<!-- ${parts.join(" | ")} -->`;
}

function buildSection(c: Candidate): string {
  const footer = makeFooter(c);
  return [
    `## ${c.title}`,
    "",
    c.content.trim(),
    "",
    footer,
    "",
  ].join("\n");
}

function alreadyPublished(text: string, candidateId: string): boolean {
  return text.includes(`duoshe: ${candidateId} `) || text.includes(`duoshe: ${candidateId}|`);
}

function stripSentinels(text: string): string {
  let out = text;
  for (const sentinel of EMPTY_SENTINELS) {
    out = out.replace(sentinel, "");
  }
  return out;
}

function ensureProjectMemorizedSection(text: string): string {
  if (text.includes("## Memorized facts")) return text;
  const sep = text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}\n## Memorized facts\n\n_Published via \`duoshe publish\` — see footer for traceback._\n`;
}

export type PublishResult = {
  ok: boolean;
  targetPath: string;
  action: "appended" | "already-published";
  bytesWritten?: number;
};

export function publishToMarkdown(opts: {
  projectRoot: string;
  candidate: Candidate;
}): PublishResult {
  const { projectRoot, candidate } = opts;
  const paths = vaultPathsFor(projectRoot);
  const targetPath = join(paths.vault, candidate.target);

  if (!existsSync(targetPath)) {
    throw new Error(
      `target file does not exist: ${targetPath}. Run \`duoshe init\` first.`,
    );
  }

  const current = readFileSync(targetPath, "utf8");

  if (alreadyPublished(current, candidate.id)) {
    return { ok: true, targetPath, action: "already-published" };
  }

  let working = stripSentinels(current);
  if (candidate.target === "PROJECT.md") {
    working = ensureProjectMemorizedSection(working);
  }

  const section = buildSection(candidate);
  const sep = working.endsWith("\n\n") ? "" : working.endsWith("\n") ? "\n" : "\n\n";
  const updated = `${working}${sep}${section}`;

  writeFileSync(targetPath, updated, "utf8");
  return { ok: true, targetPath, action: "appended", bytesWritten: updated.length - current.length };
}
