import Link from "next/link";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "Use cases",
  description: "Roushi for portfolio operators, solo founders, and AI-first builders.",
};

const CASES = [
  {
    n: "01",
    heading: "If you run a portfolio",
    audience: "Operators with five or more products and one to three operators total.",
    body: "Decisions made in product A get forgotten when you work on product B. The Drizzle gotcha that bit you in March doesn't surface when the same trap appears in repo C in May. Marketing copy drifts the moment code ships. Roushi is the brain you wished you had at product number two — every decision, lesson, and pattern gets a slug, a citation, and a place in the typed graph. When you open a new product workspace, the relevant rules and lessons already greet you in the SessionStart context.",
    quote: "The marketing site IS Roushi practising what it preaches.",
  },
  {
    n: "02",
    heading: "If you're a solo founder",
    audience: "One operator, one or two products, agent-paired work.",
    body: "The business context lives in your head. Slack is where decisions go to die. Notion is a passive store — you have to remember to query it. Roushi captures the durable bits (the why, the lessons learned the hard way, the trade-offs you made on purpose) and re-surfaces them in the agent you're already pair-programming with. The brain isn't a separate destination; it's a layer below Claude Code that keeps your context across sessions.",
    quote: "Notion is a passive store. Roushi acts.",
  },
  {
    n: "03",
    heading: "If you ship code with AI agents",
    audience: "Heavy Claude Code / Cursor / Windsurf users; teams piloting agent-first workflows.",
    body: "Every agent session starts cold. The model has the codebase but not the why. Roushi is the persistent memory layer: PreToolUse hooks inject relevant brain context before each Edit/Write, the SessionStart hook loads applicable rules, and remote agents can query the same brain over HTTPS MCP. The result: a continuity across sessions and across agents that no single agent provides on its own.",
    quote: "Memory across agents and sessions.",
  },
];

export default function UseCasesPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            Use cases
          </p>
          <h1 className="mt-4 font-serif italic text-zinc-50" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            Three operators.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-zinc-300">
            Roushi is built for one shape of customer, with two natural neighbors.
          </p>
        </header>

        <div className="mt-20 space-y-16">
          {CASES.map((c) => (
            <section key={c.n} className="grid grid-cols-[2.5rem_1fr] gap-4 sm:grid-cols-[3rem_1fr]">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
                {c.n}
              </span>
              <div>
                <h2 className="font-serif italic text-3xl text-zinc-50">{c.heading}</h2>
                <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-zinc-400">
                  {c.audience}
                </p>
                <p className="mt-4 text-lg leading-relaxed text-zinc-300">{c.body}</p>
                <blockquote className="mt-5 border-l border-zinc-800 pl-4 font-serif text-lg italic text-zinc-400">
                  “{c.quote}”
                </blockquote>
              </div>
            </section>
          ))}
        </div>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            Recognize yourself in one of these? Get in touch.
          </p>
          <div className="mt-8 flex justify-center">
            <SealStamp href="/#request-beta">Request beta access</SealStamp>
          </div>
          <div className="mt-12 flex justify-center gap-6 text-sm">
            <Link href="/features" className="seal-underline text-zinc-300">
              Features →
            </Link>
            <Link href="/how-it-works" className="seal-underline text-zinc-300">
              How it works →
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
