import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { VaultConfig } from "../types.js";

export function defaultConfig(opts: {
  projectId: string;
  projectName: string;
  vaultPath: string;
  indexPath: string;
}): VaultConfig {
  return {
    projectId: opts.projectId,
    projectName: opts.projectName,
    version: "0.1",
    vaultPath: opts.vaultPath,
    indexPath: opts.indexPath,
    contextFiles: ["PROJECT.md", "DECISIONS.md", "MODULES.md", "TROUBLESHOOTING.md", "TODO.md"],
    maxContextChars: 12000,
    allowAgentPublish: false,
    createdAt: new Date().toISOString(),
  };
}

export function writeConfig(configPath: string, config: VaultConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function readConfig(configPath: string): VaultConfig | null {
  if (!existsSync(configPath)) return null;
  try {
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as VaultConfig;
  } catch {
    return null;
  }
}
