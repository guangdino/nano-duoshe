import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BEGIN_MARK = "# BEGIN DUOSHE";
const END_MARK = "# END DUOSHE";

// Rules that should be private per-developer (NOT committed):
// - config.json holds local paths and assistantMode preference
// - CANDIDATES are unconfirmed drafts the user hasn't decided on
// - SESSIONS are private chat archives
// - index.db is a local FTS5 cache, regenerable
const RULE_BLOCK = `${BEGIN_MARK}
# DuoShe — local-only state (these stay on your machine).
# Public memory (PROJECT.md / DECISIONS.md / MODULES.md / TROUBLESHOOTING.md /
# TODO.md / SETUP.md / CODEMAP.md / SKILLS/) is meant to be committed —
# share it with your team and AI agents.
.duoshe/config.json
.duoshe/nudges.json
.duoshe/CANDIDATES/
.duoshe/SESSIONS/
.duoshe/index.db
.duoshe/index.db-journal
.duoshe/index.db-wal
.duoshe/index.db-shm
${END_MARK}`;

export type GitignoreAction =
  | { status: "created"; path: string }
  | { status: "appended"; path: string }
  | { status: "updated"; path: string }
  | { status: "unchanged"; path: string }
  | { status: "skipped-no-repo" };

// Idempotently keep the DuoShe block in the project's .gitignore.
// Only runs when `.git/` exists at the project root (so we don't pollute non-repo projects).
export function syncGitignore(projectRoot: string): GitignoreAction {
  if (!existsSync(join(projectRoot, ".git"))) return { status: "skipped-no-repo" };

  const path = join(projectRoot, ".gitignore");
  if (!existsSync(path)) {
    writeFileSync(path, `${RULE_BLOCK}\n`, "utf8");
    return { status: "created", path };
  }

  const current = readFileSync(path, "utf8");
  const start = current.indexOf(BEGIN_MARK);
  const end = current.indexOf(END_MARK);

  if (start === -1 || end === -1) {
    const sep = current.endsWith("\n") ? "\n" : "\n\n";
    writeFileSync(path, `${current}${sep}${RULE_BLOCK}\n`, "utf8");
    return { status: "appended", path };
  }

  const existingBlock = current.slice(start, end + END_MARK.length);
  if (existingBlock === RULE_BLOCK) return { status: "unchanged", path };

  const updated = current.slice(0, start) + RULE_BLOCK + current.slice(end + END_MARK.length);
  writeFileSync(path, updated, "utf8");
  return { status: "updated", path };
}
