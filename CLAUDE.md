# Claude Code Instructions

<!-- BEGIN DUOSHE -->
## Project Memory (managed by DuoShe)

This project uses **DuoShe** for structured, traceable project memory.
Authoritative memory lives in `.duoshe/`:

- `.duoshe/PROJECT.md` — project overview, tech stack, conventions
- `.duoshe/DECISIONS.md` — architecture decisions (with rationale)
- `.duoshe/TROUBLESHOOTING.md` — known issues and how to fix them
- `.duoshe/MODULES.md` — module boundaries (what each part owns and does NOT own)
- `.duoshe/TODO.md` — current work and what's next

**For AI agents:** prefer the `memory.search` and `memory.get_project_context`
MCP tools over reading these files directly — they hit a SQLite FTS5 index and
stay under context budget.

**To update memory:** do not edit DECISIONS / TROUBLESHOOTING / MODULES by hand for
long-form changes — use `duoshe remember "..." --type <decision|troubleshooting|module_boundary>`,
then `duoshe review` and `duoshe publish <id>`. This keeps every long-term memory
traceable to the conversation it came from.

_This block is managed by DuoShe. Edit between the markers if you want — DuoShe will
preserve your edits and only warn on conflict. Run `duoshe uninstall` to remove cleanly._
<!-- END DUOSHE -->
