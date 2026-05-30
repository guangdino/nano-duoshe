# nano-duoshe

> Local-first project memory for AI coding agents (Claude Code / Codex / Cursor).
>
> Keep project conventions, decisions, gotchas, and module boundaries next to your code — so the agent doesn't start from zero every session.

**English** | [简体中文](./README.zh-CN.md)

## Why

AI coding agents are powerful, but every new session hits the same cold-start problem:

- the agent doesn't remember your project structure;
- you re-explain architecture, conventions, and "don't touch this" rules every time;
- it re-suggests fixes you already rejected;
- it re-opens bugs you already solved;
- `CLAUDE.md` / `AGENTS.md` help, but they're flat hand-edited files — no review, no provenance, no search.

DuoShe drops a small local memory layer into each repo: long-term memory as Markdown, candidate memories that go through a review queue before becoming permanent, and SQLite FTS5 for search. Local, fast, rebuildable.

---

## 30-second start

```bash
npm install -g nano-duoshe        # install
cd your-project
duoshe init --guided              # init + 3 core questions + smart skill suggestion
```

That's it. After it finishes you'll have three daily commands:

```bash
duoshe remember "..."   # capture something you don't want to forget
duoshe review           # see pending candidates, save or drop
duoshe search "..."     # find what you wrote before
```

---

## What it creates

```text
your-project/
├─ .duoshe/                 # project memory vault (some public, some private)
│  ├─ PROJECT.md            # ✅ overview, stack, conventions (commit)
│  ├─ CODEMAP.md            # ✅ code map, entry points, routing notes (commit)
│  ├─ DECISIONS.md          # ✅ architecture decisions and rationale (commit)
│  ├─ TROUBLESHOOTING.md    # ✅ known issues and fixes (commit)
│  ├─ MODULES.md            # ✅ module boundaries — especially "does NOT own" (commit)
│  ├─ TODO.md               # ✅ current and upcoming work (commit)
│  ├─ SETUP.md              # ✅ team onboarding guide (commit)
│  ├─ SKILLS/               # ✅ enabled skill manifests (commit)
│  ├─ config.json           # ❌ local config (personal preference, don't commit)
│  ├─ CANDIDATES/           # ❌ pending drafts the user hasn't decided on (don't commit)
│  └─ index.db              # ❌ SQLite FTS5 index, rebuildable (don't commit)
├─ AGENTS.md                # auto-appended DuoShe block pointing Codex at .duoshe/
├─ CLAUDE.md                # auto-appended DuoShe block pointing Claude Code at .duoshe/
└─ .gitignore               # auto-maintained block for local state
```

When run inside a git repo, `duoshe init` **auto-maintains `.gitignore`** so private state stays local. Public memory (`PROJECT.md` etc.) you just `git add` / `git commit` normally.

The core rule: **agents can propose memory; humans decide what becomes long-term knowledge.**

---

## Two ways to use it

### 1. First time (use --guided)

```bash
duoshe init --guided
```

This:

1. scans the project and generates draft templates;
2. detects the project profile (embedded / algo / site-maintenance / AI-app / general / kid);
3. installs the bundled skills (disabled by default);
4. syncs `CLAUDE.md` / `AGENTS.md`;
5. asks 3 core questions (what's the project, rules the AI must follow, zones not to touch);
6. if it detected an embedded / algo / WordPress project, offers to enable the matching skill.

Takes about a minute end-to-end.

### 2. Daily use (3 commands)

```bash
duoshe remember "DB access must go through the service layer, not direct from routes"
duoshe review              # list pending, then  save <id>  or  drop <id>
duoshe search "service"    # find prior notes
```

---

## Skills (opt-in domain support)

DuoShe ships several optional domain skills, **disabled by default**:

| Skill | When it helps |
|---|---|
| `embedded` | C firmware / FPGA / PLC (STM32, ESP32, Vivado, Codesys, TwinCAT) |
| `matlab` | Algorithms / control engineering (MATLAB / Simulink / heavy math) |
| `devops` | Infrastructure / IaC (Terraform, Ansible, Kubernetes) |
| `wordpress` | WordPress site maintenance (also fine for non-developers) |
| `graph` | Import-graph analysis, cycle detection, hot modules |

```bash
duoshe skill list                # list everything that's installed
duoshe skill enable embedded     # turn one on (prints a short readme intro)
duoshe rescan                    # re-scan to apply the new detectors / dir labels
duoshe skill disable embedded    # turn it off
```

Once enabled, `rescan` uses the skill's extra detectors and directory labels to enrich project memory.

---

## Profile (project type)

`duoshe init` auto-detects a project profile, which controls the first-step hints and which skills get suggested.

```bash
duoshe profile show              # current profile + what a fresh scan would guess now
duoshe profile list              # all available profiles
duoshe profile set embedded      # set manually — won't get overwritten by auto-detect
```

Profiles: `kid` (learning / tutorial), `non_dev_site` (site maintenance), `algo` (algorithms / research), `embedded` (firmware / FPGA / PLC), `ai_app` (AI app / agent), `general` (default).

---

## All commands

| Command | Description |
|---|---|
| `duoshe init` | Initialize memory vault (scan + generate drafts) in the current directory |
| `duoshe init --guided` | Recommended: init + 3 questions + smart skill suggestion |
| `duoshe init --force` | Force-rewrite drafts (sections marked `<!-- USER-CONFIRMED -->` are preserved) |
| `duoshe init --quick` | Skip git history scan (faster on large repos) |
| `duoshe guide` | Just the 3 questions (re-runnable any time after init) |
| `duoshe rescan` | Re-scan and refresh the code skeleton (preserves confirmed sections) |
| `duoshe remember "..."` | Add a pending memory candidate |
| `duoshe review` | List pending candidates |
| `duoshe save <id>` | Promote to long-term memory (alias: `publish`) |
| `duoshe drop <id>` | Discard (alias: `reject`) |
| `duoshe search "..."` | Search long-term memory via SQLite FTS5 |
| `duoshe reindex` | Rebuild the local search index |
| `duoshe skill list` | List available / enabled skills |
| `duoshe skill enable <name>` | Enable a skill |
| `duoshe skill disable <name>` | Disable a skill |
| `duoshe profile show / list / set` | View or change the project profile |
| `duoshe sync` | Sync DuoShe blocks in `CLAUDE.md` / `AGENTS.md` |
| `duoshe graph` | Analyze import dependencies (requires `graph` skill enabled) |
| `duoshe upgrade` | Check for a new nano-duoshe release |
| `duoshe uninstall` | Remove DuoShe blocks from `CLAUDE.md` / `AGENTS.md` (does not delete `.duoshe/`) |
| `duoshe mcp` | _Planned_: MCP stdio server |
| `duoshe session ...` | _Planned_: import conversation transcripts |

Candidate types: `decision`, `troubleshooting`, `module_boundary`, `project_fact`, `user_preference`.

---

## Team workflow

- After you `git push`, **teammates don't need to run `duoshe init`** — the repo already has the shared `.duoshe/` memory.
- For them to use `duoshe` commands locally: `npm i -g nano-duoshe`, then run anywhere in the project.
- First run rebuilds the local search index automatically (doesn't affect others).
- To make tools that don't read `CLAUDE.md` (e.g. Cursor) use the memory, see `.duoshe/SETUP.md`.

---

## Current status

`0.1.0-alpha.0`. Implemented:

- repo scan + PROJECT.md / CODEMAP.md / DECISIONS.md draft generation
- auto profile detection (6 profiles)
- 5 bundled optional skills (embedded / matlab / devops / wordpress / graph)
- CLAUDE.md / AGENTS.md auto-sync (preserves existing content)
- candidate → review → save / drop flow
- SQLite FTS5 search with CJK + Latin tokenization
- `.gitignore` auto-maintenance (private state isolation)
- simple guided mode (`init --guided`)
- soft update notifier + `duoshe upgrade`
- CI: Linux / macOS / Windows × Node 20/22 lint / typecheck / test / build

Planned:

- **M4**: session transcript import and deduplication
- **M5**: MCP stdio server (`memory.search`, `memory.get_project_context`, candidate tools)
- **M6**: Claude Code hook templates
- **v0.2**: optional LLM-assisted candidate extraction

---

## Design principles

- **Local-first.** Memory lives in your repo as Markdown and SQLite. No cloud.
- **Review before permanence.** Agent suggestions go through a candidate queue.
- **Traceable.** Saved memory keeps source metadata.
- **Tool-agnostic.** The CLI works everywhere; MCP is the next adapter.
- **Non-invasive.** DuoShe only edits its own delimited block in `CLAUDE.md` / `AGENTS.md`.
- **Rebuildable index.** `index.db` is derived data; regenerable any time.
- **Occam's razor.** The core is 5 essential commands; domain features grow as opt-in skills.

---

## Install

Once published:

```bash
npm install -g nano-duoshe
```

Local development:

```bash
git clone https://github.com/guangdino/nano-duoshe.git
cd nano-duoshe
npm install
npm run build
npm link
```

Requirements: Node.js 20+, npm, native build support for `better-sqlite3`.

---

## Privacy

DuoShe is local-first. Public memory files are normal Markdown — you decide what enters git. `index.db`, `CANDIDATES/`, and future `SESSIONS/` are rebuildable / noisy / private and should generally stay out of version control (`duoshe init` adds them to `.gitignore` automatically).

---

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

| Script | Purpose |
|---|---|
| `npm run dev` | Run the TypeScript CLI through `tsx` |
| `npm run build` | Compile to `dist/` (with skill assets) |
| `npm test` | Vitest |
| `npm run lint` | Biome |
| `npm run prepublishOnly` | Release gate: lint + typecheck + test + build |

See [DESIGN.md](./DESIGN.md) for the engineering plan.

---

## Contributing

DuoShe is early. Issues, discussions, and small focused PRs are welcome.

Before opening a PR:

```bash
npm run prepublishOnly
```

Please keep changes aligned with these constraints:

- don't auto-promote agent output to long-term memory;
- preserve existing user content in `CLAUDE.md` / `AGENTS.md`;
- keep core logic independent from CLI and future MCP adapters;
- prefer simple local formats over remote services;
- new domain capabilities go in as skills rather than into the core.

---

## License

MIT. See [LICENSE](./LICENSE).
