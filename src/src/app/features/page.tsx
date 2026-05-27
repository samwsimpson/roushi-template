import Link from "next/link";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "Features",
  description: "Twelve things Roushi does — the long version of each pillar.",
};

const PILLARS = [
  {
    n: "01",
    title: "Ask, with citations",
    body: "Type a question on the homepage (or use `pnpm roushi think` / `mcp__roushi__think`). Hybrid search retrieves the top entities; an LLM grounds an answer on them and emits citation links to each entity. A gap analysis tells you what the brain doesn't know yet — directly useful as a backlog of things to ingest.",
  },
  {
    n: "02",
    title: "Hybrid search (vector + keyword + RRF)",
    body: "Every search runs two queries in parallel: pgvector cosine over embeddings (HNSW-indexed) and Postgres tsvector keyword (GIN-indexed). Reciprocal Rank Fusion (k=60) merges the rankings. Optional LLM rerank pass via gpt-4o-mini adds ~1-2s for noticeably better top-3 quality on long queries.",
  },
  {
    n: "03",
    title: "Typed knowledge graph",
    body: "Twelve entity types (product, tech, vendor, decision, pattern, incident, lesson, goal, person, roadmap_item, rule, skill) connected by ten typed relations (uses, depends_on, hosted_on, defined_by, led_to, applies_to, mentions, blocks, shares_pattern, supersedes). Multi-hop traversal via a recursive CTE with cycle protection.",
  },
  {
    n: "04",
    title: "Visual graph at /graph",
    body: "Force-directed cytoscape view of every entity and edge. Color per type, search highlights matches, legend chips hide types or relations. Click-to-click selects two nodes and Dijkstra highlights the shortest path between them. Useful for spotting unintentional silos in the portfolio knowledge.",
  },
  {
    n: "05",
    title: "PreToolUse Roushi-as-advisor hook",
    body: "Fires before every Edit/Write across every KumoKodo workspace. Detects which product the file belongs to, classifies it by path pattern (API route, Server Action, schema, etc.), and surfaces 2-4 relevant lessons/decisions/patterns/rules from the brain. Cached on disk with a 30-second TTL — repeated edits to the same file return in ~50ms.",
  },
  {
    n: "06",
    title: "Security checklist hook",
    body: "Companion PreToolUse hook that injects a file-pattern-aware security checklist (auth-before-mutation, Zod-validate-body, no body logging, etc.). The code lands secure on the first try rather than catching the same bugs in review.",
  },
  {
    n: "07",
    title: "Auto-synced portfolio rules",
    body: "Rules are first-class brain entities. The SessionStart hook syncs every applicable rule into the workspace's Claude memory dir. Scope: applies_to_slug (product-specific), applies_to_type (every product), or applies_to: portfolio (everywhere). Sam edits a rule once; it propagates everywhere on next session start.",
  },
  {
    n: "08",
    title: "Self-maintenance crons",
    body: "Four scans run on schedule: decay (daily 3am UTC), audit-edges (Sundays 4am UTC), dedupe (1st of month 5am UTC), contradictions (Sundays 6am UTC). Each posts findings as a [system] goal when above threshold and auto-closes the goal when findings clear. Every run logs to maintenance_runs for full visibility.",
  },
  {
    n: "09",
    title: "CLI + MCP (stdio and HTTPS)",
    body: "Thirty-five tools across the brain. Local stdio for low-latency access in any Claude Code session. Deployed HTTPS endpoint at /api/mcp with Bearer-token auth and per-token rate limiting — register from any remote agent with `claude mcp add roushi-remote --url https://roushi.ai/api/mcp`.",
  },
  {
    n: "10",
    title: "Skill index + team sync",
    body: "Roushi indexes every skill in ~/.claude/skills/ as a brain entity. The `think` flow can recommend a skill in an answer; the PreToolUse advisor surfaces relevant skills on the file you're about to edit. `pnpm roushi skill pull/push/sync` mirrors skills into the repo so a team can git-track and share them.",
  },
  {
    n: "11",
    title: "Goal lifecycle UI",
    body: "Multi-week objectives across machines. Add via the web form, CLI, or MCP. Status buttons for done/block/abandon/reopen. System goals auto-created by the maintenance crons; cron-managed goals lock manual edits to prevent fighting the loop. Recent activity panel shows every cron invocation regardless of outcome.",
  },
  {
    n: "12",
    title: "Markdown-first, DB-indexed",
    body: "Content in git is canonical. Neon Postgres + pgvector is the searchable index. Roushi survives DB loss without losing knowledge — markdown files in `content/` are the source of truth. Pure portability: a directory of plain text remains readable when every tool changes.",
  },
];

export default function FeaturesPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            Features
          </p>
          <h1 className="mt-4 font-serif italic text-zinc-50" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            Twelve pillars.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-zinc-300">
            The honest version of each capability. No marketing inflation.
          </p>
        </header>

        <ol className="mt-20 space-y-14">
          {PILLARS.map((p) => (
            <li
              key={p.n}
              className="grid grid-cols-[2.5rem_1fr] gap-4 sm:grid-cols-[3rem_1fr]"
            >
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                {p.n}
              </span>
              <div>
                <h2 className="font-serif text-2xl text-zinc-50">{p.title}</h2>
                <p className="mt-3 text-lg leading-relaxed text-zinc-300">{p.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            Ready to put a brain behind your IDE? Roushi is in private beta.
          </p>
          <div className="mt-8 flex justify-center">
            <SealStamp href="/#request-beta">Request beta access</SealStamp>
          </div>
          <div className="mt-12 flex justify-center gap-6 text-sm">
            <Link href="/how-it-works" className="seal-underline text-zinc-300">
              How it works →
            </Link>
            <Link href="/use-cases" className="seal-underline text-zinc-300">
              Use cases →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
