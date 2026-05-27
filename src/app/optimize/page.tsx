import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import { goals } from "../../db/schema";
import { auditEdges } from "../../lib/audit";
import { DEFAULT_STALE_DAYS, listStaleEntities } from "../../lib/decay";
import { findDuplicateGroups } from "../../lib/dedupe";
import {
  ApplyAllFixesButton,
  FixEdgeButton,
  MergeButton,
  RunContradictionScanButton,
  TouchButton,
} from "../components/OptimizeActions";

export const metadata = {
  title: "Optimize — Roushi",
};

// Force fresh data — these are operator tools, stale results would mislead.
export const dynamic = "force-dynamic";

interface LatestContradictionGoal {
  id: string;
  title: string;
  description: string;
  updatedAt: Date;
}

async function loadLatestContradictionGoal(): Promise<LatestContradictionGoal | null> {
  const rows = await db.execute<{ id: string; title: string; description: string; updated_at: string }>(sql`
    SELECT id, title, description, updated_at::text AS updated_at
    FROM ${goals}
    WHERE title LIKE '[system] Maintenance:%contradiction%'
    ORDER BY updated_at DESC
    LIMIT 1
  `);
  const r = rows.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    updatedAt: new Date(r.updated_at),
  };
}

export default async function OptimizePage() {
  const [findings, groups, stale, latestContradictionGoal] = await Promise.all([
    auditEdges(),
    findDuplicateGroups(),
    listStaleEntities(),
    loadLatestContradictionGoal(),
  ]);
  const wrong = findings.filter((f) => f.severity === "wrong");
  const suspect = findings.filter((f) => f.severity === "suspect");
  const fixable = suspect.filter((f) => f.suggestion !== null);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-light text-zinc-100">Optimize</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Health checks against the <strong>Roushi brain itself</strong> — its entities, edges,
          and rule library. Nothing here touches any project's source code; these fixes update
          metadata <em>inside Roushi</em> (relabeling an edge, merging two near-duplicate slugs,
          marking an entity as recently validated, surfacing two rules that contradict each other).
          The brain is what gets cleaner — your repos are untouched.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-zinc-500">
          Four checks: <strong>Audit</strong> spots mismatched edge relations (e.g. an edge labeled{" "}
          <code>depends_on</code> that should be <code>uses</code>). <strong>Dedupe</strong> finds
          near-duplicate slugs (string + embedding similarity within each type).{" "}
          <strong>Decay</strong> surfaces entities unvalidated in &gt;{DEFAULT_STALE_DAYS} days.{" "}
          <strong>Contradictions</strong> finds pairs of close-embedding rules/decisions/lessons
          whose claims an LLM judges as directly conflicting. Every fix requires confirmation —
          no surprise auto-applies. A cron runs all four on a schedule and posts findings as{" "}
          <code>[system]</code> goals on{" "}
          <Link href="/goals" className="text-emerald-400 hover:underline">/goals</Link>.
        </p>
      </header>

      {/* ─── Audit ────────────────────────────────────────── */}
      <Section
        title="Edge audit"
        count={findings.length}
        countLabel="flagged"
        empty="No edge-quality issues — every edge matches its canonical relation."
        right={fixable.length > 0 ? <ApplyAllFixesButton count={fixable.length} /> : null}
      >
        {wrong.length > 0 ? (
          <SubSection label={`${wrong.length} wrong`} color="text-red-400">
            {wrong.map((f) => (
              <Finding
                key={f.edge.id}
                from={f.from}
                to={f.to}
                relation={f.edge.relation}
                reason={f.reason}
                suggestion={null}
                edgeId={f.edge.id}
              />
            ))}
          </SubSection>
        ) : null}
        {suspect.length > 0 ? (
          <SubSection label={`${suspect.length} suspect`} color="text-yellow-400">
            {suspect.map((f) => (
              <Finding
                key={f.edge.id}
                from={f.from}
                to={f.to}
                relation={f.edge.relation}
                reason={f.reason}
                suggestion={f.suggestion}
                edgeId={f.edge.id}
              />
            ))}
          </SubSection>
        ) : null}
      </Section>

      {/* ─── Dedupe ───────────────────────────────────────── */}
      <Section
        title="Near-duplicate entities"
        count={groups.length}
        countLabel="group(s)"
        empty="No probable duplicates found in any type."
      >
        <ul className="divide-y divide-zinc-900">
          {groups.map((g, i) => (
            <li key={i} className="py-3">
              <p className="mb-2 text-sm">
                <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                  {g.canonical.type}
                </span>{" "}
                <Link href={`/entities/${g.canonical.slug}`} className="text-zinc-200 hover:text-emerald-400">
                  {g.canonical.name}
                </Link>{" "}
                <span className="text-xs text-zinc-600">({g.canonical.slug}) ← canonical</span>
              </p>
              <ul className="ml-4 space-y-1">
                {g.candidates.map((c) => (
                  <li
                    key={c.entity.id}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="text-zinc-700">→</span>
                    <Link href={`/entities/${c.entity.slug}`} className="text-zinc-200 hover:text-emerald-400">
                      {c.entity.name}
                    </Link>
                    <span className="text-xs text-zinc-600">({c.entity.slug})</span>
                    <span
                      className={`text-xs ${c.confidence > 0.8 ? "text-red-300" : "text-yellow-400"}`}
                    >
                      conf {c.confidence.toFixed(2)}
                    </span>
                    {c.embeddingDistance !== null ? (
                      <span className="text-xs text-zinc-600">emb-dist {c.embeddingDistance.toFixed(3)}</span>
                    ) : null}
                    <span className="ml-auto">
                      <MergeButton
                        canonicalId={g.canonical.id}
                        duplicateId={c.entity.id}
                        canonicalName={g.canonical.name}
                        duplicateName={c.entity.name}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      {/* ─── Contradictions ───────────────────────────────── */}
      <section className="mb-10 rounded-md border border-zinc-900 bg-zinc-950 p-5">
        <header className="mb-3 flex items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="text-lg font-medium text-zinc-100">Contradictions</h2>
            <span className="text-sm text-zinc-500">
              {latestContradictionGoal
                ? `last cron run: ${latestContradictionGoal.updatedAt.toLocaleString()}`
                : "no scan run yet"}
            </span>
          </div>
          <RunContradictionScanButton />
        </header>
        {latestContradictionGoal ? (
          <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-amber-900/60 bg-amber-950/20 p-4 text-sm leading-relaxed text-amber-100/80">
            {latestContradictionGoal.description}
          </pre>
        ) : (
          <p className="text-sm text-zinc-400">
            The weekly cron at <code className="rounded bg-zinc-900 px-1.5 py-0.5">/api/cron/contradictions</code>{" "}
            (Sunday 6am UTC) runs the scan automatically and posts findings as a system goal on{" "}
            <Link href="/goals" className="text-emerald-400 hover:underline">/goals</Link>. Click{" "}
            <strong>Run contradiction scan now</strong> above to run it on demand — takes 30–60s and
            costs ~$0.01.
          </p>
        )}
      </section>

      {/* ─── Decay ────────────────────────────────────────── */}
      <Section
        title={`Stale entities (>${DEFAULT_STALE_DAYS} days)`}
        count={stale.length}
        countLabel="stale"
        empty={`Nothing's gone stale — every entity has been validated within ${DEFAULT_STALE_DAYS} days.`}
      >
        <ul className="divide-y divide-zinc-900">
          {stale.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-2 text-sm">
              <span className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                {s.type}
              </span>
              <Link href={`/entities/${s.slug}`} className="text-zinc-200 hover:text-emerald-400">
                {s.name}
              </Link>
              <span className="text-xs text-zinc-600">({s.slug})</span>
              <span className="text-xs text-yellow-400">{s.daysSinceValidation}d old</span>
              <span className="ml-auto">
                <TouchButton slug={s.slug} />
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  );
}

function Section({
  title,
  count,
  countLabel,
  empty,
  right,
  children,
}: {
  title: string;
  count: number;
  countLabel: string;
  empty: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="mb-10 rounded-md border border-zinc-900 bg-zinc-950 p-5">
      <header className="mb-4 flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-medium text-zinc-100">{title}</h2>
          <span className="text-sm text-zinc-500">
            {count} {countLabel}
          </span>
        </div>
        {right}
      </header>
      {count === 0 ? <p className="text-sm text-emerald-400">✓ {empty}</p> : children}
    </section>
  );
}

function SubSection({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className={`mb-2 text-xs uppercase tracking-wider ${color}`}>{label}</h3>
      <ul className="divide-y divide-zinc-900">{children}</ul>
    </div>
  );
}

function Finding({
  from,
  to,
  relation,
  reason,
  suggestion,
  edgeId,
}: {
  from: { slug: string; name: string; type: string };
  to: { slug: string; name: string; type: string };
  relation: string;
  reason: string;
  suggestion: string | null;
  edgeId: string;
}) {
  return (
    <li className="py-2 text-sm">
      <div className="flex items-baseline gap-2">
        <Link href={`/entities/${from.slug}`} className="text-zinc-200 hover:text-emerald-400">
          {from.name}
        </Link>
        <span className="text-xs text-zinc-600">({from.type})</span>
        <span className="font-mono text-xs text-yellow-400">-[{relation}]→</span>
        <Link href={`/entities/${to.slug}`} className="text-zinc-200 hover:text-emerald-400">
          {to.name}
        </Link>
        <span className="text-xs text-zinc-600">({to.type})</span>
        {suggestion ? (
          <span className="ml-auto">
            <FixEdgeButton edgeId={edgeId} newRelation={suggestion} />
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">{reason}</p>
    </li>
  );
}
