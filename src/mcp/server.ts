#!/usr/bin/env node
// Roushi MCP server — stdio transport.
// Tool registrations live in src/mcp/tools.ts so the HTTP transport
// can share them. Globally registered in Claude Code via:
//   claude mcp add -s user roushi pnpm -- --silent --dir <path> mcp

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools, TOOL_NAMES } from "./tools";

const mcp = new McpServer(
  { name: "roushi", version: "0.13.5" },
  { capabilities: { tools: {} } },
);
registerAllTools(mcp);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error(`[roushi-mcp:stdio] connected — ${TOOL_NAMES.length} tools registered`);
}

main().catch((err) => {
  console.error("[roushi-mcp:stdio] fatal:", err);
  process.exit(1);
});
