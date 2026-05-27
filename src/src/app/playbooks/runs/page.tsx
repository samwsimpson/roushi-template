import Link from "next/link";
import { listInvocations } from "../../../lib/invocations";
import { IntroPanel } from "../../components/IntroPanel";

export const metadata = {
  title: "Playbook runs — Roushi",
};

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-900/60 bg-yellow-950/40",
  in_progress: "text-cyan-400 border-cyan-900/60 bg-cyan-950/40",
  completed: "text-emerald-400 border-emerald-900/60 bg-emerald-950/40",
  abandoned: "text-zinc-500 border-zinc-800 bg-zinc-900/40",
};

export default async function PlaybookRunsPage() {
  const all = await listInvocations({ limit: 200 });
  const active = all.filter((r) => r.invocation.status === "pending" || r.invocation.status === "in_progress");
  const completed = all.filter((r) => r.invocation.status === "completed");
  const abandoned = all.filter((r) => r.invocation.status === "abandoned");

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <IntroPanel
        storageKey="roushi-intro-playbook-runs"
        title="Playbook invocations"
        helpAnchor="#playbooks"
      >
        Each row is one time a playbook fired (e.g. when you added a project that matched its trigger).
        Open any run to see its action checklist — approve, skip, or fail each action as you work
        through it. Roushi doesn't auto-execute actions yet; this page is your tracked review queue.
      </IntroPanel>

      <div className="mb-6">
        <h1 className="text-xl font-light text-zinc-200">
          {active.length} active <span className="text-zinc-500">/ {all.length} total runs</span>
        </h1>
        <p className="text-sm text-zinc-500">
          <Link href="/playbooks" className="hover:text-zinc-300">← All playbooks</Link>
        </p>
      </div>

      <RunSection title="Active" runs={active} emptyMsg="No active invocations. Add a project to fire one." />
      {completed.length > 0 ? <RunSection title="Completed" runs={completed} emptyMsg="" /> : null}
      {abandoned.length > 0 ? <RunSection title="Abandoned" runs={abandoned} emptyMsg="" /> : null}
    </main>
  );
}

function RunSection({
  title,
  runs,
  emptyMsg,
}: {
  title: string;
  runs: Awaited<ReturnType<typeof listInvocations>>;
  emptyMsg: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{title}</h2>
      {runs.length === 0 ? (
        emptyMsg ? <p className="text-sm text-zinc-500">{emptyMsg}</p> : null
      ) : (
        <ul className="divide-y divide-zinc-900 rounded-md border border-zinc-900">
          {runs.map((r) => {
            const color = STATUS_COLORS[r.invocation.status] ?? STATUS_COLORS.pending;
            return (
              <li key={r.invocation.id} className="flex items-center gap-4 px-4 py-3 transition hover:bg-zinc-950/60">
                <span className={`shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${color}`}>
                  {r.invocation.status}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <Link
                      href={`/playbooks/runs/${r.invocation.id}`}
                      className="text-base text-zinc-100 transition hover:text-emerald-400"
                    >
                      {r.playbook.name}
                    </Link>
                    <span className="text-xs text-zinc-600">{r.playbook.slug}</span>
                    <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
                      {r.invocation.eventTrigger}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    <span>
                      {r.completedActionCount}/{r.actions.length} done
                    </span>
                    {r.pendingActionCount > 0 ? (
                      <span className="text-yellow-400">{r.pendingActionCount} pending</span>
                    ) : null}
                    {r.entity ? (
                      <Link href={`/entities/${r.entity.slug}`} className="hover:text-zinc-300">
                        on {r.entity.name}
                      </Link>
                    ) : null}
                    <span className="text-zinc-700">
                      {r.invocation.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/playbooks/runs/${r.invocation.id}`}
                  className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 transition hover:border-zinc-500"
                >
                  open →
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
