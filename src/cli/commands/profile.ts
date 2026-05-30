import type { Command } from "commander";
import kleur from "kleur";
import { detectProfile, profileDescription, profileLabel } from "../../core/profile/detect.js";
import { fullScan } from "../../core/scanner/index.js";
import { PROJECT_PROFILES, type ProjectProfile } from "../../core/types.js";
import { readConfig, writeConfig } from "../../core/vault/config.js";
import { vaultExists, vaultPathsFor } from "../../core/vault/index.js";
import { log } from "../log.js";

function isValidProfile(s: string): s is ProjectProfile {
  return (PROJECT_PROFILES as readonly string[]).includes(s);
}

function ensureVault(): string {
  const root = process.cwd();
  if (!vaultExists(root)) {
    log.err("这个目录还没有初始化。请先运行 `duoshe init`。");
    process.exit(1);
  }
  return root;
}

function runShow(): void {
  const root = ensureVault();
  const cfg = readConfig(vaultPathsFor(root).config);
  const current = cfg?.profile;
  const setBy = cfg?.profileSetBy ?? "auto";

  log.blank();
  if (current) {
    log.raw(`  当前类型：${kleur.bold(profileLabel(current))} ${kleur.gray(`(${current})`)}`);
    log.raw(kleur.gray(`  ${profileDescription(current)}`));
    log.raw(kleur.gray(`  来源：${setBy === "user" ? "你手动设置的" : "init 时自动识别的"}`));
  } else {
    log.raw(`  ${kleur.gray("当前没有设置项目类型。运行 `duoshe profile list` 看可选。")}`);
  }
  log.blank();

  // Always also show what the detector would guess RIGHT NOW given the current
  // filesystem — this is useful when files have changed since init.
  log.raw(kleur.gray("  现在重新扫描会猜什么类型："));
  const { scan } = fullScan(root, { quick: true });
  const guess = detectProfile(scan, root);
  log.raw(`    ${kleur.bold(profileLabel(guess.profile))} ${kleur.gray(`— ${guess.reason}`)}`);
  log.blank();
  log.raw(kleur.gray(`  想改：${kleur.cyan("duoshe profile set <类型>")}`));
}

function runList(): void {
  log.blank();
  log.raw(kleur.bold("  可选的项目类型："));
  log.blank();
  for (const p of PROJECT_PROFILES) {
    log.raw(`  ${kleur.cyan(p.padEnd(14))} ${kleur.bold(profileLabel(p))}`);
    log.raw(kleur.gray(`                ${profileDescription(p)}`));
    log.blank();
  }
  log.raw(kleur.gray(`  设置：${kleur.cyan("duoshe profile set <类型>")}`));
}

function runSet(profile: string): void {
  const root = ensureVault();
  if (!isValidProfile(profile)) {
    log.err(`类型 "${profile}" 无效。可选：${PROJECT_PROFILES.join(", ")}`);
    log.info("运行 `duoshe profile list` 看完整说明。");
    process.exit(1);
  }
  const cfgPath = vaultPathsFor(root).config;
  const cfg = readConfig(cfgPath);
  if (!cfg) {
    log.err("找不到配置文件，请先运行 `duoshe init`。");
    process.exit(1);
  }
  cfg.profile = profile;
  cfg.profileSetBy = "user";
  writeConfig(cfgPath, cfg);
  log.ok(`已设置为 ${kleur.bold(profileLabel(profile))}`);
  log.raw(kleur.gray(`  ${profileDescription(profile)}`));
  log.info("下次运行 `duoshe rescan --force` 会用这个类型重新生成 PROJECT.md。");
}

export function registerProfileCommand(program: Command): void {
  const cmd = program
    .command("profile")
    .description("查看或修改项目类型（决定 PROJECT.md 模板和初始引导）");

  cmd
    .command("show", { isDefault: true })
    .description("显示当前项目类型，以及现在扫描会猜什么")
    .action(() => runShow());

  cmd
    .command("list")
    .description("列出所有可选的项目类型")
    .action(() => runList());

  cmd
    .command("set <profile>")
    .description("手动设置项目类型（kid | non_dev_site | algo | embedded | ai_app | general）")
    .action((p: string) => runSet(p));
}
