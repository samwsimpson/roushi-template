import Link from "next/link";

export const metadata = {
  title: "Help — Roushi",
};

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-zinc-200">
      <h1 className="mb-2 text-3xl font-light text-zinc-100">Help</h1>
      <p className="mb-10 text-sm text-zinc-500">
        Reference for what Roushi is, what it stores, and how to use it.
      </p>

      <Section id="what-is-roushi" title="What is Roushi?">
        <p>
          <span className="font-serif text-lg">老師</span> "old master / sage" — a self-wiring
          knowledge layer for the KumoKodo portfolio. Markdown files in git are the source of
          truth; Postgres + pgvector is the searchable index.
        </p>
        <p>
          You ask Roushi questions like <em>"have we decided X before?"</em>, <em>"which products
          use this pattern?"</em>, <em>"what lessons came from project Y?"</em> — and it returns
          relevant entities with their connections. Available four ways: the{" "}
          <Link href="/" className="text-emerald-400 hover:underline">Ask homepage</Link>, the
          CLI (<code>pnpm roushi …</code>), the local MCP server in any Claude Code session
          (<code>mcp__roushi__*</code>), and the deployed HTTP MCP route at{" "}
          <code>/api/mcp</code> (Bearer-auth, for remote agents).
        </p>
      </Section>

      <Section id="ask" title="Ask the master (think)">
        <p>
          The homepage <Link href="/" className="text-emerald-400 hover:underline">Ask</Link>{" "}
          flow is grounded synthesis: your question goes to hybrid search (top-12 by default),
          and the retrieved entities are sent to an LLM (gpt-4o) with a prompt that requires
          citations against the brain. The answer renders as markdown with{" "}
          <code className="text-emerald-400">[slug]</code> chips that link to{" "}
          <code>/entities/&lt;slug&gt;</code>.
        </p>
        <p>
          Below the answer: a <strong>gap analysis</strong> — things the LLM judged the brain
          doesn&apos;t know yet, which are leads for what to ingest next. Also available as{" "}
          <code>pnpm roushi think &quot;…&quot;</code> in the CLI and{" "}
          <code>mcp__roushi__think</code> from any agent.
        </p>
      </Section>

      <Section id="entities" title="Entities — the nouns">
        <p>
          Every concept Roushi knows about is an <strong>entity</strong> — a row in the brain with
          a slug, a type, a name, a description, an embedding (for vector search), and a search
          vector (for keyword search).
        </p>
        <div className="mt-3 space-y-2">
          <Type
            color="text-emerald-400 border-emerald-900/60 bg-emerald-950/40"
            type="product"
            label="A product or repo"
            note="Kodori, Roushi, ZoningAI, Akiko — anything Sam ships or KumoKodo Studio builds for clients."
          />
          <Type
            color="text-sky-400 border-sky-900/60 bg-sky-950/40"
            type="tech"
            label="A library or framework"
            note="Drizzle ORM, Next.js, pgvector, Tailwind. Things you import or depend on."
          />
          <Type
            color="text-amber-400 border-amber-900/60 bg-amber-950/40"
            type="vendor"
            label="A platform / paid service"
            note="Vercel, Stripe, Cloudflare R2, Anthropic. Things you call or pay."
          />
          <Type
            color="text-violet-400 border-violet-900/60 bg-violet-950/40"
            type="pattern"
            label="A reusable architectural pattern"
            note="Hash-chained audit trails, Reciprocal Rank Fusion, two-phase ingest. Patterns transfer across products."
          />
          <Type
            color="text-rose-400 border-rose-900/60 bg-rose-950/40"
            type="decision"
            label="A locked architectural choice"
            note='"Neon over MongoDB", "GitHub OAuth not magic links", "JWT sessions not DB sessions". The why is stored with the what.'
          />
          <Type
            color="text-zinc-400 border-zinc-800 bg-zinc-900/40"
            type="lesson"
            label="Something learned the hard way"
            note='"Drizzle strict:true breaks non-TTY". "@react-pdf 4.5.1 crash patterns." Auto-ingested from per-project Claude memory.'
          />
          <Type
            color="text-orange-400 border-orange-900/60 bg-orange-950/40"
            type="incident"
            label="A specific failure event"
            note="Used for postmortems. Not heavily seeded yet."
          />
          <Type
            color="text-yellow-400 border-yellow-900/60 bg-yellow-950/40"
            type="goal"
            label="A durable multi-week objective"
            note="Full lifecycle UI at /goals: done / block / abandon / reopen. System goals auto-created by maintenance crons."
          />
          <Type
            color="text-purple-400 border-purple-900/60 bg-purple-950/40"
            type="rule"
            label="A durable instruction"
            note="Rules auto-sync into every KumoKodo workspace's Claude memory dir via SessionStart hook. Scoped by applies_to (slug / type / portfolio). The portfolio-shipment-sweep rule holds the canonical marketing-surface taxonomy; each project declares its surfaces in CLAUDE.md `## Marketing surfaces`. See /rules."
          />
          <Type
            color="text-teal-400 border-teal-900/60 bg-teal-950/40"
            type="skill"
            label="A Claude Code skill, indexed"
            note="Skills live on disk at ~/.claude/skills/<name>/SKILL.md; Roushi indexes them so think/search can recommend one. See /skills."
          />
        </div>
      </Section>

      <Section id="edges" title="Edges — the verbs">
        <p>
          Edges connect entities with a typed relation. The graph is what lets Roushi answer{" "}
          <em>"which products use Drizzle?"</em> rather than just <em>"what is Drizzle?"</em>.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Edge name="uses" desc="Product → tech. 'Kodori uses Drizzle ORM.'" />
          <Edge name="hosted_on" desc="Product → vendor. 'Kodori hosted_on Cloudflare R2.'" />
          <Edge name="defined_by" desc="Product → pattern. 'Kodori defined_by hash-chained-audit.'" />
          <Edge name="led_to" desc="Product → decision. 'Auth complexity led_to JWT-only sessions.'" />
          <Edge name="depends_on" desc="Product → lesson. 'ZoningAI depends_on react-pdf-crash-patterns.'" />
          <Edge name="applies_to" desc="Cross-cutting. 'Multi-tenant-saas applies_to Kodori and Roushi.'" />
          <Edge name="mentions" desc="Soft reference. Fallback when nothing better fits." />
          <Edge name="supersedes" desc="Newer decision replacing an older one." />
          <Edge name="blocks" desc="Goal can't proceed until X resolves." />
          <Edge name="shares_pattern" desc="Two products implementing the same architectural pattern." />
        </div>
      </Section>

      <Section id="extraction" title="LLM extraction — how the graph fills in">
        <p>
          When you add a project, Roushi loads its canonical docs (CLAUDE.md, README.md, etc.),
          concatenates them, and sends them to an LLM (currently OpenAI <code>gpt-4o-mini</code>)
          with a structured-output Zod schema asking it to extract typed sub-entities and edges.
        </p>
        <p>
          The LLM gets the list of <em>existing slugs in the brain</em> as a hint, so it reuses{" "}
          <code>drizzle-orm</code> instead of coining <code>drizzle</code>. The product entity gets
          edges from itself to each extracted tech / vendor / decision / pattern / lesson.
        </p>
        <p>
          Entities created this way are flagged <code>frontmatter.extracted = true</code>. When you
          re-run extraction (via the Refresh button on a product page), human-curated entities are
          never overwritten — only previously-extracted ones get updated.
        </p>
      </Section>

      <Section id="search" title="Hybrid search (vector + keyword + RRF)">
        <p>
          The Browse page's search box and <code>mcp__roushi__search</code> run two queries in
          parallel:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong>Vector</strong> — your query gets embedded (OpenAI{" "}
            <code>text-embedding-3-small</code>) and HNSW-index-searched against entity embeddings
            by cosine similarity. Catches semantic matches even when terms don't overlap.
          </li>
          <li>
            <strong>Keyword</strong> — Postgres <code>tsvector</code> + <code>plainto_tsquery</code>
            with GIN index. Catches exact-term hits the vector might miss in long descriptions.
          </li>
        </ul>
        <p>
          The two ranked lists are fused via <strong>Reciprocal Rank Fusion</strong> (k=60).
          Results marked <code>both</code> in the score column are hits in both rankings — they're
          almost always the strongest signal.
        </p>
      </Section>

      <Section id="commands" title="CLI reference">
        <p>All available as <code>pnpm roushi &lt;cmd&gt;</code>:</p>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 pr-4">Command</th>
              <th className="py-1">What it does</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            <Cmd cmd="think <q>" desc="Ask the master — synthesized answer with citations + gap analysis. Same engine as the homepage." />
            <Cmd cmd="search <q>" desc="Hybrid search. -n N for max results. --explain shows per-stage rank attribution. --rerank adds gpt-4o-mini rerank." />
            <Cmd cmd="graph-query <slug>" desc="Walk the edge graph from an entity. -h N for max hops." />
            <Cmd cmd="get <slug>" desc="Print one entity's contents." />
            <Cmd cmd="list [-t type] [-n N]" desc="List entities, optionally filtered by type." />
            <Cmd cmd="add -s slug -t type -n name" desc="Manually create an entity." />
            <Cmd cmd="ingest <path>" desc="Bulk-ingest a markdown file or directory." />
            <Cmd cmd="scan <dir>" desc="List candidate projects under <dir>. --add-all to batch-add new ones." />
            <Cmd cmd="add-project [path]" desc="Add or refresh a single project. Defaults to cwd. --client-work for studio work." />
            <Cmd cmd="stats" desc="Brain health snapshot: counts by type/relation/status." />
            <Cmd cmd="goal add|list|update-status|link" desc="Manage durable goals." />
            <Cmd cmd="scratchpad write|read|list" desc="Per-agent ephemeral memory." />
            <Cmd cmd="optimize audit|dedupe|decay|merge|fix-edge|touch" desc="Brain self-optimization actions (see /optimize)." />
            <Cmd cmd="rules list|get|sync" desc="Manage portfolio rules. sync writes applicable rules into a workspace's Claude memory dir." />
            <Cmd cmd="skill list|get|ingest" desc="Index Claude Code skills (~/.claude/skills/) as brain entities." />
            <Cmd cmd="audit-contradictions" desc="Find entity pairs the LLM judges as actually conflicting (pgvector close-pair + LLM judge)." />
            <Cmd cmd="eval list|run|capture|replay" desc="Retrieval-quality eval framework. 8 hand-curated queries." />
            <Cmd cmd="playbook add|list|get|check|remove|runs" desc="Standing rules that fire on events." />
            <Cmd cmd="portfolio list|export-registry" desc="Portfolio catalog + ~/.claude/rules/projects-registry.md generation." />
            <Cmd cmd="memory ingest|install-hook" desc="Pull Claude auto-memory into the brain as lessons." />
          </tbody>
        </table>
      </Section>

      <Section id="mcp" title="MCP tools (Claude Code, Cursor, any MCP client)">
        <p>
          35 tools as of v0.13.0. Local stdio is registered globally for fast access; the
          deployed HTTPS endpoint is below.
        </p>
        <ul className="ml-5 list-disc space-y-1 font-mono text-xs">
          <li><code>mcp__roushi__think</code> — synthesized answer with citations + gaps</li>
          <li><code>mcp__roushi__search</code> — hybrid search</li>
          <li><code>mcp__roushi__graph_query</code> — typed-edge traversal</li>
          <li><code>mcp__roushi__get_entity</code> / <code>list_entities</code> / <code>add</code> / <code>ingest</code> — entity CRUD</li>
          <li><code>mcp__roushi__scan_projects</code> / <code>add_project</code> — discover + register a workspace</li>
          <li><code>mcp__roushi__goal_add</code> / <code>goal_list</code> / <code>goal_update_status</code> — goal lifecycle</li>
          <li><code>mcp__roushi__scratchpad_write</code> / <code>scratchpad_read</code> / <code>scratchpad_list</code> — per-agent memory</li>
          <li><code>mcp__roushi__playbook_*</code> (9 tools) — standing-rule registry + invocation actions</li>
          <li><code>mcp__roushi__rule_list</code> / <code>rule_get</code> / <code>rule_sync_workspace</code> — portfolio rules</li>
          <li><code>mcp__roushi__skill_list</code> / <code>skill_get</code> / <code>skill_ingest</code> — Claude Code skill index</li>
          <li><code>mcp__roushi__audit_edges</code> / <code>find_duplicates</code> / <code>merge_entities</code> / <code>list_stale</code> / <code>touch_entity</code> — brain optimization</li>
        </ul>
        <h3 className="text-sm font-medium text-zinc-200 mt-4">Deployed HTTPS endpoint</h3>
        <p>
          Same 35 tools available remotely at <code>https://roushi.ai/api/mcp</code>, Bearer-auth
          gated by the <code>ROUSHI_MCP_HTTP_TOKEN</code> env var.{" "}
          <code>GET /api/mcp</code> is an unauthenticated health probe (returns shape only).
          Register in any Claude Code session:
        </p>
        <pre className="mt-2 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
{`claude mcp add -s user roushi-remote https://roushi.ai/api/mcp \\
  --transport http \\
  --header "Authorization: Bearer $ROUSHI_MCP_HTTP_TOKEN"`}
        </pre>
      </Section>

      <Section id="graph" title="Graph — visualize the brain">
        <p>
          <Link href="/graph" className="text-emerald-400 hover:underline">/graph</Link>{" "}
          renders every entity and edge as a force-directed cytoscape view. Color per type;
          click any node to open its entity page. The legend at top doubles as a filter
          (toggle a type to hide it); the search box highlights matching node names and dims
          the rest. Useful for spotting unintentional silos or clusters in the portfolio
          knowledge.
        </p>
      </Section>

      <Section id="optimize" title="Optimize — brain self-maintenance">
        <p>
          <Link href="/optimize" className="text-emerald-400 hover:underline">/optimize</Link>{" "}
          surfaces four health checks against the Roushi brain itself (not project source code):
        </p>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li><strong>Audit</strong> — flags edges with relations that don&apos;t match the source/target types (e.g. a <code>tech</code> entity receiving <code>depends_on</code> when it should be <code>uses</code>). Suspect findings get a one-click suggested fix.</li>
          <li><strong>Dedupe</strong> — finds near-duplicate slugs within each type (string + embedding similarity). Merge re-points edges and deletes the duplicate.</li>
          <li><strong>Decay</strong> — entities not validated in &gt;90 days. Touch to bump the timestamp; review the description if it&apos;s actually stale.</li>
          <li><strong>Contradictions</strong> — pgvector close-pair search + LLM judge over rules/decisions/lessons. Surfaces pairs whose claims directly conflict.</li>
        </ul>
        <p>
          A weekly cron runs the four scans automatically and posts findings as{" "}
          <code>[system]</code> goals on{" "}
          <Link href="/goals" className="text-emerald-400 hover:underline">/goals</Link>.
          Every cron invocation also logs to <code>maintenance_runs</code> — visible in the
          &quot;Recent cron activity&quot; panel on /goals.
        </p>
      </Section>

      <Section id="hooks" title="Claude Code hooks — Roushi runs while you write">
        <p>
          Roushi is wired into every KumoKodo workspace via three Claude Code hooks (loaded
          from <code>~/.claude/settings.json</code> and per-repo <code>.claude/settings.json</code>):
        </p>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li>
            <strong>SessionStart</strong> — on every session start in any KumoKodo workspace,
            syncs applicable rules into the workspace&apos;s Claude memory dir + emits product
            context as a system reminder.
          </li>
          <li>
            <strong>PreToolUse: security checklist</strong> — before every Edit/Write, inspects
            the target file path and injects a focused security checklist if it matches a
            sensitive pattern (API route, Server Action, middleware, auth file, schema, env
            file, client component). Lets the secure pattern get written on the first try.
          </li>
          <li>
            <strong>PreToolUse: Roushi-as-advisor</strong> — same trigger, classifies the file
            type, looks up 2-4 relevant lessons/decisions/patterns/rules from the brain, and
            injects as context. ~500ms per fire; silent when nothing relevant matches.
          </li>
          <li>
            <strong>PostToolUse (Roushi repo only)</strong> — Biome format-on-write +
            schema/content nudges (e.g. &quot;ran <code>db:push</code>? remember{" "}
            <code>db:indexes</code>&quot;).
          </li>
        </ul>
      </Section>

      <Section id="examples" title="Try these">
        <p>
          See the <Link href="/examples" className="text-emerald-400 hover:underline">examples page</Link>{" "}
          for canned queries you can run with one click. A few to start with:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>"Which products use Drizzle ORM?" — shows Drizzle's incoming <code>uses</code> edges across the portfolio</li>
          <li>"Audit trail hash chain immutable" — surfaces Kodori + Kuroji which both implement this pattern</li>
          <li>"react-pdf crash patterns" — lesson auto-extracted from ZoningAI's Claude memory</li>
          <li>"What's our default database?" — semantic match (no keyword overlap) lands on projects-registry</li>
        </ul>
      </Section>

      <Section id="playbooks" title="Playbooks — standing rules that fire on events">
        <p>
          Playbooks are recurring instructions. <em>"When X happens, do Y, Z, and W."</em> Stored in the
          brain so any agent in any session can find the relevant rules and follow them — without
          needing to be told the conventions every time.
        </p>
        <p>
          Each playbook has a <strong>trigger</strong> event, an optional structured{" "}
          <strong>filter</strong>, and an ordered list of <strong>actions</strong> (free-text
          instructions). When an event fires, Roushi surfaces the matching playbooks in the response —
          v0.2.0 doesn't auto-execute them, you/the agent decide what to act on.
        </p>
        <h3 className="text-sm font-medium text-zinc-200 mt-4">Available triggers</h3>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li><code>project_created</code> — first time a project is added via add-project / scan</li>
          <li><code>project_updated</code> — existing project refreshed</li>
          <li><code>scope_changed</code> — PROJECT_SCOPE.md (or equivalent) changes</li>
          <li><code>tech_stack_changed</code> — TECH_STACK.md changes</li>
          <li><code>significant_change</code> — a meaningful commit lands (caller-defined threshold)</li>
          <li><code>entity_added</code> — any new entity lands in the brain</li>
          <li><code>manual</code> — only fires when explicitly triggered</li>
        </ul>
        <h3 className="text-sm font-medium text-zinc-200 mt-4">Seeded starter playbooks</h3>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li><Link href="/playbooks/scaffold-project-docs" className="text-emerald-400 hover:underline">scaffold-project-docs</Link> — every new project needs STACK.md / PROJECT_SCOPE.md / CHANGELOG.md</li>
          <li><Link href="/playbooks/update-case-study" className="text-emerald-400 hover:underline">update-case-study</Link> — significant changes prompt a kumokodo.ai case-study review</li>
          <li><Link href="/playbooks/sweep-marketing-on-scope-change" className="text-emerald-400 hover:underline">sweep-marketing-on-scope-change</Link> — scope/stack changes prompt a sweep of marketing + help pages</li>
        </ul>
        <p className="mt-3">
          Browse <Link href="/playbooks" className="text-emerald-400 hover:underline">/playbooks</Link>{" "}
          to see them all, or create your own at{" "}
          <Link href="/playbooks/new" className="text-emerald-400 hover:underline">/playbooks/new</Link>.
        </p>
      </Section>

      <Section id="updating" title="Keeping your instance up to date">
        <p>
          Your Roushi deployment is an <strong>independent copy</strong> of the
          template — Vercel&apos;s deploy flow creates a fresh GitHub repo in
          your account with the template&apos;s code, NOT a fork. So upstream
          changes don&apos;t propagate automatically, and GitHub&apos;s UI
          &quot;Sync fork&quot; button doesn&apos;t appear on your repo. Two
          working paths to pull updates:
        </p>
        <ul className="ml-5 list-disc space-y-2">
          <li>
            <strong>Auto-PR workflow (recommended)</strong> — your repo ships with{" "}
            <code>.github/workflows/sync-upstream.yml</code> which runs daily,
            checks upstream for new commits, and opens a PR with the diff.{" "}
            <strong>One-time setup:</strong> on your repo, click the{" "}
            <strong>Actions</strong> tab → <strong>&quot;I understand my workflows, go ahead and enable them&quot;</strong>{" "}
            (GitHub disables Actions on new repos by default). After that, you&apos;ll
            get a PR titled <em>&quot;Sync from upstream (roushi-template)&quot;</em>{" "}
            whenever upstream ships — review + merge → Vercel redeploys.
          </li>
          <li>
            <strong>GitHub compare URL</strong> — opens a PR with the diff
            for review, no setup needed:{" "}
            <code>github.com/YOUR_USER/YOUR_REPO/compare/main...samwsimpson:roushi-template:main</code>.
            Replace <code>YOUR_USER</code> and <code>YOUR_REPO</code> with your
            handles. If GitHub says &quot;no common history&quot; — your repo
            was created from a template (not forked), use the CLI path below.
          </li>
          <li>
            <strong>CLI fallback</strong>:{" "}
            <code>git remote add upstream https://github.com/samwsimpson/roushi-template.git</code>{" "}
            then <code>git fetch upstream && git merge upstream/main --allow-unrelated-histories && git push origin main</code>.
            The <code>--allow-unrelated-histories</code> flag handles the
            template-created (non-fork) case.
          </li>
        </ul>
        <p className="text-zinc-400">
          Future: when Roushi ships as a managed SaaS, updates roll out
          automatically across all hosted instances and you don&apos;t manage
          repos at all. Self-hosted stays the path for operators who want to
          own the stack.
        </p>
      </Section>

      <Section id="patterns" title="Patterns — portfolio-wide automation">
        <p>
          <Link href="/patterns" className="text-emerald-400 hover:underline">/patterns</Link>{" "}
          shows the compliance matrix: every product × every available pattern, with
          status badges (applied, partial, not-applied, error). Patterns are typed,
          detectable, applicable transforms — &quot;snippet + env var + commit&quot;
          automation for things every project needs but everyone forgets.
        </p>
        <p>
          Three patterns ship in v0.13.0:
        </p>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li><strong>kumokodo-footer</strong> — adds the SaaS / client attribution per the portfolio rule</li>
          <li><strong>vercel-analytics</strong> — installs <code>@vercel/analytics</code> + <code>&lt;Analytics /&gt;</code></li>
          <li><strong>google-analytics</strong> — full GA Admin API automation: creates a GA4 property + data stream, installs <code>@next/third-parties</code>, edits the layout, sets <code>NEXT_PUBLIC_GA_ID</code> on Vercel, auto-commits</li>
        </ul>
        <p className="mt-3">CLI surface:</p>
        <pre className="mt-2 overflow-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300">
{`pnpm roushi pattern list                  # all patterns
pnpm roushi pattern detect                # status on current project
pnpm roushi pattern detect --portfolio    # matrix across every product
pnpm roushi pattern apply <slug>          # apply (auto-commits if repo is clean)`}
        </pre>
        <p>
          Apply auto-commits when the repo is clean. If WIP exists, it stages only and
          warns. Never auto-pushes. Each pattern lives at <code>src/patterns/&lt;slug&gt;.ts</code>{" "}
          and exports a <code>Pattern</code> with <code>detect()</code> + <code>apply()</code> —
          add new patterns by dropping a new file and an import line in <code>_registry.ts</code>.
        </p>
      </Section>

      <Section id="changelog" title="Public changelog">
        <p>
          The <Link href="/changelog" className="text-emerald-400 hover:underline">/changelog</Link>{" "}
          page renders <code>CHANGELOG.md</code> from the repo root. Per the{" "}
          <Link href="/playbooks/scaffold-project-docs" className="text-emerald-400 hover:underline">scaffold-project-docs</Link>{" "}
          playbook, every project should maintain its own CHANGELOG.md and surface it publicly.
          That's how users see what's shipping.
        </p>
      </Section>

      <Section id="auth" title="Auth setup">
        <p>
          When the header shows an amber "no auth" pill, the GitHub OAuth app isn't configured.
          Walkthrough lives in <code>AUTH.md</code> at the repo root — five minutes of setup,
          three env vars, one restart.
        </p>
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 space-y-3 text-sm leading-relaxed">
      <h2 className="text-lg font-medium text-zinc-100">{title}</h2>
      {children}
    </section>
  );
}

function Type({
  color,
  type,
  label,
  note,
}: {
  color: string;
  type: string;
  label: string;
  note: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded border border-zinc-900 bg-zinc-950 p-2.5">
      <span className={`mt-0.5 shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${color}`}>
        {type}
      </span>
      <div>
        <p className="font-medium text-zinc-200">{label}</p>
        <p className="text-zinc-500">{note}</p>
      </div>
    </div>
  );
}

function Edge({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="rounded border border-zinc-900 bg-zinc-950 p-2.5">
      <code className="text-xs text-yellow-400">{name}</code>
      <p className="mt-0.5 text-xs text-zinc-500">{desc}</p>
    </div>
  );
}

function Cmd({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <tr className="border-t border-zinc-900">
      <td className="py-1.5 pr-4 align-top text-zinc-200">{cmd}</td>
      <td className="py-1.5 align-top text-zinc-500">{desc}</td>
    </tr>
  );
}
