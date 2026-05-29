# Roushi — Tech Stack

**Version:** 0.13.0
**Last updated:** 2026-05-28
**Stack philosophy:** match KumoKodo portfolio defaults so Roushi's build doubles as exercising the standard scaffold.

---

## Architectural primitives Roushi is built on

| Primitive | Why it matters |
|---|---|
| **Markdown files as source of truth** | If Postgres dies, knowledge survives as plain text in git. Rebuildable. Portable. Inspectable. |
| **Postgres + pgvector as the index** | SQL queries unlock arbitrary reporting; pgvector enables semantic search; same DB Sam already runs across the portfolio (Neon). |
| **Hybrid search (HNSW + tsvector + RRF)** | Vector-only RAG misses ~17% of correct answers; RRF fusion lifts Recall@5 from 83% → 95% per GBrain benchmarks. |
| **Zero-LLM graph extraction** | Wikilink + typed-link regex extraction has no per-write LLM cost — graph stays fresh on every save without burning tokens. |
| **MCP server** | Universal LLM↔tool protocol. One implementation reaches Claude Code, Claude Desktop, Cursor, Windsurf, custom agents, and every future client. |
| **Event-driven via Vercel Workflow** | Durable, crash-safe orchestration for autonomous loops. Matches Kodori/Kuroji choice. |

---

## Full stack

### Frontend + API (single Next.js app)

- **Next.js 16** (App Router) — UI + API routes + Server Actions
- **React 19** + **Tailwind CSS 4** — UI
- **react-markdown** — Ask flow renders LLM output as markdown with custom citation chips
- **cytoscape** — force-directed graph viz at `/graph` (built-in `cose` layout, no plugin packages)
- **shadcn/ui** — component primitives (matches Akiko, Kodori conventions)
- **Turbopack** — bundler (default in Next.js 16)
- **TypeScript 5.6+** — strict mode

### Backend / data

- **Neon Postgres** (via Vercel Marketplace) — primary DB, hosted, multi-machine free
- **pgvector** — embedding storage + HNSW index
- **Drizzle ORM** — type-safe queries + migrations (snapshot model; matches portfolio default)
- **Vercel Blob** — for any binary attachments (rare; mostly markdown stays in git)

### AI layer

- **Vercel AI Gateway** — single endpoint for all Claude calls (provider abstraction + observability + cost tracking)
- **Claude Haiku 4.5** — cheap classification, summary, extraction (default)
- **Claude Opus 4.7** — deep synthesis, complex graph queries, agent orchestration
- **OpenAI text-embedding-3-small** — embeddings (best cost/quality at scale)
- *Future:* swap embeddings to Voyage or Cohere if Vercel adds them to Gateway

### Auth + identity

- **Auth.js v5** — single-user mode initially, multi-tenant schema from day 1
- **Resend** — transactional email (verification, magic links)
- *Future:* SSO/SAML via WorkOS at v2

### MCP server

- **Node.js 24 LTS** on **Vercel Fluid Compute**
- Exposes brain over stdio (local, `pnpm mcp`), HTTP standalone (`pnpm mcp:http`, port 3737), AND deployed HTTP route (`/api/mcp` on roushi.ai, Bearer-token auth via `ROUSHI_MCP_HTTP_TOKEN`)
- **35 tools** as of v0.10.0 (see `TOOL_NAMES` in `src/mcp/tools.ts` for the canonical list — covers search/think/graph, entity CRUD, ingest, scan/add-project, goals, scratchpad, playbooks, rules, skills, optimize/audit/dedupe/decay/merge/touch)

### Background jobs / autonomy

- **Vercel Cron** — 4 active schedules (decay daily 3am UTC, audit-edges Sun 4am UTC, dedupe 1st of month 5am UTC, contradictions Sun 6am UTC). Each scan logs to `maintenance_runs` regardless of outcome.
- **Vercel Workflow (WDK)** — deferred to v1 (no current durable multi-step flows). Reserved for the eventual coordination cascade (Automation A).
- **GitHub webhooks** — deferred to v1 (currently no commit/PR-triggered brain updates; updates are manual via `roushi ingest` or `add-project`).
- **Vercel deploy hooks** — deferred to v1.

### Claude Code integration layer

- **SessionStart hook** (`scripts/session-start-hook.ts`) — fires on every Claude Code session start in any KumoKodo workspace. Detects which product the cwd belongs to, syncs applicable rules into the workspace's Claude memory dir, emits a context block showing what Roushi knows about the product.
- **PreToolUse security hook** (`scripts/pre-edit-security-hook.js`, copied globally to `~/.claude/hooks/`) — file-path-pattern security checklist injected before every Edit/Write. Fires across all KumoKodo workspaces via global `~/.claude/settings.json`.
- **PreToolUse Roushi-as-advisor hook** (`scripts/context-for-file.ts`) — classifies the file being edited, looks up relevant lessons/decisions/patterns/rules from the brain, injects as `additionalContext`. ~500ms wall-clock per fire; gated to emit only when a classification matched or relevant entities found.
- **PostToolUse hook** (`scripts/post-tool-hook.js`, repo-local) — Biome format-on-write + schema/content nudges. Roushi-specific.
- **`release-bump` skill** — version-across-three-files lockstep editor.
- **`sql-pattern-reviewer` subagent** — focused review for the documented `db.execute(sql\`... ANY(${jsArray})\`)` footgun.

### Deployment + infra

- **Vercel** — hosting, edge, functions, cron, workflows
- **Neon** — Postgres + pgvector (via Vercel Marketplace = unified billing + auto env vars)
- **GitHub** — source repo
- **vercel.ts** — typed project config (matches latest Vercel pattern)
- **Node 24 LTS** — runtime default

### Developer tools

- **pnpm** — package manager (matches portfolio default)
- **Turborepo** — monorepo orchestration *if* we split into multiple packages (open question)
- **Biome** — lint + format (faster than ESLint+Prettier; tried and validated in Akiko)
- **Vitest** — unit + integration tests
- **Playwright** — E2E for web UI

### CLI

- **Bun** or **Node** for CLI binary
- Distributed via `npm i -g @kumokodo/roushi-cli`
- Published via GitHub Actions Trusted Publishing (per the `npm-trusted-publishing` rule)

### Observability

- **Vercel Analytics** — web vitals + traffic
- **Vercel Speed Insights** — perf monitoring
- **Vercel Logs** — function + workflow logs
- *Future:* OpenTelemetry export to Honeycomb or similar at v1.5

---

## Comparison to GBrain (where Roushi differs)

| Dimension | GBrain | Roushi |
|---|---|---|
| Storage | PGLite (default) or Postgres | Neon Postgres only (multi-machine from day 1) |
| Source of truth | Markdown in a flat directory | Markdown in git repo (versioned, branchable, diffable) |
| Schema | Generic person/company/page | KumoKodo-tuned (products, decisions, patterns, incidents, goals) |
| UI | CLI primarily | CLI + Next.js web UI |
| Auth | None (local-first) | Auth.js v5 (multi-user ready) |
| Agent coordination | Single-agent | Multi-agent via scratchpad partition |
| Event triggers | Cron only | Cron + GitHub webhooks + Vercel hooks + manual |
| Autonomy primitives | Job queue | Vercel Workflow (durable, crash-safe, step-based) |
| Licensing | MIT (open source) | TBD — likely source-available for SaaS, MIT for CLI |
| Target | Personal knowledge ops | Portfolio operators + agencies + teams |

We learn from GBrain's architecture (hybrid search, zero-LLM extraction, RRF) but build our own to control the schema, the agent surface, and the SaaS path.

---

## Multi-machine architecture

Sam works exclusively on his Alienware desktop (no laptop) — but multi-machine is desired for future workstations, mobile access, and team scenarios.

```
┌────────────────────┐    ┌────────────────────┐    ┌────────────────────┐
│  Alienware Desktop │    │      Mobile        │    │  Future workstation│
│  (Claude Code,     │    │      (web UI)      │    │  / team member     │
│   CLI, MCP local)  │    │                    │    │                    │
└──────────┬─────────┘    └─────────┬──────────┘    └─────────┬──────────┘
           │                        │                          │
           └────────────────────────┼──────────────────────────┘
                                    │ HTTPS
                                    ▼
                  ┌─────────────────────────────────┐
                  │   roushi.ai (Vercel)            │
                  │   - Next.js web UI              │
                  │   - REST API                    │
                  │   - MCP server (HTTP transport) │
                  │   - Workflow jobs               │
                  │   - Cron jobs                   │
                  └─────────────────┬───────────────┘
                                    │
                                    ▼
                  ┌─────────────────────────────────┐
                  │   Neon Postgres + pgvector      │
                  │   (single source of truth)      │
                  └─────────────────────────────────┘
                                    ▲
                                    │ optional sync
                                    │
                  ┌─────────────────────────────────┐
                  │   GitHub repo (markdown source) │
                  │   - decisions/, patterns/,      │
                  │     lessons/, entities.md       │
                  │   - branchable, diffable        │
                  └─────────────────────────────────┘
```

---

## Data portability guarantees

A core design principle: **Roushi's value should never lock you in.**

| Guarantee | How |
|---|---|
| Knowledge survives DB failure | All entries written to markdown in git first; Postgres is an index over the markdown |
| Knowledge survives Roushi shutting down | Markdown files are the source of truth; readable in any text editor |
| Migrate to another tool | Markdown export is the default state — no export step needed |
| Self-host instead of SaaS | Open-source CLI + MCP server; Docker image for the API; bring your own Postgres |
| No vendor lock to Vercel | All Vercel-specific code abstracted behind interfaces; could run on AWS/Fly/Hetzner with effort |

---

## Integration points

### For agents (LLM clients)

- **MCP server** — primary integration. Any MCP-compatible agent can connect.
- **REST API** — for custom integrations and non-MCP clients
- **Webhook out** — Roushi can notify external systems on graph changes

### For KumoKodo products

- Each product imports `@kumokodo/roushi-sdk` (Node) to write decisions/lessons/incidents during runtime
- Build-time hook: `roushi-cli ingest` runs in CI to sync repo docs to brain
- Pre-commit hook: scans diff for decision signals, prompts to write to brain

### For external services

- **GitHub** — webhook for PR/push events
- **Vercel** — deploy hook for build events
- **Stripe** — webhook for billing events (v2)
- **Linear / GitHub Issues** — bidirectional sync (v2)

---

## Cost model (Roushi's own infra)

Estimated monthly cost during KumoKodo internal phase (single user, ~10K entries):

| Component | Monthly cost |
|---|---|
| Vercel Pro plan | $20 (already paying for portfolio) |
| Neon Postgres (Marketplace, scale-to-zero) | ~$0-5 |
| Vercel AI Gateway → Claude (Haiku for extraction, occasional Opus) | ~$10-30 |
| OpenAI embeddings | ~$2-5 |
| Domain (`roushi.ai` when purchased) | $80/yr ≈ $7/mo |
| **Total** | **~$40-70/mo** |

At v2 (SaaS, 100 paying users), unit economics target: <30% COGS per user (per industry standard for SaaS infra).

---

## Stack decisions log

> Each entry follows the "What — Why — Alternatives considered — Date" pattern. Will move to its own `stack_decisions.md` once it exceeds ~10 entries.

### D1: Neon Postgres over self-hosted

- **What:** Use Neon (via Vercel Marketplace) as the primary DB
- **Why:** Multi-machine sync free, scale-to-zero pricing matches early-stage usage, auto env vars from Vercel integration, matches portfolio default since Apr 2026 migration
- **Alternatives:** PGLite (no multi-machine), self-hosted Postgres on Alienware (single point of failure + no cross-device), Supabase (additional vendor)
- **Date:** 2026-05-23

### D2: Drizzle over Prisma

- **What:** Drizzle ORM for schema + migrations
- **Why:** Snapshot migrations, cleaner TS inference, better pgvector support, matches portfolio default
- **Alternatives:** Prisma (older portfolio convention but worse vector support)
- **Date:** 2026-05-23

### D3: Vercel AI Gateway over direct provider SDKs

- **What:** Route all LLM calls through Vercel AI Gateway
- **Why:** Provider abstraction (swap Claude versions or providers without code change), unified observability + cost tracking, model fallbacks, zero data retention
- **Alternatives:** Direct `@ai-sdk/anthropic` (less flexible), LangChain (heavyweight)
- **Date:** 2026-05-23

### D4: MCP server as primary agent interface

- **What:** Expose brain to LLMs via MCP (stdio + HTTP transports)
- **Why:** MCP is now the universal standard for LLM↔tool integration; one implementation reaches all current and future agents
- **Alternatives:** Custom REST API only (would require adapter per LLM client)
- **Date:** 2026-05-23

### D5: Vercel Workflow over Inngest

- **What:** Use Vercel Workflow (WDK) for durable background jobs
- **Why:** Native Vercel integration (no separate dashboard), matches Kodori + Kuroji choice, crash-safe by default
- **Alternatives:** Inngest (used in Kodori v1; more mature but external dependency), raw Vercel Cron (no durability for multi-step)
- **Date:** 2026-05-23

### D6: Source-available SaaS, MIT for CLI/SDK

- **What:** SaaS code is source-available (not OSS); CLI and SDK are MIT-licensed
- **Why:** Open primitives (CLI, SDK, MCP server) so the ecosystem can build on Roushi; keep SaaS app source-available to protect the business
- **Alternatives:** Fully MIT (no business protection), fully proprietary (no ecosystem)
- **Date:** 2026-05-23 (revisit before v2 launch)

### D7: Single Next.js repo for v0 (Turborepo deferred)

- **What:** All of web UI, CLI, MCP server, and library code live in one Next.js app at `c:\Users\samws\Roushi`. No `apps/` or `packages/` split.
- **Why:** CLI and SDK shapes weren't clear at v0; splitting them prematurely would have forced API design before requirements existed. Single repo keeps the iteration loop fast.
- **Alternatives:** Turborepo with `apps/web` + `apps/mcp` + `packages/cli` + `packages/sdk` — appropriate when CLI shape stabilizes and/or we want to publish `@kumokodo/roushi-sdk` separately.
- **Revisit when:** CLI usage hits 100+ external installs, or we need to ship the SDK to npm.
- **Date:** 2026-05-24

### D8: Node 24 LTS + `tsx` for CLI runtime (not Bun)

- **What:** CLI invocations use `tsx --env-file=.env.local src/cli/index.ts <cmd>`.
- **Why:** Node 24 is the portfolio default. tsx handles TS+ESM without a build step, matches how the rest of the project runs. Bun would split the runtime story across the portfolio.
- **Alternatives:** Bun (faster startup but breaks the "one runtime everywhere" invariant), compiled standalone CLI (premature without distribution shape).
- **Date:** 2026-05-24

### D9: GitHub OAuth via Auth.js v5 (not magic links)

- **What:** Single sign-in path: GitHub OAuth. Auth.js v5 with JWT sessions. Single-user gating via `AUTH_ALLOWED_EMAILS` env var.
- **Why:** Every KumoKodo product is on GitHub anyway, so the OAuth flow is one-click. JWT sessions avoid the DB adapter complexity for v0; we can add the adapter when multi-tenant ships.
- **Alternatives:** Magic links via Resend (more setup, more email plumbing), GitHub + Google + email (more code paths to maintain at v0).
- **Revisit at:** v2 SaaS launch — likely add Google OAuth + magic links for non-developer customers.
- **Date:** 2026-05-24

### D10: Type-based nested markdown dirs with frontmatter (not flat)

- **What:** `content/<type>/<slug>.md` (e.g. `content/rules/portfolio-default-stack.md`, `content/products/roushi.md`). Frontmatter carries `slug`, `type`, `name`, plus any extra fields (e.g. `applies_to`, `priority`).
- **Why:** File-system structure mirrors the entity-type enum, making it obvious where to put a new file. Frontmatter lets ingestion be type-agnostic (the type is in the path AND the frontmatter, so we have redundant signal).
- **Alternatives:** Flat directory with frontmatter (less obvious where new files go), nested by topic (subjective and drifts).
- **Date:** 2026-05-24

### D11: Embeddings direct to OpenAI (not via AI Gateway)

- **What:** Embeddings hit OpenAI's `text-embedding-3-small` directly, not through Vercel AI Gateway.
- **Why:** Embeddings are a tight loop (per-entity, per-search, often hundreds per second on ingest). Adding the gateway hop materially slows ingestion and adds proxy overhead for what is effectively a commodity primitive.
- **Alternatives:** Route through Gateway (consistent observability, marginally easier provider swap), use a local embeddings model (slower per-call, model-quality tradeoff).
- **Revisit when:** AI Gateway adds first-class embeddings support with measurable latency parity.
- **Date:** 2026-05-24

### D12: `drizzle-kit push` with `strict: false`

- **What:** `drizzle.config.ts` sets `strict: false` so `pnpm db:push` doesn't prompt interactively for schema changes.
- **Why:** With `strict: true`, push prompts the user to confirm changes; in non-TTY environments (CI, scripts, even some IDE terminals) it hangs forever. We use `db:push` in scripts and want it non-interactive.
- **Alternatives:** Manual `drizzle-kit generate` + `migrate` flow (more steps for what's mostly additive changes at this stage).
- **Revisit when:** Schema changes become destructive enough that auto-applying without prompt is risky.
- **Date:** 2026-05-24

### D13: Portfolio seed = one entity per repo, not one per file

- **What:** `scripts/seed-portfolio.ts` and the `add-project` flow create exactly one `product` entity per repo (using the repo path as `source_path`), then LLM-extract sub-entities (tech, vendor, decision, etc.) from that product's docs.
- **Why:** One file per product collided on slugs (every product has a CLAUDE.md) and diluted embedding signal (mixing 10 products' content into one embedding loses semantic specificity). Per-repo entities give clean semantics.
- **Alternatives:** One entity per .md file (early v0.0.3 attempt; collided badly), one entity per logical concept (would have required hand-curation per product).
- **Date:** 2026-05-24

### D14: Index Claude Code skills as `skill` entities; don't host bodies

- **What:** Skills live on disk at `~/.claude/skills/<name>/SKILL.md` so Claude Code's native `/<skill>` invocation works. Roushi indexes each as a `skill` entity (slug, trigger description, body, source path, lint warnings) for cross-reference. Embedding is made from `name + description` (trigger surface), not body.
- **Why:** Pulling skill bodies into Roushi would break native invocation. But not indexing them means `think`/`search` can't recommend skills in answers. Indexing without owning gives us the recommendation surface without the platform friction.
- **Alternatives:** Host skill bodies in Roushi and proxy to disk (fights Claude Code, dual sources of truth), don't index at all (misses the "for this you'd want [aether-integration]" use case).
- **Date:** 2026-05-25

### D15: Visual graph via cytoscape with built-in `cose` layout (no plugin packages)

- **What:** `/graph` page renders the full entity-edge graph via cytoscape with the built-in `cose` force-directed layout. No `cose-bilkent`, no `react-cytoscapejs` wrapper — direct cytoscape + a thin React effect.
- **Why:** The portfolio brain is ~100-500 nodes; cytoscape's default `cose` settles in <2s on a cold render. Pulling in `cose-bilkent` would add a 200KB+ plugin for marginal layout-quality improvement at this scale. `react-cytoscapejs` adds a wrapper without enough value to justify the dep.
- **Revisit when:** Graph exceeds ~1000 nodes — at that scale we'd want a WebGL engine (Sigma) instead.
- **Date:** 2026-05-25

### D16: Deployed HTTP MCP as a stateless Next.js Route Handler with in-memory transport

- **What:** `/api/mcp` is a Next.js Route Handler that wraps the MCP SDK's `McpServer` using a custom `CapturingTransport` (in-memory message pump). Stateless across requests — each POST is a full JSON-RPC message, response is the matching reply. Bearer-token auth via `ROUSHI_MCP_HTTP_TOKEN`.
- **Why:** The SDK's `StreamableHTTPServerTransport` requires Node `IncomingMessage`/`ServerResponse` types, which don't compose cleanly with Next.js Route Handlers. Building an in-memory transport sidesteps that adapter complexity while reusing the same `registerAllTools(mcp)` registry as the stdio server (single source of truth for tool definitions). Stateless across requests is fine for tool calls; the trade-off is each client re-sends `initialize`, which is idempotent.
- **Alternatives:** Adapt Next.js Request to fake `IncomingMessage` (works but fragile), manually re-implement JSON-RPC dispatch from scratch (duplicates the SDK's tool routing), keep HTTP only as standalone server (loses Vercel deployment + edge proximity).
- **Date:** 2026-05-25

### D17: PreToolUse hooks for context injection (over always-on rules, over post-hoc review)

- **What:** Both the security checklist and the Roushi-as-advisor fire as PreToolUse hooks on `Edit|Write`. Always-on rules (loaded at session start) carry baseline + portfolio principles; PreToolUse adds file-specific context at write time; post-hoc subagents (`/security-review`, `sql-pattern-reviewer`) are the safety net.
- **Why:** Always-on rules pay tokens for context that may not apply to the current file. Post-hoc audits catch bugs after they're written. PreToolUse hooks fire JUST-IN-TIME with file-pattern matching, so the model reads the relevant checklist *before* generating the code. Result: secure/correct code lands on the first try without paying always-on token tax.
- **Alternatives:** Bigger rules loaded at session start (token waste + irrelevant context), pre-commit hooks (too late — code is written, just not committed), no automation (relies on Claude remembering everything).
- **Date:** 2026-05-25

### D18: Per-product shipment-sweep rules, modeled on Kodori's pattern

- **What:** Each product gets its own `<product>-shipment-sweep` rule (e.g. `kodori-shipment-sweep`, `roushi-shipment-sweep`) with that product's actual file paths, dynamic stat counts, and triaged marketing surfaces. The portfolio-wide `portfolio-standard-md-files` rule covers *coverage* (every product has CLAUDE.md + scope + decisions + changelog); per-product rules cover *mechanics* of keeping those synced after every ship.
- **Why:** Each product has different surface area, different marketing pages, different stat counts. A portfolio-wide sweep rule would be too generic to be useful. Per-product rules can name exact file paths and exact grep commands. The SessionStart hook auto-syncs the right rule into each workspace.
- **Alternatives:** Single portfolio rule (too generic), no rule (relies on memory), a stale-docs cron scan (catches drift after the fact, doesn't prevent it).
- **Date:** 2026-05-25
- **Superseded in part by D19** — the *triage + dynamic stats* half of a per-product sweep rule stays per-product; the *surface enumeration* half moves to CLAUDE.md.

### D20: Pattern system as portfolio-wide automation primitive

- **What:** A new `Pattern` type at `src/patterns/_types.ts` with `detect(project)` + `apply(project, params)` methods. Each pattern is a standalone TypeScript file in `src/patterns/<slug>.ts` exporting a `pattern: Pattern` const. The CLI surface (`pnpm roushi pattern list / detect [--portfolio] / apply <slug>`) consumes them. A `Project` helper (`src/patterns/_project.ts`) wraps file/grep/env/git/package operations with safety rules: auto-commit only on clean repos (otherwise stage + warn), validated input regexes (env keys, package names), `cross-spawn` for safe Windows `.cmd` shim execution, and refuses to stage paths containing `..` or absolute paths.
- **Why:** Sam asked for the Vercel-Marketplace experience for things like Google Analytics. GA isn't a Marketplace integration (no infrastructure to provision), but the same "snippet + env var + commit" automation is exactly the kind of thing that should be codified once and applied across the portfolio. The pattern system makes that primitive — every future "everyone needs this, everyone forgets" change (Aether widget, Sentry integration, KumoKodo footer compliance, etc.) becomes a 30-minute pattern file.
- **Alternatives:** Bash scripts per integration (no detection, no type safety, no portfolio matrix), Vercel Marketplace integrations only (limited to vendors that build them), client-side configurator in the web UI (worse UX than CLI for developers).
- **Date:** 2026-05-28

### D19: Canonical surface taxonomy + per-project surface declaration in CLAUDE.md

- **What:** `portfolio-shipment-sweep` (rule, `applies_to_type: product`) defines the canonical vocabulary of marketing-surface categories — `homepage`, `pricing`, `features`, `help`, `verticals`, `compares`, `security`, `case-studies`, `about`, `api-docs`, `changelog-public`, `blog`, `umbrella-card`, `umbrella-case-study` for SaaS products; `wordpress-listing` / `plugin-header` / `github-readme` for plugins; `client-deliverable` / `client-portal` / `status-report` / `sow` for client work; `pitch-deck` / `investor-readme` / `pitch-landing` for fundraising. Each project's CLAUDE.md gets a `## Marketing surfaces` block declaring which categories apply with their actual paths. Per-product sweep rules (D18) reference this block instead of re-enumerating surfaces.
- **Why:** D18 worked but had two problems: (a) the surface list lived in the rule, duplicating across products that had similar shapes, and (b) for products without their own sweep rule yet, the agent had no list to walk. Sam observed (2026-05-27): *"Not all projects have the same files, especially the marketing and help pages."* The taxonomy + per-project declaration handles SiteBeacon (~2 surfaces) and Kodori (~18 surfaces) under the same vocabulary without diluting either. The CLAUDE.md location ensures the agent sees the declaration at session start, not buried in a rule file.
- **Alternatives:** Keep the full surface list in each per-product rule (current D18 — works but encourages copy-paste drift), put the declaration in a separate `roushi-project.md` file (more files for the agent to load), put it in the product entity's frontmatter in the brain (cleanest but requires schema work). CLAUDE.md is the load-bearing point; declarations belong there.
- **Date:** 2026-05-27

---

## Open tech decisions

- [ ] **Monorepo or single repo?** Turborepo with `apps/web`, `apps/mcp-server`, `packages/cli`, `packages/sdk`, `packages/shared` — clean separation, but more setup. Or single Next.js app with CLI as a subdirectory — simpler, less ceremony.
- [ ] **Embeddings provider** — start with OpenAI text-embedding-3-small (cheapest, good quality). Revisit if Voyage/Cohere added to Vercel AI Gateway.
- [ ] **CLI runtime** — Bun (faster startup) or Node (broader compatibility). Lean Bun.
- [ ] **Web UI authentication flow** — magic links (Resend) or OAuth (GitHub)? Lean GitHub OAuth for v0.5 since every KumoKodo project already uses Auth.js.
- [ ] **Markdown directory structure** — flat (`/decisions/d1-trusted-publishing.md`) or nested (`/decisions/auth/d1-trusted-publishing.md`)? Lean flat with frontmatter-driven categorization.
