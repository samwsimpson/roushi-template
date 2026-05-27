import Link from "next/link";
import { listGoals } from "../../lib/goals";
import { isRecent, relativeTime } from "../../lib/format-time";
import { lastRunByKind, listRecentRuns } from "../../lib/maintenance";
import { GoalStatusButtons } from "../components/GoalStatusButtons";
import { NewGoalForm } from "../components/NewGoalForm";

export const metadata = {
  title: "Goals — Roushi",
};

// Force fresh data — goals change via Server Actions and we want the
// latest list every visit.
export const dynamic = "force-dynamic";

// System-managed goals (created/updated/completed by the maintenance cron)
// share a title prefix — we use it to suppress manual status buttons since
// the cron owns the lifecycle.
const SYSTEM_GOAL_PREFIX = "[system] Maintenance:";

const STATUS_STYLE: Record<string, string> = {
  active: "text-emerald-400 border-emerald-900/60 bg-emerald-950/40",
  completed: "text-zinc-400 border-zinc-800 bg-zinc-900/40",
  blocked: "text-amber-400 border-amber-900/60 bg-amber-950/40",
  abandoned: "text-zinc-600 border-zinc-900 bg-zinc-950/40",
};

interface PageProps {
  searchParams: Promise<{ show?: string }>;
}

export default async function GoalsPage({ searchParams }: PageProps) {
  const { show } = await searchParams;
  // Default view hides completed + abandoned to keep the page focused on
  // pending work. `?show=all` flips it.
  const showAll = show === "all";

  // Sort by updated_at DESC so the freshest activity (manual edits AND
  // cron updates) bubbles to the top — that's the answer to "is anything
  // new?".
  const [all, recentRuns, lastByKind] = await Promise.all([
    listGoals({ limit: 200 }).then((rows) =>
      rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    ),
    listRecentRuns(8),
    lastRunByKind(),
  ]);
  const active = all.filter((g) => g.status === "active");
  const blocked = all.filter((g) => g.status === "blocked");
  const completed = all.filter((g) => g.status === "completed");
  const abandoned = all.filter((g) => g.status === "abandoned");

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-zinc-100">Goals</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Multi-week objectives the brain remembers across sessions. Active goals surface on the
            homepage and are searchable by agents via{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5">mcp__roushi__roushi_goal_list</code>.
            <span className="text-zinc-500">
              {" "}
              System goals (prefixed <code className="text-zinc-500">[system]</code>) are
              opened, updated, and closed by the maintenance cron automatically.
            </span>
          </p>
        </div>
        <Link
          href={showAll ? "/goals" : "/goals?show=all"}
          className="shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
        >
          {showAll
            ? `Hide closed (${completed.length + abandoned.length})`
            : `Show closed (${completed.length + abandoned.length})`}
        </Link>
      </header>

      <NewGoalForm />

      <GoalSection title="Active" goals={active} status="active" />
      {blocked.length > 0 ? <GoalSection title="Blocked" goals={blocked} status="blocked" /> : null}
      {showAll ? <GoalSection title="Completed" goals={completed} status="completed" /> : null}
      {showAll && abandoned.length > 0 ? (
        <GoalSection title="Abandoned" goals={abandoned} status="abandoned" />
      ) : null}

      <MaintenanceActivity runs={recentRuns} lastByKind={lastByKind} />
      <MaintenanceSchedule />
    </main>
  );
}

function MaintenanceActivity({
  runs,
  lastByKind,
}: {
  runs: Awaited<ReturnType<typeof listRecentRuns>>;
  lastByKind: Awaited<ReturnType<typeof lastRunByKind>>;
}) {
  const kinds: Array<{ key: string; label: string }> = [
    { key: "decay", label: "Decay" },
    { key: "audit-edges", label: "Audit edges" },
    { key: "dedupe", label: "Dedupe" },
    { key: "contradictions", label: "Contradictions" },
  ];

  if (runs.length === 0) {
    return (
      <section className="mt-12 rounded-md border border-zinc-900 bg-zinc-950/40 p-4">
        <h2 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
          Recent cron activity
        </h2>
        <p className="text-xs text-zinc-500">
          No maintenance runs logged yet. Crons fire on the schedule below; activity will appear
          here after the first run.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-12 rounded-md border border-zinc-900 bg-zinc-950/40 p-4">
      <h2 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
        Recent cron activity
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Every maintenance scan logs a row here regardless of whether it created a goal — so you can
        tell &quot;the cron didn&apos;t fire&quot; from &quot;the cron fired and found nothing.&quot;
      </p>

      {/* Per-kind last-run grid */}
      <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {kinds.map(({ key, label }) => {
          const last = lastByKind[key];
          return (
            <li
              key={key}
              className="flex items-baseline justify-between gap-3 rounded border border-zinc-900 bg-zinc-950 px-3 py-2 text-xs"
            >
              <span className="font-medium text-zinc-300">{label}</span>
              {last ? (
                <span className="text-right">
                  <span
                    className={
                      last.findingsCount > 0
                        ? "text-amber-300"
                        : "text-zinc-500"
                    }
                  >
                    {last.findingsCount} finding{last.findingsCount === 1 ? "" : "s"}
                  </span>
                  <span className="ml-2 text-zinc-600">{relativeTime(last.ranAt)}</span>
                </span>
              ) : (
                <span className="text-zinc-600">never run</span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Recent invocations list */}
      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
          Last {runs.length} invocations
        </summary>
        <ul className="mt-2 space-y-1">
          {runs.map((r) => {
            const goalLabel: Record<string, string> = {
              created: "goal created",
              updated: "goal updated",
              completed: "goal auto-closed",
              noop: "no change",
            };
            return (
              <li
                key={r.id}
                className="grid grid-cols-[110px_1fr_auto] items-baseline gap-3 border-b border-zinc-900 py-1.5 last:border-0"
              >
                <span className="font-medium text-zinc-300">{r.kind}</span>
                <span className="text-zinc-500">
                  {r.findingsCount} finding{r.findingsCount === 1 ? "" : "s"}
                  {" · "}
                  <span className="text-zinc-600">{goalLabel[r.goalAction] ?? r.goalAction}</span>
                  {" · "}
                  <span className="text-zinc-600">{r.durationMs}ms</span>
                </span>
                <span className="text-zinc-600" title={r.ranAt.toISOString()}>
                  {relativeTime(r.ranAt)}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

function GoalSection({
  title,
  goals,
  status,
}: {
  title: string;
  goals: Awaited<ReturnType<typeof listGoals>>;
  status: string;
}) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.completed;
  return (
    <section className="mb-10">
      <h2 className="mb-3 flex items-baseline gap-3 text-xs uppercase tracking-wider text-zinc-500">
        {title}
        <span className="text-zinc-700">({goals.length})</span>
      </h2>
      {goals.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-900 bg-zinc-950/40 px-3 py-4 text-sm text-zinc-500">
          No {title.toLowerCase()} goals.
        </p>
      ) : (
        <ul className="space-y-2">
          {goals.map((g) => {
            const systemManaged = g.title.startsWith(SYSTEM_GOAL_PREFIX);
            const created = new Date(g.createdAt);
            const updated = new Date(g.updatedAt);
            // Only show "updated X ago" if it differs meaningfully from
            // created (>60s) — a brand-new goal shouldn't show both lines.
            const wasUpdatedAfterCreate = updated.getTime() - created.getTime() > 60 * 1000;
            const fresh = isRecent(updated, 24);
            return (
              <li key={g.id} className="rounded-md border border-zinc-900 bg-zinc-950 px-4 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-2">
                    {fresh ? (
                      <span
                        title="Updated in the last 24 hours"
                        className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"
                      />
                    ) : null}
                    <span className="text-base text-zinc-100">{g.title}</span>
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3">
                    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${style}`}>
                      {g.status}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {g.targetDate
                        ? `due ${new Date(g.targetDate).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}`
                        : "no target"}
                    </span>
                  </div>
                </div>
                {g.description ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{g.description}</p>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] text-zinc-600" title={`created ${created.toISOString()} · updated ${updated.toISOString()}`}>
                    created {relativeTime(created)}
                    {wasUpdatedAfterCreate ? ` · updated ${relativeTime(updated)}` : null}
                  </span>
                  <GoalStatusButtons
                    goalId={g.id}
                    current={g.status as "active" | "completed" | "blocked" | "abandoned"}
                    systemManaged={systemManaged}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Static-ish info panel: the maintenance crons' schedules + what each one
// does. Surfaced here because system goals are scarce-by-design (only
// posted when a scan exceeds its threshold) and Sam asked "did the cron
// fire?" without anything visible to confirm. Hard-coded from vercel.ts —
// if you change the schedules there, mirror them here.
function MaintenanceSchedule() {
  const items = [
    {
      kind: "Decay",
      schedule: "Daily 3am UTC",
      what: "≥5 entities unvalidated for 90+ days",
    },
    {
      kind: "Audit edges",
      schedule: "Sundays 4am UTC",
      what: "≥10 edges with wrong / non-canonical relations",
    },
    {
      kind: "Dedupe",
      schedule: "1st of month 5am UTC",
      what: "≥1 near-duplicate group within a type",
    },
    {
      kind: "Contradictions",
      schedule: "Sundays 6am UTC",
      what: "≥1 pair of close-embedding rules/decisions/lessons that conflict",
    },
  ];
  return (
    <section className="mt-12 rounded-md border border-zinc-900 bg-zinc-950/40 p-4">
      <h2 className="mb-3 text-xs uppercase tracking-wider text-zinc-500">
        Maintenance schedule
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Goals show up here automatically when these scans cross their thresholds. If a scan finds
        nothing, no goal is posted (and any prior open goal of that kind is auto-completed).
      </p>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.kind} className="grid grid-cols-[120px_180px_1fr] gap-3 text-xs">
            <span className="font-medium text-zinc-300">{it.kind}</span>
            <span className="text-zinc-500">{it.schedule}</span>
            <span className="text-zinc-500">posts when {it.what}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
