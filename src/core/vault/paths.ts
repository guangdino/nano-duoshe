import { join } from "node:path";

export const VAULT_DIRNAME = ".duoshe";

export type VaultPaths = {
  root: string;
  vault: string;
  config: string;
  project: string;
  codeMap: string;
  decisions: string;
  troubleshooting: string;
  modules: string;
  todo: string;
  sessions: string;
  candidates: string;
  candidatesPending: string;
  candidatesAccepted: string;
  candidatesRejected: string;
  skills: string;
  indexDb: string;
};

export function vaultPathsFor(projectRoot: string): VaultPaths {
  const vault = join(projectRoot, VAULT_DIRNAME);
  return {
    root: projectRoot,
    vault,
    config: join(vault, "config.json"),
    project: join(vault, "PROJECT.md"),
    codeMap: join(vault, "CODEMAP.md"),
    decisions: join(vault, "DECISIONS.md"),
    troubleshooting: join(vault, "TROUBLESHOOTING.md"),
    modules: join(vault, "MODULES.md"),
    todo: join(vault, "TODO.md"),
    sessions: join(vault, "SESSIONS"),
    candidates: join(vault, "CANDIDATES"),
    candidatesPending: join(vault, "CANDIDATES", "pending.jsonl"),
    candidatesAccepted: join(vault, "CANDIDATES", "accepted.jsonl"),
    candidatesRejected: join(vault, "CANDIDATES", "rejected.jsonl"),
    skills: join(vault, "SKILLS"),
    indexDb: join(vault, "index.db"),
  };
}
