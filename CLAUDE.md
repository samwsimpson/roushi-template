# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Roushi** (老師, "old master / sage") — a self-wiring knowledge layer. Brain backed by Neon Postgres + pgvector; queryable via CLI, MCP server, and web UI.

## Commands

```bash
pnpm dev                                    # next dev (web UI)
pnpm typecheck                              # tsc --noEmit
pnpm roushi search "<query>"                # hybrid search
pnpm roushi think "<question>"              # LLM synthesis + citations
pnpm roushi graph-query <slug>              # walk the typed graph
pnpm roushi ingest <path>                   # markdown file or directory
pnpm roushi add -s <slug> -t <type> -n <name>
pnpm roushi add-project <path>              # ingest a project directory
pnpm roushi goal add --title "..."
pnpm roushi rules list
pnpm roushi skill list

pnpm db:setup                               # extensions → push → indexes (idempotent)
pnpm mcp                                    # MCP server (stdio, local)
```

## Architecture

Markdown files in `content/` are the source of truth. They get ingested into Neon via a two-phase walker that upserts entities first, then resolves `[[wikilink]]` references into typed edges. The brain is queryable via hybrid search (HNSW vector + tsvector keyword, fused via Reciprocal Rank Fusion) and graph traversal (recursive CTE). Two surfaces expose those primitives: the CLI and the MCP server.

## Things you'll hit

- **Drizzle `ANY()` with JS arrays spreads into N params** — produces invalid SQL. Cast to a Postgres array literal string first: `` const lit = `{${ids.join(",")}}` ``.
- **`drizzle-kit push` needs `strict: false`** in `drizzle.config.ts` to skip interactive confirmation.
- **All env loading goes through `.env.local`** via `tsx --env-file=.env.local` for scripts.
- **Embeddings dimension is fixed at 1536** (`text-embedding-3-small`).
- **`pnpm db:push` doesn't run post-migration SQL** (HNSW index, GIN index, triggers). Always follow with `pnpm db:indexes`, or just use `pnpm db:setup`.

## Conventions

- **Drizzle ORM**, schema in `src/db/schema.ts`. Use `db.execute(sql\`...\`)` for queries Drizzle can't express.
- **Snake-case in DB, camelCase in TypeScript** — Drizzle's `casing: "snake_case"` handles the mapping.
- **Module resolution:** `"moduleResolution": "bundler"`, ESM throughout, all imports use `.js` extensions.
