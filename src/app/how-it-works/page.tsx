import Link from "next/link";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "How it works",
  description:
    "Six layers: events, agents, skills, rules, brain, auto-detector. Roushi explained.",
};

const LAYERS = [
  {
    n: "01",
    label: "Events",
    body: "Schedules, hooks, webhooks, and manual triggers. Today: four maintenance crons (decay, audit-edges, dedupe, contradictions) plus the Claude Code SessionStart and PreToolUse hooks. Soon: GitHub webhooks so a push to a content/ file auto-ingests into the brain.",
  },
  {
    n: "02",
    label: "Agents",
    body: "Claude Code sessions across the portfolio. Each gets brain access via local stdio MCP (low latency, ~50ms) or HTTPS MCP (works from anywhere with Bearer auth). The PreToolUse advisor reads the file Claude is about to write, surfaces the relevant brain context, and lets the model read it before generating code. The harness is the runtime; Roushi is the persistent layer.",
  },
  {
    n: "03",
    label: "Skills",
    body: "Claude Code skills live on disk at ~/.claude/skills/<name>/SKILL.md so the harness can invoke them natively (e.g. /frontend-design, /seo-optimizer). Roushi indexes them as `skill` entities so the brain can recommend one in an answer or via the PreToolUse advisor — and so a team can git-track and share them via `pnpm roushi skill push`.",
  },
  {
    n: "04",
    label: "Rules",
    body: "Durable instructions stored as first-class `rule` entities. Each rule has scope: applies_to_slug (one product), applies_to_type (every product), or applies_to: portfolio (everywhere). The SessionStart hook syncs every applicable rule into the workspace's Claude memory dir, so the next session starts with the right context already loaded.",
  },
  {
    n: "05",
    label: "Brain",
    body: "Twelve entity types (product, tech, vendor, decision, pattern, incident, lesson, goal, person, roadmap_item, rule, skill) and ten typed edge relations. Hybrid search (HNSW vector + tsvector keyword + Reciprocal Rank Fusion at k=60). Graph traversal via recursive CTEs. Markdown files in `content/` are canonical; Postgres is the index, not the master.",
  },
  {
    n: "06",
    label: "Auto-detector",
    body: "Four cron-driven scans plus a maintenance_runs log. Decay flags entities unvalidated > 90 days. Audit-edges flags relation mismatches. Dedupe finds near-duplicate slugs. Contradictions runs pgvector close-pair search + an LLM judge over rules/decisions/lessons. Findings post as [system] goals that auto-close when the next scan finds zero. The brain audits itself.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            How it works
          </p>
          <h1 className="mt-4 font-serif italic text-zinc-50" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            Six layers.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-zinc-300">
            Events at the top fire agents. Agents lean on skills, rules, and the brain.
            Auto-detection at the bottom keeps the brain honest. Nothing fancy; everything
            composable.
          </p>
        </header>

        <div className="mt-20 space-y-16">
          {LAYERS.map((l) => (
            <section key={l.n} className="grid grid-cols-[2.5rem_1fr] gap-4 sm:grid-cols-[3rem_1fr]">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                {l.n}
              </span>
              <div>
                <h2 className="font-serif italic text-3xl text-zinc-50">{l.label}</h2>
                <p className="mt-4 text-lg leading-relaxed text-zinc-300">{l.body}</p>
              </div>
            </section>
          ))}
        </div>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            Want the layered diagram + tech-stack detail? It's all in{" "}
            <a
              href="https://github.com/samwsimpson/roushi-template/blob/main/PROJECT_SCOPE.md"
              className="seal-underline text-zinc-300"
              target="_blank"
              rel="noreferrer noopener"
            >
              PROJECT_SCOPE.md
            </a>{" "}
            on the public repo.
          </p>
          <div className="mt-8 flex justify-center">
            <SealStamp href="/#request-beta">Request beta access</SealStamp>
          </div>
          <div className="mt-12 flex justify-center gap-6 text-sm">
            <Link href="/features" className="seal-underline text-zinc-300">
              Features →
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
