import Link from "next/link";
import { BetaRequestForm } from "../components/BetaRequestForm";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "About",
  description: "Why a brain.",
};

export default function AboutPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            About
          </p>
          <h1 className="mt-4 font-serif italic text-zinc-50" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            Why a brain.
          </h1>
        </header>

        <article className="prose-roushi mt-20 space-y-7 text-lg leading-relaxed text-zinc-200">
          <p>
            KumoKodo runs twenty-plus products under one roof. Six months in, the bottleneck
            wasn&apos;t code — it was context. Decisions from product A would surface again in
            product C and we&apos;d re-litigate them because the rationale was scattered across
            Slack threads, half-written README&apos;s, and tribal knowledge. Lessons from a 3am
            incident in March wouldn&apos;t carry to May. Marketing copy drifted from what the code
            actually did within weeks of every ship.
          </p>

          <p>
            We tried Notion. We tried Obsidian. We tried GBrain. They all share the same shape: a
            passive store that waits to be queried. Useful, but only when you remember to go
            there. The problem with a portfolio brain isn&apos;t storing the knowledge; it&apos;s
            getting it back at the moment it matters — which is the moment you start writing
            the next file, not the moment you have time to sit down and search.
          </p>

          <p>
            Roushi is what came out of building for that constraint. A brain that{" "}
            <em className="font-serif">runs while you code</em>. PreToolUse hooks inject the
            relevant lessons, decisions, and rules into Claude Code before each Edit/Write.
            Cron jobs audit the brain itself for stale, duplicate, and contradictory entries.
            Skills are indexed alongside rules so a single source of truth covers both what
            the agent should know AND when it should invoke a procedure.
          </p>

          <p>
            The name is 老師 (rōshi — old master). The brand has a single accent: vermilion,
            used like a scholar&apos;s seal stamp. The metaphor is intentional. A brain isn&apos;t
            a database; it&apos;s the consulted wise one.
          </p>

          <p className="border-l border-zinc-800 pl-4 font-serif italic text-zinc-300">
            I built Roushi for myself first. KumoKodo is the dogfood; private beta is open to
            other portfolio operators who want the same thing. When it stabilizes, it
            graduates into a multi-tenant SaaS — but the operator-first design stays.
          </p>

          <p className="flex items-baseline gap-3 pt-4">
            <span>— Sam, KumoKodo</span>
            <SealStamp variant="static" rotate={4}>
              Roushi · 老師
            </SealStamp>
          </p>
        </article>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section id="request-beta">
          <h2 className="text-center font-serif italic text-zinc-50" style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)" }}>
            Request beta access
          </h2>
          <BetaRequestForm />
          <div className="mt-12 flex justify-center gap-6 text-sm">
            <Link href="/how-it-works" className="seal-underline text-zinc-300">
              How it works →
            </Link>
            <a
              href="https://github.com/samwsimpson/roushi-template"
              target="_blank"
              rel="noreferrer noopener"
              className="seal-underline text-zinc-300"
            >
              View on GitHub →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
