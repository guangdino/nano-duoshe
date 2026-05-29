import type { Command } from "commander";
import kleur from "kleur";
import {
  disableSkill,
  enableSkill,
  listAvailableSkills,
} from "../../core/skills/manager.js";
import { vaultExists } from "../../core/vault/index.js";
import { log } from "../log.js";

function requireVault(root: string): void {
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }
}

function runList(root: string): void {
  requireVault(root);
  const skills = listAvailableSkills(root);
  if (skills.length === 0) {
    log.info("还没有安装任何技能。重新运行 `duoshe init` 会安装内置技能。");
    return;
  }
  log.raw(kleur.bold("可用技能："));
  log.blank();
  for (const s of skills) {
    const badge = s.enabled
      ? kleur.green("已启用")
      : kleur.gray("未启用");
    log.raw(`  ${badge}  ${kleur.bold(s.name)}`);
    if (s.description) log.raw(`           ${kleur.gray(s.description)}`);
  }
  log.blank();
  log.raw(`启用：${kleur.cyan("duoshe skill enable <名字>")}`);
  log.raw(`禁用：${kleur.cyan("duoshe skill disable <名字>")}`);
}

function runEnable(root: string, skillName: string): void {
  requireVault(root);
  try {
    const hint = enableSkill(root, skillName);
    log.ok(`已启用技能 "${skillName}"`);
    if (hint) log.info(hint);
  } catch (err) {
    log.err(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function runDisable(root: string, skillName: string): void {
  requireVault(root);
  disableSkill(root, skillName);
  log.ok(`已禁用技能 "${skillName}"`);
}

export function registerSkillCommand(program: Command): void {
  const cmd = program
    .command("skill")
    .description("管理可选技能 —— skill 是可选的扩展能力，比如分析代码依赖图（list / enable / disable）");

  cmd
    .command("list")
    .description("列出所有可用和已启用的技能")
    .action(() => {
      runList(process.cwd());
    });

  cmd
    .command("enable <name>")
    .description("启用一个技能（从 available 里复制到 enabled）")
    .action((name: string) => {
      runEnable(process.cwd(), name);
    });

  cmd
    .command("disable <name>")
    .description("禁用一个技能（available 里仍保留）")
    .action((name: string) => {
      runDisable(process.cwd(), name);
    });
}
