// Roushi MCP — HTTP transport deployed on Vercel.
//
// Wraps the same `registerAllTools` registry used by the stdio server,
// so the entire MCP surface (search, think, graph, skill, rule, goal,
// playbook, optimize) is available over HTTPS to any external client.
//
// Auth: every request needs `Authorization: Bearer ${ROUSHI_MCP_HTTP_TOKEN}`.
// If the env var is unset, the route returns 503 (don't silently expose
// an unauthenticated brain endpoint).
//
// Protocol: stateless JSON-RPC over POST. Each request is a complete
// MCP message; the response is the matching JSON-RPC reply (or 204 for
// notifications). No session state between requests, so the client
// re-sends `initialize` if it needs the handshake. That's fine because
// the McpServer instance is module-scoped — initialize is essentially
// a metadata fetch.

import { createHash } from "node:crypto";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools, TOOL_NAMES } from "../../../mcp/tools";

// ─── In-memory transport ────────────────────────────────────────────
// The MCP SDK's Server class talks to a Transport with onmessage / send
// hooks. We implement a synchronous "roundtrip" pump: push a JSON-RPC
// request in, capture the matching response by id.

class CapturingTransport implements Transport {
  onmessage?: (msg: unknown) => void;
  onerror?: (err: Error) => void;
  onclose?: () => void;
  private pendingById = new Map<string | number, (msg: unknown) => void>();

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.onclose?.();
  }

  async send(msg: unknown): Promise<void> {
    const id = (msg as { id?: string | number })?.id;
    if (id === undefined || id === null) return; // notifications dropped
    const resolve = this.pendingById.get(id);
    if (resolve) {
      this.pendingById.delete(id);
      resolve(msg);
    }
  }

  async roundtrip(incoming: unknown): Promise<unknown | null> {
    const id = (incoming as { id?: string | number })?.id;
    if (id === undefined || id === null) {
      // Notification — fire and forget, no response expected.
      this.onmessage?.(incoming);
      return null;
    }
    return new Promise((resolve) => {
      this.pendingById.set(id, resolve);
      this.onmessage?.(incoming);
    });
  }
}

// ─── Module-scoped server ───────────────────────────────────────────
// Fluid Compute reuses function instances across requests, so this
// initialization cost is paid once per cold start.

let cached: Promise<{ mcp: McpServer; transport: CapturingTransport }> | null = null;

async function getServer(): Promise<{ mcp: McpServer; transport: CapturingTransport }> {
  if (cached) return cached;
  cached = (async () => {
    const mcp = new McpServer(
      { name: "roushi", version: process.env.npm_package_version ?? "0.10.0" },
      { capabilities: { tools: {} } },
    );
    registerAllTools(mcp);
    const transport = new CapturingTransport();
    await mcp.connect(transport);
    return { mcp, transport };
  })();
  return cached;
}

// ─── Auth ───────────────────────────────────────────────────────────

function extractToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1] ?? null;
}

function checkAuth(req: Request): boolean {
  const expected = process.env.ROUSHI_MCP_HTTP_TOKEN;
  if (!expected) return false;
  const token = extractToken(req);
  return token === expected;
}

function unauthorized(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

// ─── Rate limiting ──────────────────────────────────────────────────
// Per-token rolling-window counter. Each Fluid Compute instance keeps its
// own counter, so the effective limit is (RATE_LIMIT_PER_MIN × N
// instances). Good enough for single-tenant where N≈1; revisit with
// Vercel Runtime Cache or Edge Config when multi-tenant ships.

const RATE_LIMIT_PER_MIN = 120; // 120 req/min = 2/sec per token
const RATE_LIMIT_WINDOW_MS = 60_000;

interface RateLimitState {
  count: number;
  windowStartMs: number;
}

const rateLimitState = new Map<string, RateLimitState>();

function hashToken(token: string): string {
  // Hash so the long-lived map never holds plaintext.
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function checkRateLimit(token: string): { ok: boolean; retryAfterSec?: number; remaining?: number } {
  const key = hashToken(token);
  const now = Date.now();
  const state = rateLimitState.get(key);
  if (!state || now - state.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    rateLimitState.set(key, { count: 1, windowStartMs: now });
    return { ok: true, remaining: RATE_LIMIT_PER_MIN - 1 };
  }
  if (state.count >= RATE_LIMIT_PER_MIN) {
    const elapsedMs = now - state.windowStartMs;
    const retryAfterSec = Math.ceil((RATE_LIMIT_WINDOW_MS - elapsedMs) / 1000);
    return { ok: false, retryAfterSec, remaining: 0 };
  }
  state.count++;
  return { ok: true, remaining: RATE_LIMIT_PER_MIN - state.count };
}

function rateLimited(retryAfterSec: number): Response {
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retryAfterSec,
      limit: `${RATE_LIMIT_PER_MIN} requests per minute per token`,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSec),
        "x-ratelimit-limit": String(RATE_LIMIT_PER_MIN),
        "x-ratelimit-remaining": "0",
      },
    },
  );
}

// ─── Health probe (GET /api/mcp) ────────────────────────────────────
// Unauthenticated — only returns shape info, never any brain content.

export async function GET(): Promise<Response> {
  const ready = Boolean(process.env.ROUSHI_MCP_HTTP_TOKEN);
  return Response.json({
    ok: ready,
    tools: ready ? TOOL_NAMES.length : 0,
    authConfigured: ready,
    transport: "http-jsonrpc",
    note: ready
      ? "POST a JSON-RPC message to this endpoint with Authorization: Bearer <token>."
      : "ROUSHI_MCP_HTTP_TOKEN is not set on the server — auth disabled, all POSTs return 401.",
  });
}

// ─── POST /api/mcp ──────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  if (!checkAuth(req)) return unauthorized();

  // After auth: per-token rate limiting. The auth check guarantees the
  // token equals ROUSHI_MCP_HTTP_TOKEN, so extracting it again is just a
  // re-parse — cheap, and decouples the rate-limit key from the auth.
  const token = extractToken(req);
  if (token) {
    const rate = checkRateLimit(token);
    if (!rate.ok) return rateLimited(rate.retryAfterSec ?? 60);
  }

  let msg: unknown;
  try {
    msg = await req.json();
  } catch {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    const { transport } = await getServer();
    const response = await transport.roundtrip(msg);
    if (response === null) {
      // Notification — no response per JSON-RPC spec.
      return new Response(null, { status: 204 });
    }
    return Response.json(response);
  } catch (err) {
    console.error("[mcp:http] handler error:", err);
    const id = (msg as { id?: string | number })?.id ?? null;
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
}

// ─── Optional: OPTIONS for CORS preflight ───────────────────────────
// Not strictly required for `claude mcp add` (server-to-server) but
// helps if a browser-based client ever hits the endpoint.

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-max-age": "86400",
    },
  });
}
