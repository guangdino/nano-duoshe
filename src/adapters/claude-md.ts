import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BEGIN_MARK = "<!-- BEGIN DUOSHE -->";
export const END_MARK = "<!-- END DUOSHE -->";

export const SHELL_FILES = ["CLAUDE.md", "AGENTS.md"] as const;
export type ShellFile = (typeof SHELL_FILES)[number];

export type ShellAction =
  | { file: ShellFile; status: "created"; path: string }
  | { file: ShellFile; status: "appended"; path: string }
  | { file: ShellFile; status: "updated"; path: string }
  | { file: ShellFile; status: "unchanged"; path: string }
  | { file: ShellFile; status: "skipped-no-existing"; path: string }
  | { file: ShellFile; status: "removed"; path: string };

export function buildShellBlock(): string {
  return [
    BEGIN_MARK,
    "## Project Memory (managed by DuoShe)",
    "",
    "This project uses **DuoShe** for structured, traceable project memory.",
    "Authoritative memory lives in `.duoshe/`:",
    "",
    "- `.duoshe/PROJECT.md` — project overview, tech stack, conventions",
    "- `.duoshe/CODEMAP.md` — code graph, entry points, directory roles",
    "- `.duoshe/DECISIONS.md` — architecture decisions (with rationale)",
    "- `.duoshe/TROUBLESHOOTING.md` — known issues and how to fix them",
    "- `.duoshe/MODULES.md` — module boundaries (what each part owns and does NOT own)",
    "- `.duoshe/TODO.md` — current work and what's next",
    "- `.duoshe/SKILLS/enabled/` — opt-in domain skills (embedded / matlab / devops / wordpress / graph)",
    "",
    "**Before answering questions about this project**, read the relevant `.duoshe/` files",
    "for context — especially `PROJECT.md`, `DECISIONS.md`, and `MODULES.md`. If any",
    "skills are enabled, their README in `.duoshe/SKILLS/enabled/<name>/README.md`",
    "explains the domain-specific conventions and detectors that apply.",
    "",
    "**To capture new long-term memory** (decisions, gotchas, module rules), run:",
    '`duoshe remember "..."` — this stages a candidate for the human to confirm,',
    "rather than editing the Markdown files directly. After the human runs",
    "`duoshe review` and `duoshe save <id>` (or `drop <id>`), the entry is",
    "permanently recorded with a traceable footer.",
    "",
    "**Daily commands the user (and you) can run:**",
    '- `duoshe remember "..."` — stage a candidate memory',
    "- `duoshe review` — list pending candidates",
    "- `duoshe save <id>` / `duoshe drop <id>` — promote or discard",
    '- `duoshe search "..."` — FTS5 search over confirmed memory',
    "",
    "_This block is managed by DuoShe. Edit between the markers if you want — DuoShe will",
    "preserve your edits and only warn on conflict. Run `duoshe uninstall` to remove cleanly._",
    END_MARK,
  ].join("\n");
}

function findBlockBounds(text: string): { start: number; end: number } | null {
  const start = text.indexOf(BEGIN_MARK);
  if (start === -1) return null;
  const end = text.indexOf(END_MARK, start + BEGIN_MARK.length);
  if (end === -1) return null;
  return { start, end: end + END_MARK.length };
}

export type SyncOptions = {
  createIfMissing: boolean;
};

function syncOne(filePath: string, file: ShellFile, opts: SyncOptions): ShellAction {
  const block = buildShellBlock();

  if (!existsSync(filePath)) {
    if (!opts.createIfMissing) {
      return { file, status: "skipped-no-existing", path: filePath };
    }
    const fresh = `# ${file === "CLAUDE.md" ? "Claude Code" : "Codex"} Instructions\n\n${block}\n`;
    writeFileSync(filePath, fresh, "utf8");
    return { file, status: "created", path: filePath };
  }

  const current = readFileSync(filePath, "utf8");
  const bounds = findBlockBounds(current);

  if (!bounds) {
    const sep = current.endsWith("\n") ? "\n" : "\n\n";
    const updated = `${current}${sep}${block}\n`;
    writeFileSync(filePath, updated, "utf8");
    return { file, status: "appended", path: filePath };
  }

  const existing = current.slice(bounds.start, bounds.end);
  if (existing === block) {
    return { file, status: "unchanged", path: filePath };
  }

  const updated = current.slice(0, bounds.start) + block + current.slice(bounds.end);
  writeFileSync(filePath, updated, "utf8");
  return { file, status: "updated", path: filePath };
}

export function syncShells(projectRoot: string, opts: SyncOptions): ShellAction[] {
  return SHELL_FILES.map((f) => syncOne(join(projectRoot, f), f, opts));
}

export function uninstallShells(projectRoot: string): ShellAction[] {
  const results: ShellAction[] = [];
  for (const file of SHELL_FILES) {
    const path = join(projectRoot, file);
    if (!existsSync(path)) {
      results.push({ file, status: "skipped-no-existing", path });
      continue;
    }
    const current = readFileSync(path, "utf8");
    const bounds = findBlockBounds(current);
    if (!bounds) {
      results.push({ file, status: "unchanged", path });
      continue;
    }
    let before = current.slice(0, bounds.start);
    const after = current.slice(bounds.end);
    before = before.replace(/\n+$/, "");
    const cleaned = `${before}\n${after.replace(/^\n+/, "")}`.replace(/\n{3,}/g, "\n\n");
    writeFileSync(path, cleaned.endsWith("\n") ? cleaned : `${cleaned}\n`, "utf8");
    results.push({ file, status: "removed", path });
  }
  return results;
}

export function detectExistingShells(projectRoot: string): { file: ShellFile; exists: boolean }[] {
  return SHELL_FILES.map((f) => ({ file: f, exists: existsSync(join(projectRoot, f)) }));
}
