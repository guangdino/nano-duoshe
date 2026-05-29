#!/usr/bin/env node
import { Command } from "commander";
import { getVersion } from "../core/version.js";
import { registerGuideCommand } from "./commands/guide.js";
import { registerInitCommand } from "./commands/init.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerRememberCommand } from "./commands/remember.js";
import { registerReviewCommand } from "./commands/review.js";
import { registerSearchCommand } from "./commands/search.js";
import { registerSessionCommand } from "./commands/session.js";
import { registerSyncCommand } from "./commands/sync.js";

const program = new Command();

program
  .name("duoshe")
  .description(
    "DuoShe — local-first project memory layer for AI coding agents (Claude Code / Codex / Cursor)",
  )
  .version(getVersion(), "-v, --version", "print version")
  .helpOption("-h, --help", "show help");

registerInitCommand(program);
registerGuideCommand(program);
registerSearchCommand(program);
registerRememberCommand(program);
registerReviewCommand(program);
registerSessionCommand(program);
registerSyncCommand(program);
registerMcpCommand(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`duoshe: ${msg}\n`);
  process.exit(1);
});
