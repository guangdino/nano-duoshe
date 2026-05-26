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
    "- `.duoshe/DECISIONS.md` — architecture decisions (with rationale)",
    "- `.duoshe/TROUBLESHOOTING.md` — known issues and how to fix them",
    "- `.duoshe/MODULES.md` — module boundaries (what each part owns and does NOT own)",
    "- `.duoshe/TODO.md` — current work and what's next",
    "",
    "**For AI agents:** prefer the `memory.search` and `memory.get_project_context`",
    "MCP tools over reading these files directly — they hit a SQLite FTS5 index and",
    "stay under context budget.",
    "",
    "**To update memory:** do not edit DECISIONS / TROUBLESHOOTING / MODULES by hand for",
    "long-form changes — use `duoshe remember \"...\" --type <decision|troubleshooting|module_boundary>`,",
    "then `duoshe review` and `duoshe publish <id>`. This keeps every long-term memory",
    "traceable to the conversation it came from.",
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
