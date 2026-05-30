import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import kleur from "kleur";
import {
  detectExistingShells,
  syncShells,
  uninstallShells,
} from "../../adapters/claude-md.js";
import { syncGitignore } from "../../adapters/gitignore.js";
import { detectProfile, profileLabel } from "../../core/profile/detect.js";
import { fullScan } from "../../core/scanner/index.js";
import { installBundledSkills } from "../../core/skills/manager.js";
import { initVault, vaultExists } from "../../core/vault/index.js";
import { readConfig, writeConfig } from "../../core/vault/config.js";
import { vaultPathsFor } from "../../core/vault/paths.js";
import { runGuide } from "./guide.js";
import { log } from "../log.js";

type InitOptions = {
  force?: boolean;
  quick?: boolean;
  withHooks?: boolean;
  guided?: boolean;
  shells?: "auto" | "always" | "never";
  yes?: boolean;
};

function shouldCreateShells(shells: InitOptions["shells"], anyExists: boolean): boolean {
  if (shells === "always") return true;
  if (shells === "never") return false;
  return !anyExists;
}

async function confirmInteractive(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`  ${question} ${kleur.gray("(y/N) ")}`)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

async function runInit(opts: InitOptions): Promise<void> {
  const root = process.cwd();
  const start = Date.now();

  log.step(`在 ${kleur.bold(root)} 初始化 DuoShe`);

  if (vaultExists(root) && !opts.force) {
    log.warn("这个目录已经初始化过了。");
    log.raw(`    要重置，加 ${kleur.cyan("--force")}（会保留你手动确认过的内容）`);
    log.raw(`    只想刷新扫描，运行 ${kleur.cyan("duoshe rescan")}（不会覆盖任何内容）`);
    process.exit(1);
  }

  // Confirm destructive --force when in TTY (unless --yes was passed).
  if (opts.force && vaultExists(root) && !opts.yes && process.stdin.isTTY && process.stdout.isTTY) {
    const ok = await confirmInteractive("会重写 .duoshe/ 里的草稿文件（带 <!-- USER-CONFIRMED --> 的内容会保留）。继续？");
    if (!ok) {
      log.info("已取消。");
      return;
    }
  }

  log.step("扫描项目");
  const { scan, git } = fullScan(root, opts.quick === true ? { quick: true } : {});
  if (scan.stacks.length > 0) {
    log.ok(`检测到 ${scan.stacks.length} 种技术栈：${scan.stacks.map((s) => s.language + (s.framework ? `/${s.framework}` : "")).join("、")}`);
  } else {
    log.info("没识别出常见技术栈（不影响使用，duoshe 仍能记录决策和踩坑）");
  }
  if (scan.topDirs.length === 0) {
    log.ok(`遍历了 ${scan.totalFiles} 个文件（${scan.totalSourceFiles} 个源码文件），文件都在根目录`);
  } else {
    log.ok(`遍历了 ${scan.totalFiles} 个文件（${scan.totalSourceFiles} 个源码文件），跨 ${scan.topDirs.length} 个顶层目录`);
  }
  if (git.isGitRepo) {
    log.ok(`git 仓库：${git.hotFiles?.length ?? 0} 个热点文件，${git.contributorCount ?? "?"} 位贡献者`);
  } else {
    log.info("不是 git 仓库 — 跳过 git 历史分析");
  }

  const guess = detectProfile(scan, root);
  log.step("识别项目类型");
  log.ok(`猜测：${kleur.bold(profileLabel(guess.profile))}（${guess.reason}）`);
  log.raw(kleur.gray(`    如果不对，用 ${kleur.cyan("duoshe profile set <类型>")} 改；查看类型：${kleur.cyan("duoshe profile list")}`));

  log.step("写入记忆库文件");
  const init = initVault({ projectRoot: root, scan, git, force: opts.force === true, profile: guess.profile });
  for (const [name, action] of Object.entries(init.fileActions)) {
    if (action === "wrote") log.ok(`写入 .duoshe/${name}`);
    else if (action === "skipped-existing") log.info(`保留现有的 .duoshe/${name}`);
    else if (action === "skipped-confirmed") log.info(`保留你确认过的 .duoshe/${name}`);
  }

  log.step("安装内置技能（skills）");
  const installedSkills = installBundledSkills(root);
  if (installedSkills.length > 0) {
    log.ok(`已安装 ${installedSkills.length} 个技能到 .duoshe/SKILLS/available/：${installedSkills.join("、")}`);
    log.info(`技能默认不启用 — 用 ${kleur.cyan("duoshe skill enable <名字>")} 来启用`);
  } else {
    log.info("技能已经装过了，跳过");
  }

  log.step("同步 CLAUDE.md / AGENTS.md");
  const existing = detectExistingShells(root);
  const anyExists = existing.some((e) => e.exists);
  const createIfMissing = shouldCreateShells(opts.shells, anyExists);
  if (opts.shells === undefined && anyExists) {
    log.info("发现已有 CLAUDE.md / AGENTS.md — 只追加 DuoShe 块（不会创建另一个）");
  } else if (createIfMissing) {
    log.info("创建新的 CLAUDE.md 和 AGENTS.md（都是指向 .duoshe/ 的简短指引）");
  }
  const shellResults = syncShells(root, { createIfMissing });
  for (const r of shellResults) {
    if (r.status === "created") log.ok(`创建 ${r.file}（指向 .duoshe/ 的简短指引）`);
    else if (r.status === "appended") log.ok(`已在 ${r.file} 末尾追加 DuoShe 块（你原有的内容不动）`);
    else if (r.status === "updated") log.ok(`更新了 ${r.file} 里的 DuoShe 块`);
    else if (r.status === "unchanged") log.info(`${r.file} 的 DuoShe 块已经是最新`);
    else if (r.status === "skipped-no-existing") log.info(`${r.file} 不存在，跳过`);
  }

  // Persist the auto-detected profile UNLESS the user has already set one
  // manually. Manual setting always wins — we don't second-guess the user.
  const cfgPath = vaultPathsFor(root).config;
  const cfg = readConfig(cfgPath);
  if (cfg && cfg.profileSetBy !== "user") {
    cfg.profile = guess.profile;
    cfg.profileSetBy = "auto";
    writeConfig(cfgPath, cfg);
  }

  const giAction = syncGitignore(root);
  if (giAction.status !== "skipped-no-repo") {
    log.step("更新 .gitignore（让团队记忆能 commit，私人状态保持本地）");
    if (giAction.status === "created") log.ok("创建了 .gitignore（DuoShe 块）");
    else if (giAction.status === "appended") log.ok("在 .gitignore 末尾追加了 DuoShe 块");
    else if (giAction.status === "updated") log.ok("更新了 .gitignore 里的 DuoShe 块");
    else log.info(".gitignore 已经是最新");
  }

  if (opts.withHooks) {
    log.step("生成 Claude Code hooks 模板");
    log.warn("hooks 模板还没做完（计划于 M6 上线），先跳过");
  }

  if (opts.guided) {
    log.blank();
    await runGuide(root);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log.blank();
  log.raw(kleur.green().bold("  准备好了。"));
  log.raw(kleur.gray(`  用时 ${elapsed}s`));
  log.blank();
  printFirstStepForProfile(guess.profile);
  log.raw(kleur.gray("  连接到 AI 工具的方法见 .duoshe/SETUP.md（已经为你生成好了）。"));
  log.blank();
}

// First-run hint tailored to the detected profile. The shape is always the
// same — one bold "do this first" line + one example `duoshe remember` call —
// so the user gets a concrete next action that fits their actual project.
function printFirstStepForProfile(profile: import("../../core/types.js").ProjectProfile): void {
  switch (profile) {
    case "kid":
      log.raw(kleur.bold("  现在试试："));
      log.raw(`    ${kleur.cyan('duoshe remember "我想做一个 ___ 游戏"')}`);
      log.raw(kleur.gray(`    （想到什么都可以记下来，没有标准答案）`));
      break;
    case "non_dev_site":
      log.raw(kleur.bold("  现在做这件事最重要："));
      log.raw(`    把域名 / SSL / 服务器 / 后台账号信息记下来：`);
      log.raw(`    ${kleur.cyan('duoshe remember "域名 example.com 到期日 2026-08-12，在阿里云续费"')}`);
      log.raw(kleur.gray(`    然后看一眼 ${kleur.cyan("duoshe profile show")} 了解你能记些什么。`));
      break;
    case "algo":
      log.raw(kleur.bold("  现在做这件事："));
      log.raw(`    把当前实验的基准记下来，方便以后对比：`);
      log.raw(`    ${kleur.cyan('duoshe remember "v1 基线 settling time 35ms @ 1Nm step"')}`);
      break;
    case "embedded":
      log.raw(kleur.bold("  现在做这件事："));
      log.raw(`    把硬件约束或 ISR 边界先记一条：`);
      log.raw(`    ${kleur.cyan('duoshe remember "X 函数运行在中断上下文，不能调阻塞 API"')}`);
      break;
    case "ai_app":
      log.raw(kleur.bold("  现在做这件事："));
      log.raw(`    记下当前模型 + system prompt 版本，方便以后对比效果：`);
      log.raw(`    ${kleur.cyan('duoshe remember "当前用 claude-sonnet-4，system prompt v3，平均延迟 600ms"')}`);
      break;
    case "general":
      log.raw(kleur.bold("  现在做一件事就够了："));
      log.raw(`    运行 ${kleur.cyan("duoshe guide")}，回答 7 个小问题，让 AI 真正认识这个项目。`);
      log.raw(kleur.gray("  之后想到什么，随时用 `duoshe remember \"...\"` 记下来。"));
      break;
  }
  log.blank();
}

async function runRescan(): Promise<void> {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }
  log.step("重新扫描项目");
  const { scan, git } = fullScan(root);
  log.ok(`检测到 ${scan.totalFiles} 个文件，${scan.stacks.length} 种技术栈`);

  log.step("刷新记忆库文件（你确认过的部分会保留）");
  const init = initVault({ projectRoot: root, scan, git, force: false });
  for (const [name, action] of Object.entries(init.fileActions)) {
    if (action === "wrote") log.ok(`写入 .duoshe/${name}`);
    else if (action === "skipped-existing") log.info(`保留现有的 .duoshe/${name}（没加 --force）`);
    else if (action === "skipped-confirmed") log.info(`保留你确认过的 .duoshe/${name}`);
  }
  log.blank();
  log.raw(kleur.green("刷新完成。"));
}

async function runUninstall(): Promise<void> {
  const root = process.cwd();
  log.step("从 CLAUDE.md / AGENTS.md 移除 DuoShe 块");
  const results = uninstallShells(root);
  for (const r of results) {
    if (r.status === "removed") log.ok(`已从 ${r.file} 移除 DuoShe 块`);
    else if (r.status === "skipped-no-existing") log.info(`${r.file} 不存在`);
    else if (r.status === "unchanged") log.info(`${r.file} 里没有 DuoShe 块`);
  }
  if (existsSync(resolve(root, ".duoshe"))) {
    log.blank();
    log.raw(kleur.yellow("注意：.duoshe/ 没有被删除（里面是你的记忆）。"));
    log.raw("  要彻底清除，请手动删除整个目录：");
    log.raw(`    ${kleur.gray("rm -rf .duoshe/    （Windows 上：rmdir /s /q .duoshe）")}`);
  }
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("在当前目录初始化记忆库（扫描项目结构，生成 PROJECT.md / CODEMAP.md / MODULES.md 等草稿）")
    .option("--force", "强制重写 .duoshe/ 下的草稿（带 <!-- USER-CONFIRMED --> 的内容会保留）")
    .option("--quick", "跳过 git 历史扫描（大仓库可以更快）")
    .option("--guided", "init 之后直接进入问答模式，写一段引导性的项目说明")
    .option("--with-hooks", "顺便生成 Claude Code hooks 模板（M6 才会做）")
    .option("--yes", "跳过 --force 的交互确认")
    .option(
      "--shells <模式>",
      "CLAUDE.md / AGENTS.md 的处理模式：auto（自动）| always（总是创建）| never（不创建）",
      "auto",
    )
    .action(async (opts: InitOptions) => {
      try {
        await runInit(opts);
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("rescan")
    .description("重新扫描项目，刷新代码骨架（你确认过的部分保留）")
    .action(async () => {
      try {
        await runRescan();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });

  program
    .command("uninstall")
    .description("从 CLAUDE.md / AGENTS.md 移除 DuoShe 块（不会删除 .duoshe/）")
    .action(async () => {
      try {
        await runUninstall();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
