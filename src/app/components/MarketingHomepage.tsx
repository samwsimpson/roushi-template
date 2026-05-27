// Roushi marketing homepage — Tier 3 of the marketing site.
//
// Design direction (per the frontend-design skill, audited 2026-05-26):
//   - Tone: minimal/technical/terminal-inspired (developer tool / infra)
//   - Differentiator: scholar's-scroll references (老師 mark, vermilion
//     seal stamps, vertical reading) executed with developer precision
//   - Color: zinc/emerald base + ONE vermilion seal accent per section
//   - Typography: Fraunces display, Geist body, JetBrains Mono code
//   - Spatial: vertical scroll with mono chapter numbers in the left
//     gutter; no boxed sections, only thin horizontal rules between
//     "chapters"
//
// One file kept intentionally — under 600 lines, easy to read end-to-end,
// no premature componentization. Subsections lifted into helpers only
// where reuse pays off (Chapter, MonoCode).

import Link from "next/link";
import type { ReactNode } from "react";
import { BetaRequestForm } from "./BetaRequestForm";
import { MasterMark } from "./MasterMark";
import { SealStamp } from "./SealStamp";

export function MarketingHomepage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        {/* ─── 01 · Hero ──────────────────────────────────────────────── */}
        <section className="text-center">
          <MasterMark variant="hero" />

          <h1
            className="mt-10 font-serif italic text-zinc-50 char-rise"
            style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)", lineHeight: 1.05 }}
          >
            {"Ask the master.".split("").map((c, i) => (
              <span
                key={i}
                style={{ ["--i" as never]: i + 4 } as React.CSSProperties}
              >
                {c === " " ? " " : c}
              </span>
            ))}
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-balance text-lg leading-relaxed text-zinc-300 sm:text-xl">
            The brain that runs while you build. Roushi indexes every decision, pattern, and lesson
            across your portfolio — and feeds it back to Claude Code, Cursor, and your agents
            <em className="font-serif text-zinc-100"> before</em> you write each next file.
          </p>

          <div className="mt-12 flex flex-col items-center gap-4">
            <SealStamp href="#request-beta">Request beta access</SealStamp>
            <span className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-500">
              private beta · single-tenant · invited operators
            </span>
          </div>
        </section>

        <ChapterRule />

        {/* ─── 02 · The seven-second pitch ────────────────────────────── */}
        <Chapter num="02" eyebrow="What it does, in seven seconds">
          <p className="text-zinc-300">
            You edit <MonoInline>app/api/route.ts</MonoInline> in Claude Code. Before the file
            lands, Roushi quietly tells the model what you decided about Auth.js v5 last quarter,
            which Drizzle gotcha bit you in March, and which security rules apply to API routes
            in this product. The code lands secure and consistent on the first try.
          </p>
          <MonoCode>
            <span className="text-zinc-500"># PreToolUse hook fires before Claude writes the file</span>
            {"\n"}
            <span className="text-emerald-400">📚 Roushi context</span>{" "}
            <span className="text-zinc-400">·</span>{" "}
            <strong className="text-zinc-100">Kodokyo</strong>{" "}
            <span className="text-zinc-400">·</span>{" "}
            <span className="text-zinc-300">Next.js API route</span>
            {"\n\n"}
            <span className="text-zinc-400">Relevant from the brain:</span>
            {"\n"}
            <span className="text-zinc-500">- [lesson]</span>{" "}
            <span className="text-zinc-200">Drizzle ANY(jsArray) spreads to N params</span>
            {"\n"}
            <span className="text-zinc-500">- [decision]</span>{" "}
            <span className="text-zinc-200">Auth.js v5 JWT, not DB sessions (D9)</span>
            {"\n"}
            <span className="text-zinc-500">- [rule]</span>{" "}
            <span className="text-zinc-200">portfolio-security-baseline (always-on)</span>
          </MonoCode>
        </Chapter>

        <ChapterRule />

        {/* ─── 03 · Three tablets — Ask, Track, Trace ─────────────────── */}
        <Chapter num="03" eyebrow="The three things Roushi is good at">
          <div className="grid gap-10 sm:grid-cols-3">
            <Tablet
              heading="Ask"
              body="Grounded synthesis with citations. The brain returns an answer, the entities it stood on, and the gaps it can't fill yet."
              code={`> "what gotchas have we hit with Inngest?"\n\n[kodori-inngest-step-output-cap]\n[kodori-inngest-sync-gotcha]\nGaps: rate-limit retries.`}
            />
            <Tablet
              heading="Track"
              body="Durable goals across sessions and machines. Cron-driven maintenance keeps the brain honest — stale, duplicate, and contradictory entries surface as system tasks."
              code={`/goals\n\n→ active: 3\n→ blocked: 1\n→ cron-found: 2\n  · 12 stale entities\n  · 1 contradiction (rule)`}
            />
            <Tablet
              heading="Trace"
              body="A typed graph of every decision, pattern, lesson, and product. Multi-hop traversal answers questions grep never can."
              code={`graph-query roushi --hops 2\n\nroushi --uses→ pgvector\n       --uses→ Drizzle\n       --led_to→ D11 (embeddings)\n       --depends_on→ feedback...`}
            />
          </div>
        </Chapter>

        <ChapterRule />

        {/* ─── 04 · Live demonstration ────────────────────────────────── */}
        <Chapter num="04" eyebrow="What Claude Code sees, with Roushi running">
          <p className="text-zinc-300">
            Pre-tool-use hooks fire before every Edit/Write in any KumoKodo workspace. The hook
            classifies the file by path, finds the relevant lessons/decisions/patterns/rules in
            the brain, and injects them as additional context. The model reads them
            <em className="font-serif text-zinc-300"> before</em> generating the code.
          </p>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                You ask the model
              </h4>
              <MonoCode>
                <span className="text-zinc-300">
                  Add a Server Action at <span className="text-yellow-400">src/app/actions/touch-entity.ts</span> that takes a slug and bumps last_validated_at.
                </span>
              </MonoCode>
            </div>
            <div>
              <h4 className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                Roushi adds (before the model responds)
              </h4>
              <MonoCode>
                <span className="text-emerald-400">📚 Roushi context</span>{" "}
                <span className="text-zinc-500">· Server Action</span>
                {"\n\n"}
                <span className="text-zinc-300">Relevant from the brain:</span>
                {"\n"}
                <span className="text-zinc-500">- [rule]</span>{" "}
                portfolio-security-baseline
                {"\n"}
                <span className="text-zinc-500">- [lesson]</span>{" "}
                Server Action redirect() in try/catch crashes
                {"\n"}
                <span className="text-zinc-500">- [pattern]</span>{" "}
                formData → Zod validation → return state
              </MonoCode>
            </div>
          </div>

          <p className="mt-8 text-base text-zinc-400">
            The code that lands already has the auth check, the Zod schema, and the safe-return
            pattern — because the model read what the team had decided before it wrote a line.
          </p>
        </Chapter>

        <ChapterRule />

        {/* ─── 05 · Features (12 pillars as numbered vertical list) ───── */}
        <Chapter num="05" eyebrow="Twelve things Roushi does, in plain words">
          <ol className="space-y-7">
            <Pillar n="01" title="Ask, with citations">
              Synthesized answers grounded in the brain. Every claim links to the entity it
              came from.
            </Pillar>
            <Pillar n="02" title="Hybrid search">
              Vector + keyword fused via Reciprocal Rank Fusion. Optional LLM rerank pass.
            </Pillar>
            <Pillar n="03" title="Typed graph">
              Twelve entity types, ten relations. Multi-hop traversal via recursive CTE.
            </Pillar>
            <Pillar n="04" title="Visual graph">
              Force-directed view of the whole portfolio. Click-to-click shortest path.
            </Pillar>
            <Pillar n="05" title="PreToolUse advisor">
              Hook injects relevant context into Claude Code before every Edit/Write.
            </Pillar>
            <Pillar n="06" title="Security checklist hook">
              File-pattern-aware security guidance fires before code lands.
            </Pillar>
            <Pillar n="07" title="Auto-synced rules">
              Brain rules write into every workspace's Claude memory dir on session start.
            </Pillar>
            <Pillar n="08" title="Maintenance crons">
              Decay, dedupe, audit-edges, contradictions — daily/weekly/monthly. Auto-closes
              when findings clear.
            </Pillar>
            <Pillar n="09" title="CLI + stdio MCP">
              Thirty-five tools. Local stdio for low latency; HTTPS for remote agents.
            </Pillar>
            <Pillar n="10" title="Skill index + sync">
              Claude Code skills stay on disk for native /invocation; the brain indexes them
              for cross-reference + team sharing.
            </Pillar>
            <Pillar n="11" title="Goal lifecycle">
              Multi-week objectives across machines. Status buttons, system goals from crons.
            </Pillar>
            <Pillar n="12" title="Markdown-first">
              Content in git is canonical. Postgres is the index. Survives DB loss.
            </Pillar>
          </ol>
          <div className="mt-10 text-sm">
            <Link href="/features" className="seal-underline text-zinc-300">
              Read the full feature chapters →
            </Link>
          </div>
        </Chapter>

        <ChapterRule />

        {/* ─── 06 · How it works (compact diagram preview) ────────────── */}
        <Chapter num="06" eyebrow="How it works, at six layers">
          <div className="font-mono text-sm leading-loose text-zinc-300">
            <div>
              <span className="text-zinc-600">↳ </span>
              <span className="text-emerald-400">EVENTS</span> — cron schedules; GitHub webhooks (planned)
            </div>
            <div>
              <span className="text-zinc-600">↳ </span>
              <span className="text-emerald-400">AGENTS</span> — Claude Code via stdio + HTTPS MCP; PreToolUse hooks
            </div>
            <div>
              <span className="text-zinc-600">↳ </span>
              <span className="text-emerald-400">SKILLS</span> — Claude Code disk + brain index
            </div>
            <div>
              <span className="text-zinc-600">↳ </span>
              <span className="text-emerald-400">RULES</span> — brain → SessionStart sync into every workspace
            </div>
            <div>
              <span className="text-zinc-600">↳ </span>
              <span className="text-emerald-400">BRAIN</span> — 12 entity types, 10 edge relations, hybrid search
            </div>
            <div>
              <span className="text-zinc-600">↳ </span>
              <span className="text-emerald-400">AUTO-DETECTOR</span> — 4 cron scans; maintenance_runs log
            </div>
          </div>
          <div className="mt-8 text-sm">
            <Link href="/how-it-works" className="seal-underline text-zinc-300">
              Read each layer in detail →
            </Link>
          </div>
        </Chapter>

        <ChapterRule />

        {/* ─── 07 · Use cases (three operators) ───────────────────────── */}
        <Chapter num="07" eyebrow="Who Roushi is for">
          <div className="grid gap-10 md:grid-cols-3">
            <UseCase
              heading="If you run a portfolio"
              body="Five or more products in your portfolio. Decisions in product A are forgotten when you work on product B. Lessons from one painful 3am don't carry to the next. Roushi is what your portfolio brain should have been from product number two."
              quote="The marketing site IS Roushi practising what it preaches."
            />
            <UseCase
              heading="If you're a solo founder"
              body="The business context lives in your head. Slack is where decisions go to die. Roushi captures the durable bits — the why, the lessons, the trade-offs — and re-surfaces them in the agent you're already pair-programming with."
              quote="Notion is a passive store. Roushi acts."
            />
            <UseCase
              heading="If you ship code with AI agents"
              body="Claude Code, Cursor, Windsurf — every session starts cold. Roushi is the persistent layer that remembers what the last session decided, surfaces it before you ask, and feeds it to whichever agent you're using next."
              quote="Memory across agents and sessions."
            />
          </div>
          <div className="mt-10 text-sm">
            <Link href="/use-cases" className="seal-underline text-zinc-300">
              Read the use-case chapters →
            </Link>
          </div>
        </Chapter>

        <ChapterRule />

        {/* ─── 08 · Built on (the stack) ──────────────────────────────── */}
        <Chapter num="08" eyebrow="Built on">
          <p className="font-mono text-sm leading-relaxed text-zinc-300">
            Postgres + pgvector · Drizzle ORM · Next.js 16 · MCP · Auth.js v5 · OpenAI embeddings ·
            Vercel Fluid Compute · Tailwind 4 · TypeScript strict · Biome
          </p>
          <p className="mt-3 text-base text-zinc-400">
            No vendor logos. The stack is the boring kind — chosen for portability and longevity,
            not novelty.
          </p>
        </Chapter>

        <ChapterRule />

        {/* ─── 09 · From the operator ─────────────────────────────────── */}
        <Chapter num="09" eyebrow="From the operators">
          <p className="text-zinc-300">
            We built Roushi for the KumoKodo portfolio first. With twenty-plus products under
            one roof, the cost of forgetting was compounding faster than we could mitigate it
            manually. The brain is what we wished we&apos;d had at product number two; private
            beta is open to other portfolio operators who want the same.
          </p>
          <p className="mt-6 flex items-baseline gap-3 text-zinc-300">
            <span>— Sam, KumoKodo</span>
            <SealStamp variant="static" rotate={4}>
              Roushi · 老師
            </SealStamp>
          </p>
        </Chapter>

        <ChapterRule />

        {/* ─── 10 · Request beta access ───────────────────────────────── */}
        <Chapter num="10" eyebrow="Request beta access" id="request-beta">
          <p className="text-zinc-300">
            Roushi is single-tenant during private beta. If you operate a portfolio (or have
            agents that need a brain), get in touch. I read every request personally.
          </p>
          <BetaRequestForm />
        </Chapter>
      </main>
    </>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

function Chapter({
  eyebrow,
  children,
  id,
}: {
  // `num` kept in callers for now but not rendered — section numbers
  // were removed at Sam's request; the eyebrow alone separates chapters.
  num?: string;
  eyebrow: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 py-16 sm:py-20">
      <h2 className="mb-8 font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
        {eyebrow}
      </h2>
      <div className="text-lg leading-relaxed text-zinc-200">{children}</div>
    </section>
  );
}

function ChapterRule() {
  return <hr className="border-0 border-t border-zinc-900" />;
}

function MonoInline({ children }: { children: ReactNode }) {
  return (
    <code className="font-mono text-[0.95em] text-yellow-300/90">{children}</code>
  );
}

function MonoCode({ children }: { children: ReactNode }) {
  return (
    <pre className="mt-5 overflow-x-auto whitespace-pre-wrap border-l-2 border-zinc-800 bg-zinc-950/50 py-4 pl-4 font-mono text-sm leading-relaxed text-zinc-200">
      {children}
    </pre>
  );
}

function Tablet({
  heading,
  body,
  code,
}: {
  heading: string;
  body: string;
  code: string;
}) {
  return (
    <div className="relative">
      <h3 className="font-serif italic text-2xl text-zinc-50">{heading}</h3>
      <p className="mt-3 text-base leading-relaxed text-zinc-300">{body}</p>
      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-snug text-zinc-400">
        {code}
      </pre>
    </div>
  );
}

function Pillar({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-4 sm:grid-cols-[3rem_1fr]">
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">{n}</span>
      <div>
        <h3 className="font-serif text-xl text-zinc-50">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-zinc-300">{children}</p>
      </div>
    </li>
  );
}

function UseCase({
  heading,
  body,
  quote,
}: {
  heading: string;
  body: string;
  quote: string;
}) {
  return (
    <div>
      <h3 className="font-serif italic text-xl text-zinc-50">{heading}</h3>
      <p className="mt-3 text-base leading-relaxed text-zinc-300">{body}</p>
      <p className="mt-4 border-l border-zinc-800 pl-3 font-serif text-base italic text-zinc-400">
        “{quote}”
      </p>
    </div>
  );
}
