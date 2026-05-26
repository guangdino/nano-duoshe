# nano-duoshe

> 遭啦遭啦，AI 智能体夺舍了我的项目，这下硅基永生了。
>
> Local-first project memory for AI coding agents.
>
> Keep architecture decisions, project conventions, and solved bugs next to your code, then make them searchable for Claude Code, Codex, Cursor, and other agent workflows.

**English** | [简体中文](./README.zh-CN.md)

## Why

AI coding agents are powerful, but every new session starts with the same cold-start problem:

- the agent does not remember your project structure;
- you repeat architecture decisions and team conventions;
- it suggests fixes you already rejected;
- it reopens bugs you already solved;
- `CLAUDE.md` and `AGENTS.md` are useful, but they are flat files without review, evidence, or search.

DuoShe adds a small, local memory layer inside each repository. It stores long-term project knowledge as plain Markdown, keeps candidate memories reviewable before they become permanent, and builds a SQLite FTS5 index so agents can retrieve the right context quickly.

## What It Creates

```text
your-project/
├─ .duoshe/
│  ├─ PROJECT.md          # project overview, stack, conventions
│  ├─ DECISIONS.md        # architecture decisions and rationale
│  ├─ TROUBLESHOOTING.md  # known issues and fixes
│  ├─ MODULES.md          # module boundaries
│  ├─ TODO.md             # lightweight project working memory
│  ├─ CANDIDATES/         # pending / published / rejected memory candidates
│  ├─ SESSIONS/           # raw session transcripts, planned
│  └─ index.db            # rebuildable SQLite FTS5 index
├─ AGENTS.md              # optional thin shell pointing agents to .duoshe/
└─ CLAUDE.md              # optional thin shell pointing Claude Code to .duoshe/
```

The important rule: agents can propose memory, but humans decide what becomes long-term knowledge.

## Current Status

DuoShe is `0.1.0-alpha.0`.

Implemented today:

- initialize `.duoshe/` from a repository scan;
- generate and update `AGENTS.md` / `CLAUDE.md` shell blocks without clobbering existing content;
- add candidate memories with `duoshe remember`;
- review, publish, or reject candidates;
- publish candidates into long-term Markdown files with traceability metadata;
- rebuild and query a local SQLite FTS5 memory index;
- CI workflow configured for lint, typecheck, tests, build, and CLI smoke tests on Node 20/22 across Linux, macOS, and Windows.

Planned next:

- session transcript import and deduplication;
- MCP stdio server and memory tools;
- Claude Code hook templates;
- optional LLM-assisted candidate extraction.

## Install

From npm, once published:

```bash
npm install -g nano-duoshe
```

During local development:

```bash
git clone https://github.com/guangdino/nano-duoshe.git
cd nano-duoshe
npm install
npm run build
npm link
```

Requirements:

- Node.js 20 or newer;
- npm;
- native install support for `better-sqlite3`.

## Quick Start

Initialize DuoShe in a project:

```bash
cd your-project
duoshe init
```

Review the generated memory files:

```bash
ls .duoshe
```

Add a candidate memory:

```bash
duoshe remember "We use direct SQL here; do not introduce an ORM without an explicit decision." --type decision
```

Review pending candidates:

```bash
duoshe review
```

Publish one into long-term memory:

```bash
duoshe publish <candidate_id>
```

Search project memory:

```bash
duoshe search "ORM"
```

Refresh the search index:

```bash
duoshe reindex
```

Remove DuoShe blocks from `AGENTS.md` / `CLAUDE.md` without deleting `.duoshe/`:

```bash
duoshe uninstall
```

## CLI

| Command | Status | Description |
| --- | --- | --- |
| `duoshe init` | available | Create `.duoshe/`, scan the project, and sync shell blocks. |
| `duoshe rescan` | available | Re-scan the project while preserving existing memory files. |
| `duoshe sync` | available | Sync DuoShe blocks in `AGENTS.md` and `CLAUDE.md`. |
| `duoshe remember <content>` | available | Add a pending memory candidate. |
| `duoshe review` | available | List candidates by status. |
| `duoshe publish <id>` | available | Append a candidate to its target Markdown file. |
| `duoshe reject <id>` | available | Reject and archive a candidate. |
| `duoshe search <query>` | available | Search long-term memory with SQLite FTS5. |
| `duoshe reindex` | available | Rebuild the local search index. |
| `duoshe session ...` | planned | Import and inspect raw conversation transcripts. |
| `duoshe mcp` | planned | Start an MCP stdio server for agent tools. |

Candidate types:

```text
decision
troubleshooting
module_boundary
project_fact
user_preference
```

## Design Principles

- **Local-first.** Memory lives in your repository as Markdown and SQLite. No cloud service is required.
- **Review before permanence.** Agent suggestions enter a candidate queue first.
- **Traceable.** Published memory keeps metadata about where it came from.
- **Tool-agnostic.** The CLI works everywhere; MCP integration is the next step.
- **Non-invasive.** DuoShe edits only its own delimited block in `AGENTS.md` and `CLAUDE.md`.
- **Rebuildable index.** `index.db` is derived data and can be regenerated at any time.

## Privacy

DuoShe is designed to keep project memory local. Long-term memory files are normal Markdown, so you decide what enters git. Rebuildable and potentially noisy local data, such as `.duoshe/index.db`, candidates, and future session transcripts, should generally stay out of version control unless your team explicitly wants to share them.

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Run the TypeScript CLI through `tsx`. |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm test` | Run Vitest tests. |
| `npm run lint` | Run Biome checks. |
| `npm run format` | Format with Biome. |
| `npm run prepublishOnly` | Run the release gate: lint, typecheck, test, build. |

## Roadmap

- **M4: Session archive.** Import Claude Code / Codex / Cursor transcripts, deduplicate turns, and keep raw evidence local.
- **M5: MCP server.** Expose `memory.search`, `memory.get_project_context`, and candidate tools over stdio.
- **M6: Hook templates.** Help users wire session capture into Claude Code.
- **v0.2: Assisted extraction.** Optional LLM-assisted candidate drafting and better summaries.

See [DESIGN.md](./DESIGN.md) for the engineering plan.

## Contributing

DuoShe is early. Issues, discussions, and small focused pull requests are welcome.

Before opening a PR:

```bash
npm run prepublishOnly
```

Please keep changes aligned with the project rules:

- do not auto-promote agent output into long-term memory;
- preserve existing user content in `AGENTS.md` and `CLAUDE.md`;
- keep core logic independent from CLI and future MCP adapters;
- prefer simple local formats over remote services.

## License

MIT. See [LICENSE](./LICENSE).
