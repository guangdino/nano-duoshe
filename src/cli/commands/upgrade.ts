import { existsSync } from "node:fs";
import { delimiter, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";
import kleur from "kleur";
import { checkForUpdateNow } from "../../core/update/check.js";
import { log } from "../log.js";

// Tries to detect how the user installed duoshe so we can recommend the right command.
// Returns a label like "npm global", "npx", "pnpm global", "yarn global", or "unknown".
function detectInstallSource(): string {
  const exec = process.argv[1] ?? "";
  const lower = exec.toLowerCase();

  if (lower.includes("_npx")) return "npx";
  if (lower.includes("pnpm")) return "pnpm global";
  if (lower.includes("yarn")) return "yarn global";

  // If we're running from a path under a global npm prefix, treat as npm global.
  if (process.env.npm_config_prefix && exec.startsWith(process.env.npm_config_prefix)) {
    return "npm global";
  }

  // Fallback: anywhere under node_modules/.bin in PATH? Usually means a local install.
  const pathParts = (process.env.PATH ?? "").split(delimiter);
  if (
    pathParts.some(
      (p) =>
        p.toLowerCase().includes("node_modules") && exec.toLowerCase().startsWith(p.toLowerCase()),
    )
  ) {
    return "local";
  }

  return "unknown";
}

// Returns the install/upgrade command tailored to the detected source.
function upgradeCommandFor(source: string, version: string): string {
  switch (source) {
    case "npx":
      return `npx nano-duoshe@${version} <command>`;
    case "pnpm global":
      return `pnpm add -g nano-duoshe@${version}`;
    case "yarn global":
      return `yarn global add nano-duoshe@${version}`;
    case "local":
      return `npm install nano-duoshe@${version}`;
    default:
      return `npm install -g nano-duoshe@${version}`;
  }
}

async function runUpgrade(): Promise<void> {
  log.step("检查最新版本");
  const info = await checkForUpdateNow();

  if (info.latest === info.current && !info.hasUpdate) {
    // Either offline (latest === current as fallback) or genuinely up to date.
    // We can tell them apart only by whether the network call succeeded — both
    // cases land here. Be honest about both.
    log.ok(`当前版本 ${kleur.bold(info.current)}`);
    log.info("已经是最新（或者无法连接到 npm registry）");
    return;
  }

  if (!info.hasUpdate) {
    log.ok(`当前版本 ${kleur.bold(info.current)} 已是最新（registry 上最新：${info.latest}）`);
    return;
  }

  const source = detectInstallSource();
  const cmd = upgradeCommandFor(source, info.latest);

  log.blank();
  log.raw(`  当前版本：${kleur.gray(info.current)}`);
  log.raw(`  最新版本：${kleur.green().bold(info.latest)}`);
  log.blank();
  log.raw(kleur.bold("  升级方法："));
  log.raw(`    ${kleur.cyan(cmd)}`);
  log.blank();
  if (source === "unknown") {
    log.raw(kleur.gray("  （检测不到你的安装方式，上面给的是 npm 全局的命令。"));
    log.raw(kleur.gray("    如果你是用 pnpm/yarn，请用对应工具的全局安装命令。）"));
  }
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("检查 nano-duoshe 是否有新版本，并给出对应的升级命令")
    .action(async () => {
      try {
        await runUpgrade();
      } catch (err) {
        log.err(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
