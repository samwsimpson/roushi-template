import Link from "next/link";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

const DEPLOY_URL =
  "https://vercel.com/new/clone" +
  "?repository-url=https%3A%2F%2Fgithub.com%2Fsamwsimpson%2Froushi-template" +
  "&env=OPENAI_API_KEY,AUTH_SECRET,ROUSHI_MCP_HTTP_TOKEN,CRON_SECRET" +
  "&envDescription=Required%20env%20vars.%20See%20.env.example%20for%20details." +
  "&envLink=https%3A%2F%2Fgithub.com%2Fsamwsimpson%2Froushi-template%2Fblob%2Fmain%2F.env.example" +
  "&project-name=roushi" +
  "&stores=%5B%7B%22type%22%3A%22postgres%22%7D%5D";

export const metadata = {
  title: "Install — Roushi",
  description:
    "Get Roushi running in Claude Code, VS Code, Cursor, Windsurf, or as a standalone CLI. Three paths, same brain.",
};

export default function InstallPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            Get started
          </p>
          <h1
            className="mt-4 font-serif italic text-zinc-50"
            style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}
          >
            Install Roushi
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-300">
            Four ways in. Same brain, same rules, same knowledge — pick the one
            that fits how you work.
          </p>
        </header>

        <div className="mt-20 space-y-20">
          <Method
            number="01"
            title="Deploy to Vercel"
            subtitle="Your own Roushi instance in under 5 minutes — free"
            badge="Quickstart"
          >
            <p>
              One click deploys your own Roushi instance with a Neon Postgres
              database auto-provisioned. You own the data, you own the
              instance — completely isolated from everyone else.
            </p>
            <div className="flex justify-center py-4">
              <a
                href={DEPLOY_URL}
                target="_blank"
                rel="noreferrer noopener"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://vercel.com/button"
                  alt="Deploy with Vercel"
                  width={200}
                  height={40}
                />
              </a>
            </div>
            <Step n={1} title="Click the button above">
              <p>
                Vercel clones the repo into your GitHub account, provisions a
                Neon Postgres database, and prompts you for four keys:
              </p>
              <ul className="ml-5 list-disc space-y-1 text-zinc-300">
                <li>
                  <strong>OPENAI_API_KEY</strong> — for embeddings.{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-emerald-400 hover:underline"
                  >
                    Get one here
                  </a>{" "}
                  (free tier works).
                </li>
                <li>
                  <strong>AUTH_SECRET</strong> — secures your sessions. Run{" "}
                  <code>openssl rand -base64 32</code> in your terminal.
                </li>
                <li>
                  <strong>ROUSHI_MCP_HTTP_TOKEN</strong> — protects your MCP API
                  endpoint. Run <code>openssl rand -hex 32</code>.
                </li>
                <li>
                  <strong>CRON_SECRET</strong> — authenticates the automated
                  maintenance jobs. Run <code>openssl rand -hex 32</code>.
                </li>
              </ul>
            </Step>
            <Step n={2} title="Visit your instance">
              <p>
                Wait for the first build to complete (~60 seconds — Vercel
                auto-provisions Neon Postgres and runs <code>db:setup</code> as
                part of the build, so tables are created automatically). Then
                Vercel gives you a URL like{" "}
                <code>roushi-yourname.vercel.app</code>. Open it — the Ask
                interface is ready. No manual database setup required.
              </p>
            </Step>
            <Step n={3} title="Optional: clone locally for CLI access">
              <p>
                Want to use the <code>pnpm roushi</code> CLI to ingest projects
                from your local machine, or work on your own customizations?
                Clone your fork:
              </p>
              <Code>{`git clone https://github.com/YOUR_USER/roushi-template
cd roushi-template
pnpm install
npx vercel link                  # link to your Vercel project
npx vercel env pull .env.local   # pull DATABASE_URL + other env vars
pnpm roushi ingest ./content     # ingest the starter content
pnpm roushi add-project ~/projects/some-project   # ingest your own`}</Code>
              <p>
                Skip this if you only want to use the web UI — your deployed
                instance works without any local setup.
              </p>
            </Step>
            <Step n={4} title="Enable GitHub Actions for auto-updates">
              <p>
                Your repo ships with a daily workflow that opens a PR when
                upstream Roushi has new commits. GitHub disables Actions on
                new repos by default for security — to enable:
              </p>
              <ol className="ml-5 list-decimal space-y-1 text-zinc-300">
                <li>Open your repo on GitHub</li>
                <li>Click the <strong>Actions</strong> tab</li>
                <li>Click <strong>&quot;I understand my workflows, go ahead and enable them&quot;</strong></li>
              </ol>
              <p>
                Once enabled, the &quot;Sync from upstream&quot; workflow runs
                daily at 12:00 UTC. When it finds new commits, you&apos;ll get
                a PR titled &quot;Sync from upstream (roushi-template)&quot; —
                review the diff, click Merge, Vercel redeploys.
              </p>
              <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3 text-xs text-zinc-400">
                <strong>Why not GitHub&apos;s &quot;Sync fork&quot; button?</strong>{" "}
                Vercel&apos;s deploy flow creates a brand-new independent
                repository in your account (not a true fork), so GitHub&apos;s
                UI sync button doesn&apos;t appear. The workflow above does
                the same job mechanically — it&apos;s the recommended path.
              </div>
              <p className="text-zinc-400">
                Don&apos;t want auto-updates? Skip this step. You can also pull
                updates manually any time using this GitHub compare URL{" "}
                <code>github.com/YOUR_USER/YOUR_REPO/compare/main...samwsimpson:roushi-template:main</code>
                {" "}— opens a PR with the diff for review.
              </p>
            </Step>
            <Step n={5} title="Optional: connect your editor">
              <p>
                Your instance has an MCP endpoint at{" "}
                <code>https://your-roushi.vercel.app/api/mcp</code>. Set{" "}
                <code>ROUSHI_MCP_HTTP_TOKEN</code> in Vercel env vars, then
                follow the Claude Code or VS Code instructions below to
                connect.
              </p>
            </Step>
            <div className="rounded-lg border border-vermilion/30 bg-vermilion/5 p-5">
              <p className="text-sm text-zinc-200">
                <strong>Deployed?</strong> Head to{" "}
                <Link
                  href="/onboarding"
                  className="text-vermilion hover:underline"
                >
                  /onboarding
                </Link>{" "}
                for the five things to do in your first ten minutes that make
                Roushi click.
              </p>
            </div>
          </Method>

          <Method
            number="02"
            title="Claude Code (MCP)"
            subtitle="Full integration — hooks, rules, proactive context"
            badge="Deepest"
          >
            <p>
              Claude Code gets the deepest integration: MCP tools, PreToolUse
              hooks that inject brain context before every edit, and automatic
              rule syncing into your workspace memory. This is the setup we use
              internally.
            </p>
            <Step n={1} title="Register the MCP server">
              <p>Choose local (fastest) or remote (works from any machine):</p>
              <Code>{`# Local stdio — fast, no network
claude mcp add -s user roushi pnpm -- \\
  --silent --dir /path/to/Roushi mcp

# Remote HTTPS — works anywhere
claude mcp add -s user roushi-remote \\
  https://roushi.ai/api/mcp \\
  --transport http \\
  --header "Authorization: Bearer $YOUR_TOKEN"`}</Code>
            </Step>
            <Step n={2} title="Verify">
              <Code>{`# In any Claude Code session:
mcp__roushi__roushi_search "your query here"`}</Code>
              <p>
                You should see brain results. All 35 MCP tools are now available
                in every session.
              </p>
            </Step>
            <Step n={3} title="Optional: enable the proactive hooks">
              <p>
                The hooks make Roushi inject relevant context{" "}
                <em>before you write code</em>, not just when you ask. Contact
                us during the beta for the hook setup guide.
              </p>
            </Step>
          </Method>

          <Method
            number="03"
            title="VS Code Extension"
            subtitle="Works with Copilot, Cursor, Windsurf — any AI in VS Code"
          >
            <p>
              The VS Code extension talks to the same Roushi brain via the MCP
              HTTP endpoint. It syncs rules into your AI tool&apos;s instruction
              file and surfaces relevant context in a sidebar panel.
            </p>
            <Step n={1} title="Install the extension">
              <Code>{`code --install-extension kumokodo.roushi`}</Code>
              <p>
                Or search <strong>&quot;Roushi&quot;</strong> in the VS Code
                Marketplace.
              </p>
            </Step>
            <Step n={2} title="Configure your endpoint + token">
              <p>
                Open VS Code Settings (<kbd>Ctrl+,</kbd>) → search{" "}
                <strong>roushi</strong>:
              </p>
              <ul className="ml-5 list-disc space-y-1 text-zinc-300">
                <li>
                  <strong>Endpoint:</strong> your instance URL — e.g.{" "}
                  <code>https://roushi-yourname.vercel.app/api/mcp</code>
                </li>
                <li>
                  <strong>Token:</strong> the{" "}
                  <code>ROUSHI_MCP_HTTP_TOKEN</code> you generated during deploy
                </li>
              </ul>
            </Step>
            <Step n={3} title="Open a workspace">
              <p>The extension automatically:</p>
              <ul className="ml-5 list-disc space-y-1 text-zinc-300">
                <li>Detects which product this workspace belongs to</li>
                <li>
                  Syncs applicable rules into{" "}
                  <code>.github/copilot-instructions.md</code> (Copilot),{" "}
                  <code>.cursorrules</code> (Cursor), and{" "}
                  <code>.windsurfrules</code> (Windsurf)
                </li>
                <li>
                  Shows relevant brain context in the <strong>Advisor</strong>{" "}
                  sidebar when you switch files
                </li>
              </ul>
            </Step>
            <Step n={4} title="Use the commands">
              <p>
                Open the command palette (<kbd>Ctrl+Shift+P</kbd>):
              </p>
              <ul className="ml-5 list-disc space-y-1 text-zinc-300">
                <li>
                  <strong>Roushi: Ask the Master</strong> — synthesized answer
                  with citations
                </li>
                <li>
                  <strong>Roushi: Search the Brain</strong> — hybrid search
                </li>
                <li>
                  <strong>Roushi: Sync Rules</strong> — manual rule re-sync
                </li>
                <li>
                  <strong>Roushi: Show Context</strong> — file-specific brain
                  context
                </li>
              </ul>
            </Step>
          </Method>

          <Method
            number="04"
            title="CLI only"
            subtitle="Terminal-first — works with any editor, any AI, any workflow"
          >
            <p>
              The CLI is a standalone tool. No editor integration needed — just a
              terminal. Useful for scripting, CI, or when you want the brain
              without any IDE coupling.
            </p>
            <Step n={1} title="Clone and install">
              <Code>{`git clone https://github.com/samwsimpson/roushi-template
cd roushi-template
pnpm install
cp .env.example .env.local  # fill in DATABASE_URL, OPENAI_API_KEY
pnpm db:setup`}</Code>
            </Step>
            <Step n={2} title="Use it">
              <Code>{`pnpm roushi search "auth patterns"
pnpm roushi think "how do we handle Drizzle ANY arrays?"
pnpm roushi graph-query roushi --hops 2
pnpm roushi rules list
pnpm roushi skill list`}</Code>
            </Step>
          </Method>
        </div>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            The Deploy to Vercel path is fully self-service — no token from us
            needed. You generate your own keys and own your instance.
          </p>
          <p className="mt-4 text-sm text-zinc-400">
            Want a managed hosted instance instead? We&apos;re working on a SaaS
            tier — request early access and we&apos;ll reach out when it&apos;s
            ready.
          </p>
          <div className="mt-8 flex justify-center">
            <SealStamp href="/about#request-beta">
              Request managed access
            </SealStamp>
          </div>
          <div className="mt-12 flex justify-center gap-6 text-sm">
            <Link
              href="/help"
              className="seal-underline text-zinc-300"
            >
              Full reference →
            </Link>
            <a
              href="https://github.com/samwsimpson/roushi-template"
              target="_blank"
              rel="noreferrer noopener"
              className="seal-underline text-zinc-300"
            >
              GitHub →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}

function Method({
  number,
  title,
  subtitle,
  badge,
  children,
}: {
  number: string;
  title: string;
  subtitle: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-zinc-500">{number}</span>
          <h2 className="text-2xl font-light text-zinc-50">{title}</h2>
          {badge && (
            <span className="rounded border border-vermilion/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-vermilion">
              {badge}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
      </div>
      <div className="space-y-4 text-base leading-relaxed text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/60 bg-zinc-950/50 p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-100">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 font-mono text-[10px] text-zinc-400">
          {n}
        </span>
        {title}
      </h3>
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
