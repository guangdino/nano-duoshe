import type { Command } from "commander";
import { printStub } from "../stub.js";

export function registerSessionCommand(program: Command): void {
  const session = program
    .command("session")
    .description("manage session transcripts (raw evidence layer)");

  session
    .command("archive")
    .description("archive a conversation into .duoshe/SESSIONS/ (idempotent — safe to re-run)")
    .option("--from <source>", "import source: claude-code | codex | cursor", "claude-code")
    .option("--file <path>", "import from a chat export file")
    .option("--format <format>", "file format: jsonl | markdown", "jsonl")
    .option("--session <id>", "import only this session id")
    .option("--latest", "import the most recent session only")
    .action(() => {
      printStub("session archive", "M4");
    });

  session
    .command("append")
    .description("manually append a single turn to the current session")
    .requiredOption("--role <role>", "user | assistant | tool")
    .requiredOption("--content <content>", "turn content")
    .option("--session <id>", "target session id (defaults to current)")
    .action(() => {
      printStub("session append", "M4");
    });

  session
    .command("show <sessionId>")
    .description("show full transcript of a session")
    .action(() => {
      printStub("session show", "M4");
    });
}
