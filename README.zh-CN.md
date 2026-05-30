# nano-duoshe（夺舍）

> 本地优先的项目记忆层，给 AI 编程工具（Claude Code / Codex / Cursor）用。
>
> 把项目约定、决策、踩坑、模块边界放进代码仓库里 —— AI 下次进项目时不再像第一次来。

[English](./README.md) | **简体中文**

## 为什么做 DuoShe

AI 编程工具已经很强，但有一个很烦的冷启动问题：

- 每次新会话都不记得项目结构；
- 你反复解释架构、约定和"千万别动"的地方；
- 它会重复推荐你已经否掉的方案；
- 它会重新踩你已经修过的坑；
- `CLAUDE.md` / `AGENTS.md` 有用，但本质是扁平手写文件，没有 review、来源追踪、也搜不动。

DuoShe 在每个项目里放一个轻量的本地记忆库：长期记忆是 Markdown，候选记忆先进 review 队列、确认后再保存，搜索用 SQLite FTS5。本地、快、可重建。

---

## 30 秒上手

```bash
npm install -g nano-duoshe        # 安装
cd your-project
duoshe init --guided              # 初始化 + 3 个核心问题 + 智能推荐 skill
```

就这样。完成后会告诉你日常用 3 个命令：

```bash
duoshe remember "..."   # 想到什么先记下来
duoshe review           # 看待确认的记录，保存或丢弃
duoshe search "..."     # 在项目记忆里搜
```

---

## 它会生成什么

```text
your-project/
├─ .duoshe/                 # 项目记忆库（部分文件公共、部分私人）
│  ├─ PROJECT.md            # ✅ 项目概览、技术栈、约定（commit）
│  ├─ CODEMAP.md            # ✅ 代码地图、入口、路由提示（commit）
│  ├─ DECISIONS.md          # ✅ 架构决策和原因（commit）
│  ├─ TROUBLESHOOTING.md    # ✅ 已知问题和修法（commit）
│  ├─ MODULES.md            # ✅ 模块边界，特别是"不该做什么"（commit）
│  ├─ TODO.md               # ✅ 当前 / 接下来的工作（commit）
│  ├─ SETUP.md              # ✅ 给团队看的接入说明（commit）
│  ├─ SKILLS/               # ✅ 已启用的技能 manifest（commit）
│  ├─ config.json           # ❌ 本地配置（个人偏好，不 commit）
│  ├─ CANDIDATES/           # ❌ 草稿状态的待确认记录（不 commit）
│  └─ index.db              # ❌ SQLite FTS5 索引，可重建（不 commit）
├─ AGENTS.md                # 自动追加 DuoShe 块，引导 Codex 读 .duoshe/
├─ CLAUDE.md                # 自动追加 DuoShe 块，引导 Claude Code 读 .duoshe/
└─ .gitignore               # 自动加入需要忽略的本地状态
```

`duoshe init` 在 git 仓库里跑时会**自动维护 `.gitignore`**，把私人状态加进去。
公共记忆（PROJECT.md 等）正常 `git add` / `git commit` 即可。

核心规则：**AI 可以提出记忆，人来决定什么进入长期记忆。**

---

## 用 DuoShe 的两种姿势

### 1. 第一次跑（推荐 --guided）

```bash
duoshe init --guided
```

这会：

1. 扫描项目，生成草稿模板；
2. 检测项目类型（嵌入式 / 算法 / 网站 / AI 应用 / 通用 / 学习项目）；
3. 安装内置技能（默认不启用）；
4. 同步 `CLAUDE.md` / `AGENTS.md`；
5. 问 3 个核心问题（项目是干嘛的、AI 必须记住的规矩、不要乱动的地方）；
6. 如果检测到嵌入式 / 算法 / WordPress，问你要不要启用对应 skill。

完整体验 1 分钟左右。

### 2. 日常用（3 个命令）

```bash
duoshe remember "数据库操作必须走 service 层，不能在 route 里直查"
duoshe review            # 看待确认，输入 save <id> / drop <id>
duoshe search "service"  # 找过去记下的内容
```

---

## Skills（按需启用的扩展能力）

DuoShe 自带一些专项识别能力，**默认不启用**，按需打开：

| Skill | 适合什么场景 |
|---|---|
| `embedded` | 嵌入式开发（C 固件 / FPGA / PLC / STM32 / ESP32 / Vivado / Codesys） |
| `matlab` | 算法 / 控制工程（MATLAB / Simulink / 数学推导密集型项目） |
| `devops` | 基础设施 / IaC（Terraform / Ansible / Kubernetes） |
| `wordpress` | WordPress 站点维护（非开发者也能用） |
| `graph` | 依赖图分析、循环依赖检测、热点模块 |

操作：

```bash
duoshe skill list                # 看所有已安装的
duoshe skill enable embedded     # 启用一个（会打印一段引导）
duoshe rescan                    # 用新激活的 skill 重新扫描
duoshe skill disable embedded    # 关掉
```

启用后 `rescan` 会用新增的探测器和目录标签丰富项目记忆。

---

## Profile（项目类型）

DuoShe 在 init 时会自动猜你的项目类型 —— 这影响 PROJECT.md 的引导提示和默认建议的 skill。

```bash
duoshe profile show              # 看当前类型 + 现在重新扫描会猜啥
duoshe profile list              # 看所有可选类型
duoshe profile set embedded      # 手动设置，下次不会被自动检测覆盖
```

类型：`kid`（学习 / 练习）、`non_dev_site`（网站维护）、`algo`（算法 / 研究）、`embedded`（嵌入式 / FPGA / PLC）、`ai_app`（AI 应用 / Agent）、`general`（通用）。

---

## 全部命令

| 命令 | 说明 |
|---|---|
| `duoshe init` | 在当前目录初始化记忆库（扫描 + 生成 PROJECT.md 等草稿） |
| `duoshe init --guided` | 推荐：初始化 + 3 个问题 + 智能推荐 skill |
| `duoshe init --force` | 强制重写草稿（带 `<!-- USER-CONFIRMED -->` 的内容会保留） |
| `duoshe init --quick` | 跳过 git 历史扫描（大仓库更快） |
| `duoshe guide` | 单独跑 3 个问题（init 后随时可再跑） |
| `duoshe rescan` | 重扫项目，刷新代码骨架（保留你确认过的部分） |
| `duoshe remember "..."` | 添加一条候选记忆（pending 状态） |
| `duoshe review` | 看待确认的记录 |
| `duoshe save <id>` | 保存到长期记忆（别名：`publish`） |
| `duoshe drop <id>` | 丢弃（别名：`reject`） |
| `duoshe search "..."` | 用 SQLite FTS5 搜长期记忆 |
| `duoshe reindex` | 重建本地搜索索引 |
| `duoshe skill list` | 列出所有可用 / 已启用技能 |
| `duoshe skill enable <name>` | 启用技能 |
| `duoshe skill disable <name>` | 禁用技能 |
| `duoshe profile show / list / set` | 看 / 改项目类型 |
| `duoshe sync` | 同步 CLAUDE.md / AGENTS.md 里的 DuoShe 块 |
| `duoshe graph` | 分析代码 import 依赖（需启用 graph skill） |
| `duoshe upgrade` | 检查 nano-duoshe 有没有新版本 |
| `duoshe uninstall` | 从 CLAUDE.md / AGENTS.md 移除 DuoShe 块（不删除 .duoshe/） |
| `duoshe mcp` | _规划中_：启动 MCP stdio server |
| `duoshe session ...` | _规划中_：导入对话 transcript |

候选类型：`decision`、`troubleshooting`、`module_boundary`、`project_fact`、`user_preference`。

---

## 团队协作

- `git push` 之后，**其他人 pull 下来不用再跑 `duoshe init`** —— 仓库里已经有 `.duoshe/` 的公共记忆了。
- 队友想用 `duoshe` 命令搜索 / 记录，让他们 `npm i -g nano-duoshe`，然后在项目目录跑就行。
- 第一次跑命令时 duoshe 会自动重建本地搜索索引（不影响别人）。
- 想让 Cursor 之类不读 `CLAUDE.md` 的工具也用上记忆，看 `.duoshe/SETUP.md` 里的说明。

---

## 当前状态

`0.1.0-alpha.0`。已实现：

- 仓库扫描 + 生成 PROJECT.md / CODEMAP.md / DECISIONS.md 等草稿
- 项目类型自动检测（6 种 profile）
- 内置 5 个可选 skill（embedded / matlab / devops / wordpress / graph）
- CLAUDE.md / AGENTS.md 自动同步（不覆盖你的原内容）
- 候选记忆 → review → save / drop 流程
- SQLite FTS5 中英文搜索（CJK bigram + Latin 分词）
- `.gitignore` 自动维护（私人状态隔离）
- 简易引导模式（init --guided）
- 软更新通知 + `duoshe upgrade`
- CI workflow：Linux / macOS / Windows × Node 20/22 跑 lint / typecheck / test / build

规划中：

- M4: Session transcript 导入和去重
- M5: MCP stdio server（`memory.search`、`memory.get_project_context` 等工具）
- M6: Claude Code hooks 模板
- v0.2: 可选的 LLM 辅助候选提取

---

## 设计原则

- **本地优先。** 记忆存仓库里，用 Markdown 和 SQLite，不依赖云服务。
- **先 review，再长期化。** AI 提的建议先进候选队列。
- **可追溯。** 保存后的记忆保留来源元信息。
- **工具中立。** CLI 永远可用，MCP 是下一步接入层。
- **不侵入。** DuoShe 只动 `CLAUDE.md` / `AGENTS.md` 里自己那段带标记的块。
- **索引可重建。** `index.db` 是派生数据，随时可以重新生成。
- **奥卡姆剃刀。** 核心只保留最不可少的 5 个命令；专项功能用 skill 按需启用。

---

## 安装

正常用：

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

要求：Node.js 20+、npm、能编译 `better-sqlite3` 的环境。

---

## 隐私

DuoShe 默认本地优先。公共记忆是 Markdown，是否进 git 由你决定。`index.db`、`CANDIDATES/`、`SESSIONS/` 这些通常不建议提交（`duoshe init` 会自动加入 `.gitignore`）。

---

## 开发

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

| 脚本 | 用途 |
|---|---|
| `npm run dev` | 通过 `tsx` 直接跑 TypeScript |
| `npm run build` | 编译到 `dist/`（含 skill 资源） |
| `npm test` | Vitest |
| `npm run lint` | Biome |
| `npm run prepublishOnly` | 发布前门禁：lint + typecheck + test + build |

工程方案见 [DESIGN.md](./DESIGN.md)。

---

## 贡献

DuoShe 还很早期，欢迎 issue、讨论和小而清晰的 PR。

提交 PR 前请先跑：

```bash
npm run prepublishOnly
```

请尽量遵守这些约束：

- 不要让 AI 自动把内容晋升为长期记忆；
- 不要覆盖用户已有的 `CLAUDE.md` / `AGENTS.md` 内容；
- 保持 core 逻辑独立于 CLI 和未来 MCP adapter；
- 优先使用简单、本地、可检查的格式；
- 新增域专项能力优先考虑做成 skill，而不是塞进核心。

---

## License

MIT。见 [LICENSE](./LICENSE)。
