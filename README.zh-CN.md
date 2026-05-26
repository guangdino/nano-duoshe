# nano-duoshe（夺舍）

> 给 AI 编程 Agent 用的本地优先项目记忆层。
>
> 把架构决策、项目约定、踩坑记录和模块边界放回代码仓库里，让 Claude Code、Codex、Cursor 和自研 Agent 下一次进项目时不再像第一次来。

[English](./README.md) | **简体中文**

## 为什么做 DuoShe

AI 编程工具已经很强，但它们有一个很烦的冷启动问题：

- 每次新会话都不记得项目结构；
- 你反复解释架构、约定和“千万别动”的地方；
- 它会重复推荐你已经否掉的方案；
- 它会重新踩你已经修过的坑；
- `CLAUDE.md` / `AGENTS.md` 有用，但本质还是扁平手写文件，没有 review、证据和搜索。

DuoShe 在每个项目里放一个轻量的本地记忆库。长期记忆用普通 Markdown 保存，候选记忆先进入 review 队列，确认后再发布；搜索用 SQLite FTS5，本地、快、可重建。

“夺舍”这个名字有点中二，但方向很朴素：让项目的上下文、经验和判断跟着代码走，而不是散在一次次聊天里。

## 它会生成什么

```text
your-project/
├─ .duoshe/
│  ├─ PROJECT.md          # 项目概览、技术栈、约定
│  ├─ DECISIONS.md        # 架构决策和原因
│  ├─ TROUBLESHOOTING.md  # 已知问题和修复方法
│  ├─ MODULES.md          # 模块边界
│  ├─ TODO.md             # 轻量项目工作记忆
│  ├─ CANDIDATES/         # pending / published / rejected 候选记忆
│  ├─ SESSIONS/           # 原始对话证据层，规划中
│  └─ index.db            # 可重建的 SQLite FTS5 索引
├─ AGENTS.md              # 可选薄壳，引导 Agent 读取 .duoshe/
└─ CLAUDE.md              # 可选薄壳，引导 Claude Code 读取 .duoshe/
```

核心规则很简单：AI 可以提出记忆，人来决定什么能进入长期记忆。

## 当前状态

DuoShe 现在是 `0.1.0-alpha.0`。

目前已经可用：

- 根据仓库扫描初始化 `.duoshe/`；
- 生成和更新 `AGENTS.md` / `CLAUDE.md` 中的 DuoShe block，并保留原有内容；
- 用 `duoshe remember` 添加候选记忆；
- review、publish、reject 候选；
- 发布候选到长期 Markdown，并保留追溯信息；
- 用 SQLite FTS5 建索引和搜索长期记忆；
- 已配置 CI workflow：在 Linux、macOS、Windows 的 Node 20/22 上跑 lint、typecheck、test、build 和 CLI smoke test。

接下来要做：

- 会话 transcript 导入和去重；
- MCP stdio server 和 memory tools；
- Claude Code hooks 模板；
- 可选的 LLM 候选记忆提取。

## 安装

发布到 npm 后：

```bash
npm install -g nano-duoshe
```

本地开发：

```bash
git clone https://github.com/guangdino/nano-duoshe.git
cd nano-duoshe
npm install
npm run build
npm link
```

要求：

- Node.js 20 或更高；
- npm；
- 当前环境能安装 `better-sqlite3` 原生依赖。

## 快速开始

在一个项目里初始化：

```bash
cd your-project
duoshe init
```

查看生成的记忆文件：

```bash
ls .duoshe
```

添加一条候选记忆：

```bash
duoshe remember "这里直接写 SQL，不要在没有明确决策的情况下引入 ORM。" --type decision
```

查看待确认候选：

```bash
duoshe review
```

发布到长期记忆：

```bash
duoshe publish <candidate_id>
```

搜索项目记忆：

```bash
duoshe search "ORM"
```

重建索引：

```bash
duoshe reindex
```

从 `AGENTS.md` / `CLAUDE.md` 移除 DuoShe block，但保留 `.duoshe/`：

```bash
duoshe uninstall
```

## CLI 命令

| 命令 | 状态 | 说明 |
| --- | --- | --- |
| `duoshe init` | 可用 | 创建 `.duoshe/`、扫描项目、同步薄壳 block。 |
| `duoshe rescan` | 可用 | 重新扫描项目，保留已有记忆文件。 |
| `duoshe sync` | 可用 | 同步 `AGENTS.md` 和 `CLAUDE.md` 里的 DuoShe block。 |
| `duoshe remember <content>` | 可用 | 添加 pending 状态的候选记忆。 |
| `duoshe review` | 可用 | 按状态列出候选。 |
| `duoshe publish <id>` | 可用 | 把候选追加到目标 Markdown。 |
| `duoshe reject <id>` | 可用 | 拒绝并归档候选。 |
| `duoshe search <query>` | 可用 | 用 SQLite FTS5 搜索长期记忆。 |
| `duoshe reindex` | 可用 | 重建本地搜索索引。 |
| `duoshe session ...` | 规划中 | 导入和查看原始对话 transcript。 |
| `duoshe mcp` | 规划中 | 启动 MCP stdio server，供 Agent 调用。 |

候选类型：

```text
decision
troubleshooting
module_boundary
project_fact
user_preference
```

## 设计原则

- **本地优先。** 记忆存在你的仓库里，用 Markdown 和 SQLite，不依赖云服务。
- **先 review，再长期化。** Agent 的建议先进候选队列。
- **可追溯。** 发布后的记忆保留来源元信息。
- **工具中立。** CLI 永远可用，MCP 是下一步接入层。
- **不侵入。** DuoShe 只维护 `AGENTS.md` / `CLAUDE.md` 中自己那段带标记的 block。
- **索引可重建。** `index.db` 是派生数据，随时可以重新生成。

## 隐私边界

DuoShe 的默认方向是本地优先。长期记忆文件是普通 Markdown，是否进入 git 由你决定。`.duoshe/index.db`、候选记录和未来的 session transcripts 可能包含噪音或敏感上下文，通常不建议提交，除非团队明确要共享。

## 开发

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

常用脚本：

| 脚本 | 用途 |
| --- | --- |
| `npm run dev` | 通过 `tsx` 运行 TypeScript CLI。 |
| `npm run build` | 编译 TypeScript 到 `dist/`。 |
| `npm test` | 运行 Vitest 测试。 |
| `npm run lint` | 运行 Biome 检查。 |
| `npm run format` | 用 Biome 格式化。 |
| `npm run prepublishOnly` | 发布前门禁：lint、typecheck、test、build。 |

## 路线图

- **M4：Session archive。** 导入 Claude Code / Codex / Cursor 对话，去重 turn，并保留本地证据层。
- **M5：MCP server。** 通过 stdio 暴露 `memory.search`、`memory.get_project_context` 和 candidate tools。
- **M6：Hook templates。** 帮用户把 Claude Code 会话捕获接起来。
- **v0.2：辅助提取。** 可选的 LLM 候选记忆草稿和更好的摘要。

工程方案见 [DESIGN.md](./DESIGN.md)。

## 贡献

DuoShe 还很早期，欢迎 issue、讨论和小而清晰的 PR。

提交 PR 前请先跑：

```bash
npm run prepublishOnly
```

请尽量遵守这些项目约束：

- 不要让 Agent 自动把内容晋升为长期记忆；
- 不要覆盖用户已有的 `AGENTS.md` / `CLAUDE.md` 内容；
- 保持 core 逻辑独立于 CLI 和未来 MCP adapter；
- 优先使用简单、本地、可检查的格式。

## License

MIT。见 [LICENSE](./LICENSE)。
