import Link from "next/link";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "Onboarding — Roushi",
  description:
    "You deployed Roushi. Now what? Five things to try in your first ten minutes that will make Roushi click.",
};

export default function OnboardingPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            Your first ten minutes
          </p>
          <h1
            className="mt-4 font-serif italic text-zinc-50"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
          >
            You&apos;re in. Now what?
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-300">
            Five things to do right now that will make Roushi click. The whole
            sequence takes ten minutes. Skip any step that doesn&apos;t apply —
            they&apos;re independent.
          </p>
        </header>

        <div className="mt-20 space-y-20">
          <Step
            number="01"
            time="1 min"
            title="Look around the homepage"
          >
            <p>
              The homepage is the <strong>Ask</strong> interface — type a
              question in plain English. Right now your brain is mostly empty,
              so it won&apos;t have much to say. That&apos;s fine. We&apos;re
              about to feed it.
            </p>
            <p>
              The left sidebar has the rest of the app:
            </p>
            <ul className="ml-5 list-disc space-y-1 text-zinc-300">
              <li>
                <strong>Browse</strong> — every entity in your brain, filterable
                by type
              </li>
              <li>
                <strong>Graph</strong> — force-directed view of how entities
                connect
              </li>
              <li>
                <strong>Goals</strong> — durable multi-week objectives
              </li>
              <li>
                <strong>Rules</strong> — durable instructions that auto-sync to
                your AI tools
              </li>
              <li>
                <strong>Skills</strong> — Claude Code skills indexed for
                recommendation
              </li>
              <li>
                <strong>Optimize</strong> — brain health: dedupe, audit, decay,
                contradictions
              </li>
            </ul>
          </Step>

          <Step
            number="02"
            time="2 min"
            title="Ingest a real project"
          >
            <p>
              The fastest way to feel Roushi&apos;s value is to point it at a
              project you already have locally. It auto-extracts entities (tech,
              vendors, decisions, patterns, lessons) using an LLM and builds the
              graph for you.
            </p>
            <Code>{`# Clone your deployed instance locally if you haven't yet
git clone https://github.com/YOUR_USER/roushi
cd roushi
pnpm install
vercel env pull .env.local       # pulls DATABASE_URL etc. from Vercel
pnpm db:setup                    # one-time table + index creation

# Now ingest any project repo you have
pnpm roushi add-project ~/projects/your-project
pnpm roushi add-project ~/projects/another-one`}</Code>
            <p>
              Each <code>add-project</code> run takes ~30 seconds. It reads the
              project&apos;s <code>README.md</code>, <code>CLAUDE.md</code>,
              <code>package.json</code>, and a few other key files, then asks an
              LLM to extract typed sub-entities (tech, vendor, decision,
              pattern, lesson). Edges between them get built automatically.
            </p>
          </Step>

          <Step
            number="03"
            time="30 sec"
            title="Ask the master"
          >
            <p>
              Go back to the homepage. Now ask:
            </p>
            <ul className="ml-5 list-disc space-y-1 text-zinc-300">
              <li>
                <em>&quot;What tech do my projects have in common?&quot;</em>
              </li>
              <li>
                <em>&quot;Which projects use Postgres?&quot;</em>
              </li>
              <li>
                <em>
                  &quot;What decisions have I made about authentication?&quot;
                </em>
              </li>
              <li>
                <em>
                  &quot;Are any of my projects vulnerable to the same lesson I
                  learned in [project name]?&quot;
                </em>
              </li>
            </ul>
            <p>
              The answer renders with citations — each{" "}
              <code className="text-emerald-400">[slug]</code> chip links to the
              entity it&apos;s referencing. Below the answer: a{" "}
              <strong>gap analysis</strong> — what the brain still doesn&apos;t
              know, so you can fill it in next.
            </p>
          </Step>

          <Step
            number="04"
            time="3 min"
            title="Write your first rule"
          >
            <p>
              Rules are durable instructions that Roushi auto-syncs into your AI
              coding tools — Claude Code memory dir, Copilot&apos;s{" "}
              <code>.github/copilot-instructions.md</code>, Cursor&apos;s{" "}
              <code>.cursorrules</code>, Windsurf&apos;s{" "}
              <code>.windsurfrules</code>. Once written, every future AI session
              follows the rule automatically.
            </p>
            <p>
              Create a file at{" "}
              <code>content/rules/my-first-rule.md</code>:
            </p>
            <Code>{`---
slug: my-first-rule
type: rule
name: A convention I want every AI session to follow
applies_to: portfolio
priority: normal
---

## The rule

Whenever you generate a new API route, validate the request body
with Zod before any database access. Use the Server Action pattern
\`{ ok: false, message }\` for errors — never throw.

## Why

We've had bugs where unvalidated input flowed into queries.
Catching it at the validation boundary keeps downstream code simple.`}</Code>
            <p>Then ingest it:</p>
            <Code>{`pnpm roushi ingest content/rules/my-first-rule.md`}</Code>
            <p>
              The rule is now in your brain and will auto-sync into any
              workspace via the SessionStart hook (Claude Code) or the VS Code
              extension.
            </p>
          </Step>

          <Step
            number="05"
            time="3 min"
            title="Connect your editor"
          >
            <p>
              This is where Roushi stops being &quot;a thing you check&quot; and
              becomes <em>a thing that runs while you code</em>. Pick your
              editor:
            </p>
            <div className="grid gap-3">
              <EditorBox
                title="Claude Code"
                why="Deepest integration — MCP tools + PreToolUse hooks that inject brain context before every edit"
              >
                <Code>{`claude mcp add -s user roushi-remote \\
  https://your-instance.vercel.app/api/mcp \\
  --transport http \\
  --header "Authorization: Bearer $YOUR_TOKEN"`}</Code>
              </EditorBox>
              <EditorBox
                title="VS Code (Copilot, Cursor, Windsurf)"
                why="Sidebar advisor + auto-syncs rules into your AI tool's instruction file"
              >
                <Code>{`code --install-extension kumokodo.roushi
# Then: Settings → search "roushi" → set endpoint + token`}</Code>
              </EditorBox>
            </div>
            <p>
              Once connected, switch to a code file in your editor. You should
              see brain context appear in the sidebar (VS Code) or be injected
              into Claude Code automatically. Search the brain from inside your
              editor without context-switching.
            </p>
          </Step>
        </div>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section>
          <h2 className="text-center text-2xl font-light text-zinc-50">
            What good looks like at day 30
          </h2>
          <div className="mx-auto mt-8 max-w-2xl space-y-4 text-zinc-300">
            <p>
              You&apos;ve ingested 5-10 projects. The graph has a few hundred
              entities and the search returns useful results without
              hand-curation. You&apos;ve written 3-5 rules — the conventions
              that used to live in your head are now in writing and your AI
              tools follow them automatically.
            </p>
            <p>
              You ship a feature. Before you commit, Roushi has already
              reminded you about a related lesson from six months ago, a
              decision that affects this surface, and a rule about updating
              the changelog. The doc sweep happens because the rule says so,
              not because you remembered.
            </p>
            <p>
              When you start a new project, you don&apos;t pick a stack from
              scratch — Roushi tells you what worked last time and why. When
              an old project breaks, the related incident is one query away.
            </p>
            <p className="text-zinc-400">
              That&apos;s the goal: Roushi as the consulted sage, not a
              database you remember to check.
            </p>
          </div>
        </section>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            Stuck somewhere? The full reference is in /help.
          </p>
          <div className="mt-8 flex justify-center">
            <SealStamp href="/help">Open the reference</SealStamp>
          </div>
          <div className="mt-12 flex justify-center gap-6 text-sm">
            <Link href="/install" className="seal-underline text-zinc-300">
              ← Back to install
            </Link>
            <a
              href="https://github.com/samwsimpson/roushi-template/issues"
              target="_blank"
              rel="noreferrer noopener"
              className="seal-underline text-zinc-300"
            >
              Report an issue →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}

function Step({
  number,
  time,
  title,
  children,
}: {
  number: string;
  time: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-zinc-500">{number}</span>
          <h2 className="text-2xl font-light text-zinc-50">{title}</h2>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {time}
          </span>
        </div>
      </div>
      <div className="space-y-4 text-base leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function EditorBox({
  title,
  why,
  children,
}: {
  title: string;
  why: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-5">
      <h3 className="text-sm font-medium text-zinc-100">{title}</h3>
      <p className="mt-1 mb-3 text-xs text-zinc-500">{why}</p>
      <div className="space-y-2 text-sm text-zinc-300">{children}</div>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-auto rounded bg-zinc-900 p-3 font-mono text-sm leading-relaxed text-zinc-200">
      {children}
    </pre>
  );
}
