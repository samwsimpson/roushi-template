#!/usr/bin/env node
// Roushi MCP server — HTTP (Streamable) transport.
//
// Lets non-stdio clients hit the brain over HTTP. Useful for:
//   - browser-based agents (Claude API in a webapp, Cursor remote MCP, etc.)
//   - deployed agents (Vercel workers, GitHub Actions) once roushi.ai is live
//   - any tooling that prefers HTTP/SSE to spawning a subprocess
//
// Stateful sessions: each client gets a UUID via Mcp-Session-Id header on
// initialize, then includes it on subsequent requests so this server can
// route them to the right transport instance.
//
// Auth: every request must include
//   Authorization: Bearer <ROUSHI_MCP_HTTP_TOKEN>
// or the server returns 401. If the env var is unset the server refuses to
// boot — we don't want to silently expose an unauthenticated brain endpoint.

import { randomUUID } from "node:crypto";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools, TOOL_NAMES } from "./tools";

const PORT = Number(process.env.ROUSHI_MCP_HTTP_PORT ?? "3737");
const TOKEN = process.env.ROUSHI_MCP_HTTP_TOKEN;

if (!TOKEN) {
  console.error(
    "[roushi-mcp:http] refusing to start without ROUSHI_MCP_HTTP_TOKEN. " +
      "Generate one (e.g. `openssl rand -base64 32` or `[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))`) " +
      "and add it to .env.local before running `pnpm mcp:http`.",
  );
  process.exit(1);
}

// One McpServer per session — the SDK transport is one-to-one with a server.
const sessions = new Map<string, { mcp: McpServer; transport: StreamableHTTPServerTransport }>();

async function createSession(sessionIdOverride?: string): Promise<{
  mcp: McpServer;
  transport: StreamableHTTPServerTransport;
  sessionId: string;
}> {
  const sessionId = sessionIdOverride ?? randomUUID();
  const mcp = new McpServer(
    { name: "roushi", version: process.env.npm_package_version ?? "0.10.0" },
    { capabilities: { tools: {} } },
  );
  registerAllTools(mcp);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
  });
  transport.onclose = () => {
    sessions.delete(sessionId);
  };
  await mcp.connect(transport);
  sessions.set(sessionId, { mcp, transport });
  return { mcp, transport, sessionId };
}

function unauthorized(res: ServerResponse, msg = "Unauthorized"): void {
  res.statusCode = 401;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ error: msg }));
}

function checkAuth(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return Boolean(match && match[1] === TOKEN);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  const raw = Buffer.concat(chunks).toString("utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const server = createServer(async (req, res) => {
  // Health check — unauthenticated, returns ok + tool count so a deploy probe works.
  if (req.method === "GET" && req.url === "/health") {
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ ok: true, tools: TOOL_NAMES.length }));
    return;
  }

  if (req.url !== "/mcp" && req.url !== "/mcp/") {
    res.statusCode = 404;
    res.end("Not found. POST /mcp with Authorization: Bearer <token>");
    return;
  }

  if (!checkAuth(req)) {
    unauthorized(res);
    return;
  }

  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (req.method === "DELETE" && sessionId) {
      // Client explicitly closing a session.
      const entry = sessions.get(sessionId);
      if (entry) {
        await entry.transport.close();
        sessions.delete(sessionId);
      }
      res.statusCode = 204;
      res.end();
      return;
    }

    let entry = sessionId ? sessions.get(sessionId) : undefined;
    let body: unknown = undefined;

    if (req.method === "POST") {
      body = await readJsonBody(req);
    }

    if (!entry) {
      // No session yet — either this is an initialize call or we need to mint one.
      const created = await createSession(sessionId);
      entry = { mcp: created.mcp, transport: created.transport };
      res.setHeader("mcp-session-id", created.sessionId);
    } else {
      res.setHeader("mcp-session-id", sessionId!);
    }

    await entry.transport.handleRequest(req, res, body);
  } catch (err) {
    console.error("[roushi-mcp:http] handler error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    }
  }
});

server.listen(PORT, () => {
  console.error(
    `[roushi-mcp:http] listening on http://localhost:${PORT}/mcp ` +
      `(${TOOL_NAMES.length} tools, ${sessions.size} sessions). ` +
      `Health: GET /health`,
  );
});

process.on("SIGINT", () => {
  console.error("[roushi-mcp:http] shutting down…");
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  console.error("[roushi-mcp:http] shutting down…");
  server.close(() => process.exit(0));
});
