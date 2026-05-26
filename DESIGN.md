# DuoShe v0.1 工程方案

> **DuoShe(夺舍)** — 本地优先的项目记忆层,装进任意项目就让 Claude Code / Codex / Cursor 拥有可追溯、可治理、可复用的长期记忆。

---

## 1. 项目定位

**一句话:** 用 Claude Code / Codex 改老代码的开发者,装上 DuoShe,AI 第二次进来时就认识这个项目。

### 1.1 目标用户

- 用 Claude Code / Codex / Cursor 改**大型遗留项目**的开发者
- 痛点:代码体量大、AI 上下文塞不下、每次都要重新解释项目背景、改一处坏三处、踩同一个坑

### 1.2 v0.1 目标指标(12 个月内验证)

- 6 个月内:1,000 npm 周下载
- 12 个月内:10,000 npm 周下载、500+ GitHub Star
- 18-24 个月:**中国 AI 编程开发者人手必装**(覆盖目标盘子 15 万人)

### 1.3 与其他工具的关系

| 工具 | DuoShe 的关系 |
|---|---|
| Claude Code | 通过 MCP stdio 接入;提供 `.claude/settings.json` hooks 模板;可选自动维护 `CLAUDE.md` 薄壳块 |
| Codex | 通过 MCP stdio 接入;可选自动维护 `AGENTS.md` 薄壳块 |
| Cursor | 通过 MCP 接入(Cursor 已支持) |
| 自研 Agent | 通过 MCP / 直接调 CLI 接入 |
| CLAUDE.md / AGENTS.md | **不替代,薄壳引用跳转**(HTML 注释标记块,不污染、可叠加、可逆) |

### 1.4 不做什么(v0.1 明确边界)

- 不做 REST API(推到 v0.2)
- 不做自动 LLM candidate 提取(推到 v0.2)
- 不做向量库 / pgvector / Qdrant / LanceDB(推到 v0.5)
- 不做知识图谱 / Neo4j(推到 v0.6)
- 不做多项目全局记忆(推到 v0.4)
- 不做云同步、团队权限(推到 v1.0+)
- 不做 Skills 实现(目录预留,推到 v0.3)
- 不做 Web Dashboard(推到 v1.0)

---

## 2. 核心架构

### 2.1 三段式记忆模型(灵魂)

```
对话原文(证据层)
  → session transcript (JSONL,可追溯)
        ↓
价值信息(候选层)
  → candidate (pending,可 review)
        ↓
用户确认后(长期层)
  → Markdown 长期记忆(DECISIONS.md / TROUBLESHOOTING.md / ...)
```

**铁律:每条长期记忆必须能追溯到 `sourceSessionId + sourceTurnRange`。**

### 2.2 模块划分

```
duoshe (npm package)
├─ cli/              CLI 入口 (commander/yargs)
├─ core/             核心业务逻辑(无 IO 依赖,易测试)
│   ├─ vault/        Markdown 长期记忆读写
│   ├─ session/      Session transcript 读写、去重
│   ├─ candidate/    Candidate 生命周期管理
│   ├─ indexer/      SQLite FTS5 索引构建与查询
│   └─ scanner/      轻量代码骨架扫描(技术栈识别 + 文件树 + git 高频)
├─ mcp/              MCP stdio server(注册 8 个 tools)
├─ adapters/
│   ├─ claude-md.ts  CLAUDE.md / AGENTS.md 薄壳块管理
│   └─ hooks.ts      Claude Code hooks 模板生成
└─ types/            共享类型定义
```

**原则:** `core/` 不依赖 `cli/` / `mcp/`,以便后续可以被任意宿主调用(包括将来嵌入 C# 软件的桥接层)。

---

## 3. 文件结构(`.duoshe/`)

```
.duoshe/
├─ config.json              项目配置
├─ PROJECT.md               项目总览(init 扫描后自动生成草稿)
├─ DECISIONS.md             架构决策
├─ TROUBLESHOOTING.md       踩坑记录
├─ MODULES.md               模块边界(init 扫描后自动生成草稿)
├─ TODO.md                  当前任务
├─ SESSIONS/
│   └─ session_20260524_001/
│       ├─ transcript.jsonl 对话原文(每行一个 turn)
│       ├─ summary.md       会话摘要(可选,v0.1 手动写)
│       └─ candidates.jsonl 该会话产生的候选
├─ CANDIDATES/
│   ├─ pending.jsonl
│   ├─ accepted.jsonl
│   └─ rejected.jsonl
├─ SKILLS/                  v0.1 预留目录,不实现
└─ index.db                 SQLite FTS5 索引(可重建,可 .gitignore)
```

### 3.1 `.gitignore` 建议

`duoshe init` 时询问用户是否追加以下条目:

```
.duoshe/SESSIONS/          # 对话原文不入库(隐私 + 体积)
.duoshe/CANDIDATES/        # 候选不入库
.duoshe/index.db           # 索引可重建
```

**入库的:** `PROJECT.md` / `DECISIONS.md` / `TROUBLESHOOTING.md` / `MODULES.md` / `TODO.md` / `config.json`(团队共享)

---

## 4. 关键设计:5 分钟出价值的 `duoshe init`

**冷启动决定生死。** `duoshe init` 必须在 3 分钟内让用户感受到"它真的认识我这个项目"。

### 4.1 init 流程

```
duoshe init
  ├─ [1] 检测项目类型
  │   读 package.json / *.csproj / pyproject.toml / go.mod / Cargo.toml / pom.xml
  │   推断语言 / 框架 / 主要依赖
  │
  ├─ [2] 扫描文件树
  │   尊重 .gitignore
  │   识别顶层目录职责(src/test/docs/scripts/...)
  │   找入口文件(main.* / index.* / Program.cs / __main__.py)
  │
  ├─ [3] 读 git 历史(若是 git 仓库)
  │   最近 30 天高频改动的 10 个文件 → "热点区域"
  │   最大的 10 个源文件 → "复杂度热点"
  │   贡献者数量 → 团队规模线索
  │
  ├─ [4] 生成草稿
  │   PROJECT.md  ← 技术栈 + 入口 + 主要目录 + 项目规模
  │   MODULES.md  ← 顶层目录职责猜测(标记为「DRAFT,请确认」)
  │   DECISIONS.md / TROUBLESHOOTING.md / TODO.md ← 空模板带说明
  │
  ├─ [5] 处理 CLAUDE.md / AGENTS.md(薄壳引用)
  │   见 §5
  │
  ├─ [6] 询问 .gitignore 追加
  │
  └─ [7] 输出下一步引导
      "DuoShe 已就绪。推荐下一步:
       1. 检查 .duoshe/PROJECT.md(2 分钟)
       2. 在 Claude Code 配置 MCP: 见 .duoshe/INTEGRATION.md
       3. 试一句:'根据 .duoshe/ 介绍这个项目'"
```

### 4.2 扫描的硬约束

- **纯静态**:不调 LLM、不读文件内容(只读 metadata 和 git log)
- **快速**:10 万文件的项目要在 30 秒内完成
- **可中断**:Ctrl+C 不留下半生不熟的 `.duoshe/`
- **可重跑**:`duoshe init --force` 或 `duoshe rescan` 重新扫描,不覆盖用户已确认的内容(检测 HTML 注释里的 `<!-- USER-CONFIRMED -->` 标记)

---

## 5. CLAUDE.md / AGENTS.md 共存机制

### 5.1 三种场景处理

**场景 A:用户已有 CLAUDE.md(有内容)**

不覆盖。在文件末尾追加标记块:

```markdown
<!-- BEGIN DUOSHE -->
## Project Memory (managed by DuoShe)

This project uses DuoShe for structured project memory.
Authoritative memory lives in `.duoshe/`:

- `.duoshe/PROJECT.md` — project overview
- `.duoshe/DECISIONS.md` — architecture decisions (with rationale)
- `.duoshe/TROUBLESHOOTING.md` — known issues and fixes
- `.duoshe/MODULES.md` — module boundaries

**For agents:** prefer the `memory.search` and `memory.get_project_context`
MCP tools over reading these files directly. Memory is indexed in SQLite FTS5.

To update: do not edit these files manually for long-form decisions —
use `duoshe remember` or the `memory.add_candidate` MCP tool, then `duoshe publish`.
<!-- END DUOSHE -->
```

**场景 B:用户没有 CLAUDE.md**

询问("生成 CLAUDE.md 引用 DuoShe 吗? y/N"),yes 则生成纯薄壳。

**场景 C:同时有 CLAUDE.md 和 AGENTS.md**

两个文件分别处理,内容一致。

### 5.2 工程铁律

- **HTML 注释标记块** (`<!-- BEGIN DUOSHE -->` / `<!-- END DUOSHE -->`):Markdown 渲染时不可见,DuoShe 可精确更新和移除
- **永不覆盖块外内容**
- **`duoshe sync`**:更新薄壳块,检测块内用户改动 → 警告但不动
- **`duoshe uninstall`**:精确移除标记块,留下用户原内容,卸载干净

---

## 6. Session Transcript 设计

### 6.1 归档命令(手动)

```bash
# 从 Claude Code 本地 transcript 导入(~/.claude/projects/.../*.jsonl)
duoshe session archive --from claude-code [--session <id>]

# 从用户粘贴/导出的对话文件导入
duoshe session archive --file ./chat.md --format markdown

# 手动追加一轮
duoshe session append --role user --content "..."
duoshe session append --role assistant --content "..."
```

### 6.2 幂等去重(硬要求)

**问题:** 用户可能反复对同一对话执行 `archive`,不能产生重复记录。

**方案:**

1. 每个 turn 计算 `contentHash = sha256(role + content + timestamp_minute)`
2. SQLite `turns` 表对 `(session_id, content_hash)` 建唯一索引
3. 写入前查询;命中则跳过并 log "skip duplicate turn"
4. 同 session 反复 archive → 已存在 turn 跳过,新 turn 追加
5. 不同 session 即使内容相同 → 也允许(场景:同一个错误码两次对话都讨论)

### 6.3 transcript.jsonl 格式

每行一个 JSON 事件:

```json
{"type":"user_message","sessionId":"session_20260524_001","turn":1,"contentHash":"sha256:...","content":"...","createdAt":"2026-05-24T10:00:00Z"}
{"type":"assistant_message","sessionId":"session_20260524_001","turn":1,"contentHash":"sha256:...","content":"...","createdAt":"2026-05-24T10:00:12Z"}
{"type":"tool_call","sessionId":"session_20260524_001","turn":2,"tool":"memory.search","input":"Codex 401","outputSummary":"找到 2 条相关","createdAt":"2026-05-24T10:02:00Z"}
```

---

## 7. SQLite Schema

```sql
-- 长期记忆文档(Markdown 文件的索引)
CREATE TABLE documents (
    id          TEXT PRIMARY KEY,
    path        TEXT NOT NULL,
    type        TEXT NOT NULL,  -- project | decision | troubleshooting | module | todo | session_summary
    title       TEXT,
    content     TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE documents_fts USING fts5(
    title, content,
    path UNINDEXED, type UNINDEXED,
    content='documents', content_rowid='rowid'
);

-- Sessions
CREATE TABLE sessions (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL,
    title           TEXT,
    summary         TEXT,
    transcript_path TEXT NOT NULL,
    source          TEXT,  -- claude-code | codex | cursor | manual | file-import
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Turns(对话原文索引,带去重)
CREATE TABLE turns (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(id),
    turn_index    INTEGER NOT NULL,
    role          TEXT NOT NULL,  -- user | assistant | tool
    content       TEXT NOT NULL,
    content_hash  TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    UNIQUE(session_id, content_hash)  -- 去重核心
);

CREATE VIRTUAL TABLE turns_fts USING fts5(
    content,
    role UNINDEXED, session_id UNINDEXED,
    content='turns', content_rowid='rowid'
);

-- Candidates
CREATE TABLE candidates (
    id                  TEXT PRIMARY KEY,
    type                TEXT NOT NULL,  -- decision | troubleshooting | module_boundary | project_fact | user_preference
    title               TEXT NOT NULL,
    content             TEXT NOT NULL,
    target              TEXT NOT NULL,  -- DECISIONS.md | TROUBLESHOOTING.md | ...
    status              TEXT NOT NULL,  -- pending | accepted | rejected | published
    source_session_id   TEXT,
    source_turn_start   INTEGER,
    source_turn_end     INTEGER,
    -- 预留 v0.4 多项目:scope 字段(v0.1 全部填 "project")
    scope               TEXT NOT NULL DEFAULT 'project',
    created_at          TEXT NOT NULL,
    published_at        TEXT
);

CREATE INDEX idx_candidates_status ON candidates(status);
```

**核心原则:**
- `transcript.jsonl` 是 source of truth
- Markdown 文件是 source of truth
- SQLite 是**可重建的索引**(`duoshe reindex` 一键重建)

---

## 8. CLI 命令清单(v0.1)

| 命令 | 作用 |
|---|---|
| `duoshe init` | 初始化 `.duoshe/`,扫描项目,生成草稿 |
| `duoshe rescan` | 重新扫描代码骨架(保留用户确认内容) |
| `duoshe sync` | 同步 CLAUDE.md / AGENTS.md 薄壳块 |
| `duoshe mcp` | 启动 MCP stdio server(Claude Code 通过 `.mcp.json` 调用) |
| `duoshe search <query>` | 搜索长期记忆和对话原文 |
| `duoshe remember <content>` | 快速添加 candidate (pending) |
| `duoshe review` | 列出 pending candidates |
| `duoshe publish <cand_id>` | 发布 candidate 到对应 Markdown |
| `duoshe reject <cand_id>` | 拒绝 candidate |
| `duoshe reindex` | 重建 SQLite FTS5 索引 |
| `duoshe session archive [--from claude-code|--file]` | 归档对话(幂等) |
| `duoshe session show <id>` | 查看 session 原始对话 |
| `duoshe uninstall` | 移除 CLAUDE.md/AGENTS.md 中的 DuoShe 块,不删 `.duoshe/` |

---

## 9. MCP Tools(v0.1 仅 8 个)

stdio 模式,Claude Code 在 `.mcp.json` 配置:

```json
{
  "mcpServers": {
    "duoshe": {
      "command": "npx",
      "args": ["-y", "duoshe", "mcp"]
    }
  }
}
```

| Tool | 用途 |
|---|---|
| `memory.get_project_context` | 任务开始前读取项目上下文(默认返回 PROJECT.md + 最近 3 条 decision + 相关 troubleshooting,maxChars=12000) |
| `memory.search` | 关键词搜索长期记忆 + 对话原文(FTS5) |
| `memory.append_turn` | 追加一轮对话到当前 session(支持 Agent 主动归档) |
| `memory.get_session_transcript` | 获取某 session 原文 |
| `memory.add_observation` | 记录任务中的临时观察(进入 session,不进 candidate) |
| `memory.add_candidate` | 添加候选长期记忆(pending,等用户 review) |
| `memory.list_candidates` | 列出 pending candidates |
| `memory.publish_candidate` | 发布 candidate(通常由用户在 CLI/UI 触发,不建议 Agent 自己发布) |

**安全约束:**
- `memory.publish_candidate` 在 MCP 层默认**禁用**,需要用户在 `config.json` 显式开启 `"allowAgentPublish": true`
- 防止 Agent 自动污染长期记忆

---

## 10. v0.1 开发任务(按优先级排)

### M0:项目骨架(1-2 天)

- [ ] `npm init`,确定 `package.json`(name: `duoshe`,bin: `duoshe`)
- [ ] TypeScript + tsx + vitest + biome 配置
- [ ] commander CLI 框架
- [ ] `duoshe --help` 跑通
- [ ] better-sqlite3 安装与跨平台测试(Windows / macOS / Linux)
- [ ] GitHub Actions:lint + test + build 三件套

**验收:** `npm install -g .` 后能跑 `duoshe --help`。

### M1:Vault + Scanner + init(3-5 天)

- [ ] `duoshe init` 完整流程(§4)
- [ ] 技术栈检测器(支持 5 种:npm / Python / .NET / Go / Rust)
- [ ] 文件树扫描(尊重 .gitignore)
- [ ] git 历史读取(simple-git 或直接调 git CLI)
- [ ] 生成 PROJECT.md / MODULES.md 草稿
- [ ] CLAUDE.md / AGENTS.md 薄壳块管理(§5)
- [ ] `duoshe rescan` / `duoshe sync` / `duoshe uninstall`

**验收:** 拿一个真实开源项目(如 vscode / next.js)跑 `duoshe init`,3 分钟内得到有信息密度的 PROJECT.md。

### M2:Candidate + remember + review + publish(2-3 天)

- [ ] `candidates` 表 + JSONL 持久化
- [ ] `duoshe remember "内容"` → pending
- [ ] `duoshe review` 显示 pending 列表
- [ ] `duoshe publish <id>` 写入目标 Markdown
- [ ] `duoshe reject <id>`
- [ ] 发布后自动更新 documents 表 + FTS5

**验收:** 完整跑通 remember → review → publish 闭环,Markdown 文件正确追加,记录追溯字段。

### M3:SQLite FTS5 搜索(2 天)

- [ ] `documents` / `documents_fts` 表
- [ ] 扫描 `.duoshe/*.md` 入索引
- [ ] 扫描 `.duoshe/SESSIONS/*/summary.md` 入索引
- [ ] `duoshe search <query>` 返回 snippet + 高亮
- [ ] `duoshe reindex` 全量重建

**验收:** 在 100 条决策记录里搜索,关键词返回相关片段,响应 < 200ms。

### M4:Session Transcript 归档(3 天)

- [ ] `sessions` / `turns` 表(带去重唯一索引)
- [ ] `duoshe session archive --from claude-code`:解析 `~/.claude/projects/<encoded-path>/*.jsonl`
- [ ] `duoshe session archive --file --format markdown`:解析常见 chat 导出格式
- [ ] `duoshe session append`:手动追加
- [ ] `duoshe session show <id>`:重建对话视图
- [ ] turns 入 FTS5,search 命令包含 transcript 结果

**验收:** 同一份 Claude Code transcript 归档 3 次,turns 表条数不变;search 能从对话原文里找到关键词。

### M5:MCP Server(3 天)

- [ ] `@modelcontextprotocol/sdk` 集成
- [ ] `duoshe mcp` stdio server
- [ ] 注册 8 个 tools(§9)
- [ ] `.mcp.json` 配置文档
- [ ] 在 Claude Code 中实测每个 tool

**验收:** Claude Code 启动后能看到 8 个 duoshe.* tool;手动触发每个 tool 正常工作。

### M6:Claude Code Hooks 模板(1 天)

- [ ] `duoshe init --with-hooks` 生成 `.claude/settings.json` 模板片段
- [ ] SessionStart hook:`duoshe session archive --from claude-code --latest`
- [ ] Stop hook:同上
- [ ] 文档:复制粘贴到 `~/.claude/settings.json` 即用

**验收:** 配置 hooks 后,Claude Code 一次对话结束自动出现在 `duoshe session show`。

### M7:自己吃狗粮(持续)

- [ ] DuoShe 自己仓库装 DuoShe
- [ ] 至少 5 个 session、5 条 decision、3 条 troubleshooting 入库
- [ ] 复盘体感:第二次问 Claude Code "DuoShe 的 session 去重怎么做的",看它是否能正确引用 `.duoshe/DECISIONS.md`

**验收:** 我(开发者本人)在第二周不需要重新解释项目背景给 Claude Code。

### M8:发布准备(2 天)

- [ ] README.md(中英双语,中文优先)
- [ ] 5 分钟 Quick Start
- [ ] Claude Code 接入文档(`docs/integrations/claude-code.md`)
- [ ] Codex 接入文档
- [ ] 30 秒 demo 视频(脚本 + 录制)
- [ ] MIT License
- [ ] `npm publish`
- [ ] GitHub Topics: `mcp`, `claude-code`, `codex`, `ai-coding`, `memory`

**验收:** 陌生用户 10 分钟内能从 `npx duoshe init` 到 Claude Code 用上 MCP tools。

---

## 11. 风险与对策

| 风险 | 严重度 | 对策 |
|---|---|---|
| Scanner 在大型 monorepo 上卡死 | 高 | 30 秒硬超时;`--quick` 模式跳过 git 历史 |
| better-sqlite3 在 Windows 安装失败 | 高 | 提供 `--use-sqljs` fallback;CI 三平台测试 |
| Claude Code transcript 格式变更 | 中 | adapter 隔离;版本检测;失败时清晰错误信息 |
| Agent 自动 publish 污染长期记忆 | 高 | MCP 层默认禁用 publish;需要 config 显式开启 |
| 用户期待"自动越用越聪明",失望 | 高 | README 第一句话就说"半自动 + 用户确认",反过来作为卖点 |
| 中国开发者不信任独立开发者工具 | 中 | 英文 README + 海外社区先发声;不藏代码;不做付费版 |
| `.duoshe/SESSIONS/` 体积膨胀 | 中 | 默认 .gitignore;归档时按 session 分目录;v0.2 加压缩 |
| 隐私(transcript 里有 API key) | 高 | 归档前扫描常见密钥模式(OPENAI_API_KEY 等),发现就停止并警告;文档说明 |

---

## 12. 验收硬指标(v0.1 发布门槛)

发布前必须全部通过:

1. [ ] `npx duoshe init` 在 5 大类项目(Node/Python/.NET/Go/Rust)各跑通一次,3 分钟内产出 PROJECT.md
2. [ ] 同一份 Claude Code transcript 反复归档 3 次,turns 表无重复
3. [ ] Claude Code 中 8 个 MCP tool 全部可调用
4. [ ] CLAUDE.md 已存在的情况下,`duoshe init` 不覆盖原内容
5. [ ] `duoshe uninstall` 后,CLAUDE.md 块外内容 100% 保留,`.duoshe/` 保留
6. [ ] 在 100 条 decision 的项目中,`duoshe search` 响应 < 200ms
7. [ ] DuoShe 自己仓库已积累 5+ session、5+ decision
8. [ ] README 双语;30 秒 demo 视频就绪
9. [ ] Windows / macOS / Linux 三平台 CI 全绿

---

## 13. 后续版本路线(参考,不承诺)

| 版本 | 重点 |
|---|---|
| v0.2 | 自动 candidate 提取(可选 LLM)、REST API、session summary |
| v0.3 | Skills 实现(SKILL.md)、重复踩坑提示 |
| v0.4 | 多项目 / 全局记忆(`~/.duoshe/global/`) |
| v0.5 | 可选向量搜索(LanceDB) |
| v0.6 | 轻量关系图(SQLite 表表达 module ↔ decision ↔ bug) |
| v1.0 | Dashboard、安装包、配置向导、团队版预留 |

---

## 14. 项目命名与分发

- **包名:** `duoshe`(npm + GitHub)
- **CLI:** `duoshe`
- **MCP server name:** `duoshe`
- **License:** MIT
- **仓库:** `github.com/guangdino/nano-duoshe`
- **文档站:** v0.1 暂不做,README 顶住;v0.2 用 VitePress

---

> 本方案文档是 DuoShe v0.1 的工程契约。修改任何决策前,先在本文档登记原因和影响。
