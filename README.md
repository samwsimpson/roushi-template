# Roushi (老師)

> *Ask the master.*

A self-wiring knowledge layer for portfolio operators, agency founders, and anyone running multiple products. Roushi remembers every decision, pattern, lesson, and goal across all your projects — and surfaces the right context while you code.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsamwsimpson%2Froushi-template&env=OPENAI_API_KEY,AUTH_SECRET,ROUSHI_MCP_HTTP_TOKEN,CRON_SECRET&envDescription=Required%20env%20vars.%20See%20.env.example%20for%20details.&envLink=https%3A%2F%2Fgithub.com%2Fsamwsimpson%2Froushi-template%2Fblob%2Fmain%2F.env.example&project-name=roushi&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D)

---

## What you get

| Surface | What it does |
|---|---|
| **Ask** (homepage) | Type a question → LLM synthesizes an answer from your brain with citations |
| **/graph** | Force-directed visualization of every entity and edge in your knowledge graph |
| **/goals** | Multi-week objectives with lifecycle tracking. System goals auto-created by maintenance crons |
| **/rules** | Durable instructions that auto-sync into every workspace's AI tool config |
| **/skills** | Claude Code skills indexed so search/think can recommend them |
| **/optimize** | Brain health: fix edges, merge duplicates, flag stale entries, detect contradictions |
| **CLI** | `pnpm roushi search/think/graph-query/ingest/goal/rule/skill/optimize` |
| **MCP server** | 35 tools — works with Claude Code, VS Code + Copilot, Cursor, Windsurf, any MCP client |
| **4 cron scans** | Decay, audit-edges, dedupe, contradictions — automated brain maintenance |

---

## Quick start

### Option 1: Deploy to Vercel (fastest)

Click the button above. Vercel provisions a Neon Postgres database automatically. You'll be prompted for:

- **OPENAI_API_KEY** — for embeddings ([get one here](https://platform.openai.com/api-keys))
- **AUTH_SECRET** — run `openssl rand -base64 32`
- **ROUSHI_MCP_HTTP_TOKEN** — run `openssl rand -hex 32`
- **CRON_SECRET** — run `openssl rand -hex 32`

After the first deploy succeeds, run `pnpm db:setup` once (locally or via Vercel CLI) to create the database tables and indexes.

### Option 2: Local development

```bash
git clone https://github.com/YOUR_USER/roushi  # your fork from the deploy
cd roushi
pnpm install
cp .env.example .env.local                      # fill in DATABASE_URL, OPENAI_API_KEY
pnpm db:setup                                    # extensions → schema → indexes
pnpm dev                                         # http://localhost:3000
```

### Ingest your knowledge

```bash
# Ingest the starter content
pnpm roushi ingest content/

# Add your own product
pnpm roushi add -s my-product -t product -n "My Product"

# Or ingest a whole project directory
pnpm roushi add-project ~/projects/my-app

# Search what you've ingested
pnpm roushi search "auth patterns"
pnpm roushi think "what database should I use for my next project?"
```

---

## Connect your editor

### Claude Code (deepest integration)

```bash
# Register MCP server (local)
claude mcp add -s user roushi pnpm -- --silent --dir /path/to/roushi mcp

# Or remote (your deployed instance)
claude mcp add -s user roushi-remote \
  https://your-roushi.vercel.app/api/mcp \
  --transport http \
  --header "Authorization: Bearer $YOUR_TOKEN"
```

### VS Code (Copilot, Cursor, Windsurf)

Install the [Roushi VS Code extension](https://github.com/samwsimpson/roushi-vscode):

```bash
code --install-extension kumokodo.roushi
```

Then set your endpoint + token in VS Code Settings → search "roushi".

---

## Content structure

```
content/
├── products/       # Your products and projects
├── decisions/      # Architectural decisions (D1, D2, ...)
├── lessons/        # Things learned the hard way
├── patterns/       # Reusable architectural patterns
└── rules/          # Durable instructions for your AI tools
```

Each file is a markdown file with frontmatter (`slug`, `type`, `name`). Wikilinks (`[[slug]]` or `[[relation:slug]]`) create typed edges in the graph.

---

## Documentation

- [roushi.ai/install](https://roushi.ai/install) — full install guide (all four methods)
- [roushi.ai/help](https://roushi.ai/help) — reference for entities, edges, search, CLI, MCP tools, hooks
- [.env.example](./.env.example) — all environment variables with descriptions

---

## Built by KumoKodo

Roushi is built by [KumoKodo](https://kumokodo.ai). Originally built as an internal tool to manage 20+ products under one roof, now available for other portfolio operators and agency founders.

**License:** MIT (CLI, SDK, MCP server). Source-available (SaaS app).
