import type { Command } from "commander";
import { printStub } from "../stub.js";

export function registerSessionCommand(program: Command): void {
  const session = program
    .command("session")
    .description("管理会话记录（保存 AI 对话原文作为证据层；尚未实现）");

  session
    .command("archive")
    .description("把一段对话归档到 .duoshe/SESSIONS/（幂等，重复运行安全）")
    .option("--from <source>", "来源：claude-code | codex | cursor", "claude-code")
    .option("--file <path>", "从对话导出文件导入")
    .option("--format <format>", "文件格式：jsonl | markdown", "jsonl")
    .option("--session <id>", "只导入这个 session id")
    .option("--latest", "只导入最新一段会话")
    .action(() => {
      printStub("session archive", "M4");
    });

  session
    .command("append")
    .description("手动给当前会话追加一条记录")
    .requiredOption("--role <role>", "user | assistant | tool")
    .requiredOption("--content <content>", "内容")
    .option("--session <id>", "目标 session id（默认为当前）")
    .action(() => {
      printStub("session append", "M4");
    });

  session
    .command("show <sessionId>")
    .description("显示一段完整的会话")
    .action(() => {
      printStub("session show", "M4");
    });
}
