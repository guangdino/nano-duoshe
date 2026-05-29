import type { Command } from "commander";
import { printStub } from "../stub.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("启动 DuoShe MCP 服务（让 AI 工具能直接调用 DuoShe 的记忆 API；尚未实现）")
    .action(() => {
      printStub("mcp", "M5");
    });
}
