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
    log.err("No .duoshe/ found. Run `duoshe init` first.");
    process.exit(1);
  }
}

function runList(root: string): void {
  requireVault(root);
  const skills = listAvailableSkills(root);
  if (skills.length === 0) {
    log.info("No skills installed. Re-run `duoshe init` to install bundled skills.");
    return;
  }
  log.raw(kleur.bold("Available skills:"));
  log.blank();
  for (const s of skills) {
    const badge = s.enabled
      ? kleur.green("enabled ")
      : kleur.gray("disabled");
    log.raw(`  ${badge}  ${kleur.bold(s.name)}`);
    if (s.description) log.raw(`           ${kleur.gray(s.description)}`);
  }
  log.blank();
  log.raw(`Enable:  ${kleur.cyan("duoshe skill enable <name>")}`);
  log.raw(`Disable: ${kleur.cyan("duoshe skill disable <name>")}`);
}

function runEnable(root: string, skillName: string): void {
  requireVault(root);
  try {
    const hint = enableSkill(root, skillName);
    log.ok(`skill "${skillName}" enabled`);
    if (hint) log.info(hint);
  } catch (err) {
    log.err(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function runDisable(root: string, skillName: string): void {
  requireVault(root);
  disableSkill(root, skillName);
  log.ok(`skill "${skillName}" disabled`);
}

export function registerSkillCommand(program: Command): void {
  const cmd = program
    .command("skill")
    .description("manage optional skills (list / enable / disable)");

  cmd
    .command("list")
    .description("list all available and enabled skills")
    .action(() => {
      runList(process.cwd());
    });

  cmd
    .command("enable <name>")
    .description("enable a skill from the available pool")
    .action((name: string) => {
      runEnable(process.cwd(), name);
    });

  cmd
    .command("disable <name>")
    .description("disable an enabled skill (still kept in available/)")
    .action((name: string) => {
      runDisable(process.cwd(), name);
    });
}
