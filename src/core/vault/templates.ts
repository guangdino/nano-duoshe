import type { GitInsights, ProjectScan } from "../types.js";

const DRAFT_BANNER = `<!-- DUOSHE-DRAFT: 这段是 \`duoshe init\` 自动生成的草稿。
     可以随意修改。想让 \`duoshe rescan\` 保留你的修改，
     在那段内容上方加一行 <!-- USER-CONFIRMED --> 即可。 -->`;

// Dir hints from the scanner are already in Chinese (set in filetree.ts and
// skill dirHints). Fall back to "用途待补充" for unknown directories.
function dirRole(role: string | undefined): string {
  return role ?? "用途待补充";
}

function fileCountZh(n: number): string {
  return `${n} 个文件`;
}

function bullets(lines: string[]): string {
  if (lines.length === 0) return "_(未识别)_";
  return lines.map((l) => `- ${l}`).join("\n");
}

function mermaidId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^(\d)/, "_$1");
  return cleaned.length === 0 ? "node" : cleaned;
}

function mermaidLabel(raw: string): string {
  return raw.replaceAll('"', '\\"');
}

function relTime(days: number): string {
  if (days < 1) return "today";
  if (days < 30) return `${Math.round(days)} day(s) ago`;
  if (days < 365) return `${Math.round(days / 30)} month(s) ago`;
  return `${(days / 365).toFixed(1)} year(s) ago`;
}

// Minimal projects (no nested dirs, ≤ 8 files, no real framework) get a
// simpler template — git stats and lint-rule sections are not useful for
// tutorial or beginner projects with no history.
function isMinimalProject(scan: ProjectScan): boolean {
  if (scan.topDirs.length > 0) return false;
  if (scan.totalFiles > 8) return false;
  const realFramework = scan.stacks.some((s) => s.framework && s.framework !== "scripts");
  return !realFramework;
}

export function renderProjectMd(opts: {
  projectName: string;
  scan: ProjectScan;
  git: GitInsights;
}): string {
  const { projectName, scan, git } = opts;

  if (isMinimalProject(scan)) {
    return `# ${projectName}

${DRAFT_BANNER}

## 这个项目是关于什么的？

_用一两句话说说你在做什么。_

## 文件

- 共 ${scan.totalFiles} 个文件${scan.topDirs.length === 0 ? "，都在根目录" : ""}

## 重要的事

_想到什么重要的、容易忘的事，记在这里。或者用 \`duoshe remember "..."\`_

---

_由 DuoShe 于 ${scan.scannedAt} 生成。_
`;
  }

  const stacks = scan.stacks.map(
    (s) =>
      `**${s.language}**${s.framework ? `（${s.framework}）` : ""}` +
      `${s.packageManager ? ` — 包管理器：\`${s.packageManager}\`` : ""}` +
      ` — 配置文件：\`${s.manifestFile}\``,
  );
  const dirs = scan.topDirs.map(
    (d) => `\`${d.name}/\` — ${dirRole(d.guessedRole)}（${fileCountZh(d.fileCount)}）`,
  );
  const entryKindZh: Record<string, string> = {
    main: "主入口",
    test: "测试",
    config: "配置",
    docs: "文档",
  };
  const entries = scan.entryPoints.map((e) => `\`${e.path}\`（${entryKindZh[e.kind] ?? e.kind}）`);
  const hot = git.hotFiles?.map((f) => `\`${f.path}\` — 最近 30 天有 ${f.commits} 次提交`) ?? [];

  return `# ${projectName}

${DRAFT_BANNER}

## 项目简介

_一两句话：这个项目是做什么的？谁在用？_

## 技术栈

${stacks.length === 0 ? "_未识别出常见技术栈。这不影响使用 —— DuoShe 仍然可以帮你记录决策、踩坑、模块规则。_" : bullets(stacks)}

## 项目规模

- 总文件数：${scan.totalFiles}
- 源代码文件：${scan.totalSourceFiles}
- 顶层目录：

${bullets(dirs)}

## 入口文件

${bullets(entries)}

## 仓库信息

${
  git.isGitRepo
    ? [
        git.remoteUrl ? `- 远端：${git.remoteUrl}` : "- 远端：_(仅本地)_",
        git.defaultBranch ? `- 默认分支：\`${git.defaultBranch}\`` : "",
        git.ageDays != null ? `- 首次提交：${relTime(git.ageDays)}` : "",
        git.contributorCount != null ? `- 贡献者数：${git.contributorCount}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "_不是 git 仓库。_"
}

## 最近 30 天的热点文件

${bullets(hot)}

## AI 必须记住的约定

_团队或项目的约定：命名风格、lint 规则、禁用的 API、分支模型、任何怪异的地方。_

- ...

## 限制和坑

_AI 绝对不能做的事。兼容性要求。性能预算。_

- ...

---

_由 DuoShe 于 ${scan.scannedAt} 生成。搜索记忆：\`duoshe search "<关键词>"\`_
`;
}

export function renderCodeMapMd(opts: {
  projectName: string;
  scan: ProjectScan;
  git: GitInsights;
}): string {
  const { projectName, scan, git } = opts;
  const stackLines = scan.stacks.map(
    (s) =>
      `\`${s.manifestFile}\` → ${s.language}${s.framework ? ` / ${s.framework}` : ""}${
        s.packageManager ? `（${s.packageManager}）` : ""
      }`,
  );
  const codeEntryKindZh: Record<string, string> = {
    main: "主入口",
    test: "测试",
    config: "配置",
    docs: "文档",
  };
  const entryLines = scan.entryPoints.map(
    (e) => `\`${e.path}\`（${codeEntryKindZh[e.kind] ?? e.kind}）`,
  );
  const dirLines = scan.topDirs.map(
    (d) => `| \`${d.name}/\` | ${dirRole(d.guessedRole)} | ${d.fileCount} |`,
  );
  const hotLines =
    git.hotFiles?.map((f) => `\`${f.path}\` — 最近 30 天有 ${f.commits} 次提交`) ?? [];
  const graphDirs = scan.topDirs.slice(0, 10);
  const graphEntries = scan.entryPoints.slice(0, 8);
  const graphLines = [
    `  root["${mermaidLabel(projectName)}"]`,
    ...graphDirs.map((d) => `  root --> ${mermaidId(d.name)}["${mermaidLabel(`${d.name}/`)}"]`),
    ...graphEntries.map((e, i) => {
      const first = e.path.split("/")[0] ?? "root";
      const parent = scan.topDirs.some((d) => d.name === first) ? mermaidId(first) : "root";
      return `  ${parent} --> entry${i}["${mermaidLabel(e.path)}"]`;
    }),
  ];

  return `# 代码地图

${DRAFT_BANNER}

> 给 AI 看的精简版项目地图。重点放在：入口、归属边界、特别需要小心的文件。

## 系统结构图

\`\`\`mermaid
flowchart TD
${graphLines.join("\n")}
\`\`\`

## 运行时和技术栈信号

${bullets(stackLines)}

## 入口文件

${bullets(entryLines)}

## 目录地图

| 路径 | 大致作用 | 文件数 |
| --- | --- | ---: |
${dirLines.length === 0 ? "| _(无)_ | _(未识别)_ | 0 |" : dirLines.join("\n")}

${
  scan.workspaces && scan.workspaces.length > 0
    ? `## monorepo 子包（来自 package.json workspaces）\n\n| 名字 | 路径 | 语言 |\n| --- | --- | --- |\n${scan.workspaces
        .map((w) => `| \`${w.name}\` | \`${w.path}/\` | ${w.language ?? "JavaScript"} |`)
        .join("\n")}\n`
    : ""
}

## 热点文件

${bullets(hotLines)}

## 人工标注

_运行 \`duoshe guide\` 来添加项目特有的路由说明、归属规则、AI 应该优先看的地方。_

---

_由 DuoShe 于 ${scan.scannedAt} 生成。运行 \`duoshe rescan\` 刷新。_
`;
}

export function renderDecisionsMd(): string {
  return `# 决策记录

${DRAFT_BANNER}

> 跨 AI 会话都要记得的架构和设计决策。
> 用 \`duoshe remember "..."\` 加一条待确认记录，
> 然后 \`duoshe review\` 看，\`duoshe save <id>\` 保存到这里。

每条记录尽量回答：**做了什么决定**、**为什么**、**考虑过哪些备选**、**当前状态**。

---

_(暂无决策记录)_
`;
}

export function renderTroubleshootingMd(): string {
  return `# 踩坑记录

${DRAFT_BANNER}

> 遇到过的 bug、坑、修法 —— 这样下次 AI（或你自己）不用再调一遍。
> 用 \`duoshe remember "..."\` 然后在 review 时选 "踩坑" 类型。

每条记录尽量回答：**症状**、**根因**、**修法**、**怎么验证**、**相关文件**。

---

_(暂无踩坑记录)_
`;
}

export function renderModulesMd(opts: { scan: ProjectScan }): string {
  const dirs = opts.scan.topDirs.map(
    (d) =>
      `### \`${d.name}/\`\n\n**作用：** ${d.guessedRole ?? "_暂不明确，请补充_"}\n\n**负责：** _(这个模块负责什么？)_\n\n**不负责：** _(什么绝对不该放在这里？)_\n\n**依赖：** _(内部 / 外部依赖)_\n`,
  );

  return `# 模块边界

${DRAFT_BANNER}

> 各模块的边界 —— 每个部分负责什么、（更重要的）**不**负责什么。
> 「不负责」那一行对 AI 来说价值最高。

${dirs.length === 0 ? "_未识别出顶层目录。_" : dirs.join("\n---\n\n")}
`;
}

export function renderSetupMd(opts: { projectName: string }): string {
  return `# ${opts.projectName} — 怎么把这个项目接到 AI 工具

这个文件是给你看的。说明怎么让 Claude Code / Codex / Cursor 用上 \`.duoshe/\` 里的项目记忆。

---

## 🤖 Claude Code（claude.ai/code）

\`duoshe init\` 已经在项目根目录创建（或追加）了 \`CLAUDE.md\`。
**Claude Code 启动时会自动读它**，里面有指向 \`.duoshe/\` 的指引。**不用做任何事**。

想确认：打开 \`CLAUDE.md\`，看到 \`<!-- BEGIN DUOSHE -->\` 那一段就对了。

## 🤖 Codex / OpenAI Agents

\`duoshe init\` 同时创建了 \`AGENTS.md\`，作用一样。Codex 会读它。**不用做任何事**。

## 🤖 Cursor

Cursor 不会自动读 \`CLAUDE.md\` 或 \`AGENTS.md\`。两种办法：

1. **最简单**：在跟 Cursor 对话时，告诉它 "请先看 .duoshe/PROJECT.md 和 .duoshe/DECISIONS.md"。
2. **永久生效**：在项目根目录创建 \`.cursorrules\` 文件，里面写：

   \`\`\`
   This project uses DuoShe for structured memory.
   Before answering, check .duoshe/PROJECT.md, .duoshe/DECISIONS.md,
   and .duoshe/MODULES.md for relevant context.
   \`\`\`

## 🤖 别的 AI 工具

任何能读项目文件的 AI 工具，都可以让它读 \`.duoshe/\` 下面的几个 Markdown 文件。
核心是 \`PROJECT.md\`（项目总览）和 \`DECISIONS.md\`（已经拍板的决定）。

---

## 📝 日常用法（3 个命令就够）

\`\`\`bash
duoshe remember "..."   # 想到什么重要的事，先记下来（暂存为待确认）
duoshe review           # 看看待确认的记录，决定保存或丢弃
duoshe search "..."     # 在项目记忆里搜索（找过去做过的决定、踩过的坑）
\`\`\`

还有几个偶尔会用的：

\`\`\`bash
duoshe guide            # 回答 3 个核心问题，帮 AI 认识这个项目
duoshe rescan           # 项目结构变化大了，刷新一下扫描（保留你的修改）
duoshe upgrade          # 检查 duoshe 自己有没有新版本
\`\`\`

## 🗂 \`.duoshe/\` 里都有什么

| 文件 | 装什么 | 该 commit 吗？ |
|---|---|---|
| \`PROJECT.md\` | 项目总览、技术栈、约定、特殊规则 | ✅ 应该 |
| \`CODEMAP.md\` | 代码地图、入口、模块依赖图 | ✅ 应该 |
| \`DECISIONS.md\` | 已经拍板的架构 / 选型决定（带原因） | ✅ 应该 |
| \`TROUBLESHOOTING.md\` | 踩过的坑和修法 | ✅ 应该 |
| \`MODULES.md\` | 各模块的边界（特别是「不该做什么」） | ✅ 应该 |
| \`TODO.md\` | 当前在做、接下来要做的事 | ✅ 应该 |
| \`SETUP.md\` | 这份说明，给新加入的人看 | ✅ 应该 |
| \`SKILLS/\` | 已启用的技能 | ✅ 应该 |
| \`config.json\` | 本地配置（已启用的 skill 等） | ❌ 个人偏好，不要 |
| \`CANDIDATES/\` | 还没确认的临时记录 | ❌ 个人草稿，不要 |
| \`SESSIONS/\` | 私人会话归档 | ❌ 私密，不要 |
| \`index.db\` | 本地搜索索引（可重建） | ❌ 缓存，不要 |

\`duoshe init\` 在 git 仓库里跑时会**自动维护 \`.gitignore\`**，把上面"不要"的那些加进去。
你只需要正常 \`git add\` / \`git commit\` 想分享的文件就行了。

## 👥 团队协作

- 你 \`git push\` 之后，**其他人 pull 下来不用再跑 \`duoshe init\`** —— 仓库里已经有 \`.duoshe/\` 的公共记忆了。
- 如果他们想用 \`duoshe\` 命令搜索 / 记录，让他们 \`npm i -g nano-duoshe\`，然后在项目目录跑 \`duoshe search "..."\` 就行。
- 第一次跑命令时 duoshe 会自动重建本地搜索索引（不影响别人）。
- 想让别的 AI 工具（比如 Cursor）也用上记忆，看上面的「Cursor」一节。

---

_想完全卸载？运行 \`duoshe uninstall\` 移除 CLAUDE.md / AGENTS.md 里的 DuoShe 块。_
_\`.duoshe/\` 目录不会被自动删除（里面是你的记忆），需要手动删。_
`;
}

export function renderTodoMd(): string {
  return `# TODO

${DRAFT_BANNER}

> 当前在做的、接下来要做的事。轻量的日常工作记忆。

## 正在做

- _(暂无)_

## 接下来

- _(暂无)_

## 待办

- _(暂无)_
`;
}
