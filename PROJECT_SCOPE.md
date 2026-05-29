# Roushi — Project Scope

**Version:** 0.13.0
**Date initiated:** 2026-05-23
**Last updated:** 2026-05-28
**Repo path:** `c:\Users\samws\Roushi`
**Brand:** Roushi (老師 — "old master / sage")
**Tagline:** *Ask the master.*
**Domain:** `roushi.ai` (deployed)

---

## Mission

Build the self-wiring knowledge layer + autonomous coordination plane for the KumoKodo portfolio. A devoted, always-on sage that holds every decision, pattern, lesson, and goal across all KumoKodo products — and gets smarter every time it's used.

First customer: KumoKodo itself (10+ products, solo operator, high cross-product context needs — canonical ICP).
Eventual product: SaaS for portfolio operators, founders managing multiple products, agencies, and any team that wants a brain that knows everything they've built.

---

## Character (the brand archetype)

Roushi is the wise old master. Not a butler that fetches things. Not a chatbot. Not a search engine. A consulted sage with decades of accumulated wisdom about how *you* build, decide, and operate.

You go to Roushi and ask: *"have I dealt with this before? what did we decide? what's the pattern? what did we get wrong last time?"* — and Roushi has the answer, with the reasoning, the lessons, and the cross-references to everywhere it applies.

Distinct from other AI tooling because every other product positions as "assistant / butler / copilot." Roushi is the **oracle**.

---

## The problem Roushi solves

Solo founders + portfolio operators carry the entire context of their business in their head. As the portfolio grows, context fragments:

- Decisions made in product A are forgotten when working on product B
- Lessons from a painful incident in repo X don't surface when the same trap appears in repo Y
- Cross-product patterns (auth, audit, billing) get re-derived from scratch each time
- Marketing, help docs, changelogs drift out of sync with what shipped
- Each new product starts cold instead of inheriting the accumulated wisdom of the previous ten
- AI agents (Claude Code, Cursor, Windsurf, custom) cold-start every session with no memory of prior work

Existing tools (Notion, Obsidian, Logseq, even GBrain) are passive knowledge stores. They wait to be queried. They don't act, don't coordinate agents, don't trigger on events, don't auto-promote hot patterns to skills.

---

## The solution — 6-layer architecture (as of v0.12.0)

```
┌────────────────────────────────────────────────────────┐
│ EVENT TRIGGERS                                          │
│   Cron (4 kinds: decay, dedupe, audit-edges,            │
│   contradictions). GitHub webhooks deferred to v1.5.    │
└────────────────────────────────────────────────────────┘
                       │ fires
                       ▼
┌────────────────────────────────────────────────────────┐
│ AGENTS (parallel, multi-surface)                        │
│   - Claude Code via stdio MCP (local) + HTTP MCP        │
│     (remote at https://roushi.ai/api/mcp)               │
│   - PreToolUse hooks: security checklist + Roushi-      │
│     as-advisor (file-aware brain context injection)     │
│   - Per-agent scratchpad partition                      │
└────────────────────────────────────────────────────────┘
                       ▲
                       │ reads/writes
                       ▼
┌────────────────────────────────────────────────────────┐
│ SKILLS (Claude Code skill files, brain-indexed)         │
│   - Skills stay on disk for native /<skill> invocation  │
│   - Roushi indexes each as a `skill` entity for cross-  │
│     reference + recommendation via think/search         │
└────────────────────────────────────────────────────────┘
                       ▲
┌────────────────────────────────────────────────────────┐
│ RULES (durable instructions auto-synced to workspaces)  │
│   - Rules are first-class `rule` entities               │
│   - SessionStart hook syncs applicable rules into each  │
│     KumoKodo workspace's Claude memory dir              │
│   - Scope: applies_to_slug | applies_to_type | portfolio│
│   - Canonical marketing-surface taxonomy lives in       │
│     `portfolio-shipment-sweep`; each project declares   │
│     its surfaces in CLAUDE.md `## Marketing surfaces`   │
└────────────────────────────────────────────────────────┘
                       ▲
┌────────────────────────────────────────────────────────┐
│ BRAIN — partitions:                                     │
│   • LONG-TERM: 12 entity types (product, tech, vendor,  │
│     decision, pattern, incident, lesson, goal, person,  │
│     roadmap_item, rule, skill) + 10 edge relations      │
│   • GOALS: durable objectives with lifecycle UI         │
│   • SCRATCHPAD: ephemeral agent working memory          │
│   • MAINTENANCE_RUNS: log of every cron invocation      │
└────────────────────────────────────────────────────────┘
                       ▲
┌────────────────────────────────────────────────────────┐
│ AUTO-DETECTOR + DECAY (cron-driven self-maintenance)    │
│   - Decay scan (daily 3am UTC): flags entities          │
│     unvalidated > 90d                                   │
│   - Audit-edges (Sun 4am UTC): flags wrong relations    │
│   - Dedupe (1st 5am UTC): near-duplicate slugs          │
│   - Contradictions (Sun 6am UTC): pgvector close-pair   │
│     search + LLM judge over rules/decisions/lessons     │
│   - Each scan posts findings as a [system] goal         │
│     and auto-closes when findings clear                 │
└────────────────────────────────────────────────────────┘
```

---

## Core features

### Shipped (v0 → v0.13.0)

**Brain core:**
- Markdown files in `content/` as source of truth, git-versioned
- Neon Postgres + pgvector storage with hybrid search (HNSW + tsvector + RRF fusion, k=60)
- LLM-based reranker (gpt-4o-mini, opt-in)
- Two-phase wikilink + typed-link extraction (zero per-write LLM cost) with LLM-based sub-entity extraction during `add-project`
- 12 entity types, 10 edge relations
- Contradiction detection (pgvector close-pair search + LLM judge over rules/decisions/lessons)
- 8-query eval framework for retrieval-quality regression

**Surfaces:**
- CLI (`pnpm roushi …`) — search, think, graph-query, get, list, add, ingest, scan, add-project, stats, goal, scratchpad, optimize, playbook, rules, skill, eval, portfolio, memory
- MCP server — stdio (local, `pnpm mcp`) AND HTTP (deployed at `https://roushi.ai/api/mcp`, Bearer-token auth)
- Web UI: Ask (think-powered homepage with citations), Browse, Graph (force-directed cytoscape view), Goals (full lifecycle UI + maintenance activity), Rules, Skills, Optimize (audit/dedupe/decay/contradictions actions), Playbooks, Examples, Help, Changelog

**Auth + identity:**
- Auth.js v5 with GitHub OAuth (JWT sessions)
- Single-user gating via `AUTH_ALLOWED_EMAILS` env var
- Schema-ready for multi-tenant (deferred to v2)

**Autonomous loop:**
- Rules — first-class `rule` entities with applies_to scope (slug/type/portfolio)
- SessionStart hook syncs applicable rules into each KumoKodo workspace's Claude memory dir
- **Portfolio-wide shipment-sweep coverage (v0.12.0)** — `portfolio-shipment-sweep` meta rule holds the canonical surface taxonomy; per-product `<slug>-shipment-sweep` rules hold triage + dynamic stats + stale-phrase greps; each project's CLAUDE.md `## Marketing surfaces` block declares which surfaces apply with actual paths. Discipline rolled out to all 19 KumoKodo + client-work + experimental + WordPress-plugin projects.
- 4 cron-driven maintenance scans (decay daily, audit/contradictions Sunday, dedupe monthly) with `maintenance_runs` activity log

**Pattern system (v0.13.0):**
- `pnpm roushi pattern list / detect [--portfolio] / apply <slug>` — typed, detectable, applicable transforms with auto-commit safety
- Three patterns shipped: `kumokodo-footer`, `vercel-analytics`, `google-analytics` (full GA Admin API automation — creates property + data stream + wires layout + sets Vercel env vars + commits)
- `/patterns` web UI showing portfolio-wide compliance matrix
- `scripts/sync-template.ts` — keeps public `roushi-template` in sync with private Roushi so deploy-button users get current code

**Claude Code integrations (portfolio-wide):**
- PreToolUse security hook — file-pattern-aware security checklist before Edit/Write
- PreToolUse Roushi-as-advisor hook — surfaces relevant brain context for the file being edited
- PostToolUse hook — Biome format-on-write + schema/content nudges
- `release-bump` skill — version-across-three-files lockstep update
- `sql-pattern-reviewer` subagent — focused review for the documented Drizzle `ANY(jsArray)` footgun

### Pending (post-v0.10.0)

**v0.14.x (near-term polish):**
- Per-file cache layer for the Roushi-as-advisor hook (30s TTL) to cut latency on repeat edits
- Hybrid-search fallback for file types the deterministic classifier doesn't match
- Push pattern detection results from CLI → brain as `detection_run` entities so the `/patterns` web UI works on the deployed site (currently only works locally because Vercel's filesystem can't reach `source_path` entries)
- Promote a per-product `<slug>-shipment-sweep` rule for each product as that product's surface area stabilizes (currently only Kodori + Roushi have one)
- More patterns: `aether-widget`, `kumokodo-vercel-deploy`, `posthog`, `sentry`, etc.

**v0.12+:**
- Streaming responses on the HTTP MCP route for long-running tools (think, contradictions scan)
- Per-tool rate limiting via Vercel Routing Middleware
- Graph: path highlighting between two entities (click → click → BFS); per-relation subgraph filtering; saved layouts

**v1 — GitHub webhooks + autonomy:**
- GitHub webhook integration so commits/PRs auto-update entities + post findings as goals
- Vercel deploy hooks as event triggers
- Auto-detector: cluster lessons + scratchpads → propose new skills (defers to `/skill-creator` for authoring)
- Per-product skill discovery (walking `<workspace>/.claude/skills/` alongside `~/.claude/skills/`)

**v1.5 — Compounding automations:**
- **A. Coordination cascade on ship** — git push triggers drafts of CHANGELOG, /help, marketing, social posts
- **B. Pattern transfer to new projects** — `roushi new <product>` provisions repo + DB + Vercel project + scaffolds with stack defaults
- **C. Auto-keep-docs-fresh** — beyond the current rule-based reminders, propose actual doc PRs by diffing code vs. docs

**v2 — SaaS-ready:**
- Full multi-tenancy with team workspaces + RLS
- Stripe billing
- Pricing tiers (see TECH_STACK pricing thesis)
- Marketing site (kumokodo.ai already covers this)
- Onboarding flow for non-KumoKodo customers
- API for third-party integrations

**v2+ — Compounding features once we have data:**
- Voice capture (Deepgram) → auto-routed brain entries
- Daily "what's worth your time" briefing across all products
- Brand-voice enforcement across product copy
- Cross-product drift detection (CVE alerts, version skew, dead-link checks)
- Decision graveyard / pre-mortem assistant

---

## Non-goals

- Not a Notion / Obsidian replacement (those are personal note-taking)
- Not a code search tool (use ripgrep for code)
- Not a project management tool (Kodokyo handles that operationally)
- Not a CI/CD replacement (Vercel handles deployments)
- Not a duplicate of Kodokyo's MCP (Kodokyo holds live operational state; Roushi holds durable insights)
- v0 will not have a polished web UI — CLI + MCP first

---

## Target users (when SaaS)

| Persona | Pain point Roushi solves |
|---|---|
| **Portfolio operators** (KumoKodo-style founders running 5-15 products) | Cross-product context fragmentation |
| **Solo founders + small teams** | Knowledge dies in Slack/email/the founder's head |
| **Agencies** (digital, design, dev shops) | Per-client knowledge silos; lessons don't compound |
| **AI-first builders** | Need persistent memory across Claude / Cursor / agent sessions |
| **Engineering teams 5-50** | Architectural decisions get re-litigated every quarter |

Initial focus: portfolio operators (the KumoKodo profile). Other personas follow once v2 ships.

---

## Pricing thesis (early — to be validated)

- **Free** — single user, single workspace, 10K entries, basic hybrid search
- **Pro** ($29/mo) — single user, unlimited entries, MCP access, event triggers, automations A/B/C
- **Team** ($99/mo + $19/seat) — multi-user, shared workspaces, agent coordination, SSO
- **Enterprise** (custom) — self-hosted option, custom integrations, SLA

KumoKodo internal use is free-forever (founder discount, plus dogfood priority).

---

## Success metrics

### Phase 0 (v0 — KumoKodo internal only, weeks 1-4) — **DONE**

- ✓ Roushi installed and queryable via MCP from every KumoKodo repo (stdio + HTTP)
- ✓ Portfolio products ingested (CLAUDE.md, TECH_STACK, CHANGELOG, scope docs via `add-project`)
- ✓ 100+ canonical entities in the registry (across 12 types)
- ✓ Demonstrable cross-product query that grep can't answer (think/search with citations)
- ✓ Claude uses Roushi as the first action on cross-product tasks via the PreToolUse advisor hook

### Phase 1 (v0.5 — v1, months 2-4) — **PARTIALLY DONE**

- ✓ Cross-machine sync working (deployed to Vercel with Neon-hosted brain; HTTP MCP for remote clients)
- ✓ Auto-decay catches stale entries (daily cron, posts `[system]` goals at threshold)
- ◐ Roushi survives manual-hygiene-free — TBD over the coming month; the `maintenance_runs` table and the per-product shipment-sweep rules are the mechanism
- ☐ Event-triggered autonomous workflow (GitHub webhook) — deferred to v1

### Phase 2 (v1.5 — v2, months 5-8) — **NOT STARTED**

- Automation A live: shipping a Kodokyo feature produces draft CHANGELOG + help + marketing + social, awaiting review
- Automation B live: `roushi new <product>` stands up product #11 with full portfolio coherence
- Automation C live: weekly digest of proposed doc updates per repo
- Sam's Claude Code interactive usage drops noticeably (background work shifts to async)

### Phase 3 (v2+, month 9+) — **NOT STARTED**

- First external alpha customer onboarded
- Public beta launch
- 100 paying users by end of year 1

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Becomes noise (stale entries pile up, trust collapses) | Auto-decay flags entries unvalidated > 90d; quarterly stale-review job |
| Wikilink slug drift (`[[drizzle]]` vs `[[Drizzle ORM]]`) | Canonical `entities.md`; writes that reference unknown slugs are flagged |
| Duplicates with operational systems (Kodokyo MCP, GSC, Drive) | Strict scope: Roushi holds durable insights only, not live state |
| Hygiene burden falls on Sam | Auto-detector runs in background; "review queue" surfaces things, doesn't require active maintenance |
| Build cost exceeds payoff | v0 is intentionally narrow (4-5 days); kill switch if value isn't obvious after KumoKodo internal use |
| Multi-machine sync gets messy | Hosted Neon Postgres from day 1 (not PGLite local); markdown files in git as source of truth |

---

## Why now

1. Sam's portfolio just crossed 10 products. Context-juggling is now the bottleneck on velocity.
2. GBrain (Apr 2026) proved the architectural primitives work and got open-source validation.
3. Vercel platform now has every component we need natively (Fluid Compute, AI Gateway, Workflow, Neon Marketplace).
4. Claude 4.7 + Haiku 4.5 make cheap-classification + deep-reasoning brain operations economical.
5. MCP is now the standard for LLM↔tool integration — Roushi as MCP server reaches every future agent for free.

---

## Open questions (to resolve before v0 build starts)

- [x] ~~Final repo location~~ — renamed to `c:\Users\samws\Roushi` on 2026-05-23 (matches portfolio convention)
- [ ] Single git repo, or Turborepo monorepo (CLI + web + MCP server as separate packages)?
- [x] ~~Domain purchase timing~~ — `roushi.ai` purchased 2026-05-23
- [ ] Initial entity registry — Sam drafts, or auto-extract from existing projects-registry.md?
