import type { Command } from "commander";
import { printStub } from "../stub.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("start the DuoShe MCP server over stdio (configure in your editor's .mcp.json)")
    .action(() => {
      printStub("mcp", "M5");
    });
}
