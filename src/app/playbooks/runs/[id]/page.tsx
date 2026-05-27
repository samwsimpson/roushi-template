import Link from "next/link";
import { notFound } from "next/navigation";
import { listInvocations } from "../../../../lib/invocations";
import { AbandonInvocationButton, SetActionStatusButton } from "../../../components/ActionStatusButtons";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const ACTION_COLORS: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-900/60",
  completed: "text-emerald-400 border-emerald-900/60",
  rejected: "text-zinc-500 border-zinc-800",
  failed: "text-red-400 border-red-900/60",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "text-yellow-400 border-yellow-900/60 bg-yellow-950/40",
  in_progress: "text-cyan-400 border-cyan-900/60 bg-cyan-950/40",
  completed: "text-emerald-400 border-emerald-900/60 bg-emerald-950/40",
  abandoned: "text-zinc-500 border-zinc-800 bg-zinc-900/40",
};

export default async function InvocationDetailPage({ params }: Props) {
  const { id } = await params;
  const all = await listInvocations({ limit: 500 });
  const r = all.find((x) => x.invocation.id === id);
  if (!r) notFound();

  const statusColor = STATUS_BADGE[r.invocation.status] ?? STATUS_BADGE.pending;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link href="/playbooks/runs" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← All runs
        </Link>
      </div>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className={`shrink-0 rounded border px-2 py-0.5 text-[11px] uppercase tracking-wide ${statusColor}`}>
              {r.invocation.status}
            </span>
            <h1 className="truncate text-2xl font-light text-zinc-100">{r.playbook.name}</h1>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            <Link href={`/playbooks/${r.playbook.slug}`} className="hover:text-zinc-300">
              playbook: {r.playbook.slug}
            </Link>
            {" · "}
            <span className="font-mono">run {r.invocation.id.slice(0, 8)}</span>
          </p>
        </div>
        {r.invocation.status !== "completed" && r.invocation.status !== "abandoned" ? (
          <AbandonInvocationButton invocationId={r.invocation.id} playbookName={r.playbook.name} />
        ) : null}
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-md border border-zinc-900 bg-zinc-950 p-4 text-sm">
        <Pair label="Triggered by">
          <code className="font-mono text-xs text-cyan-300">{r.invocation.eventTrigger}</code>
        </Pair>
        {r.entity ? (
          <Pair label="Entity">
            <Link href={`/entities/${r.entity.slug}`} className="text-zinc-200 hover:text-emerald-400">
              {r.entity.name} <span className="text-zinc-600">({r.entity.slug})</span>
            </Link>
          </Pair>
        ) : null}
        <Pair label="Created">{formatDate(r.invocation.createdAt)}</Pair>
        <Pair label="Updated">{formatDate(r.invocation.updatedAt)}</Pair>
        <Pair label="Progress">
          {r.completedActionCount} of {r.actions.length} completed
          {r.pendingActionCount > 0 ? ` · ${r.pendingActionCount} pending` : ""}
        </Pair>
      </dl>

      {Object.keys(r.invocation.eventContext as object).length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-500">Event context</h2>
          <pre className="overflow-x-auto rounded-md border border-zinc-900 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
            {JSON.stringify(r.invocation.eventContext, null, 2)}
          </pre>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-500">Action checklist</h2>
        <ol className="space-y-3">
          {r.actions.map((a) => {
            const color = ACTION_COLORS[a.status] ?? ACTION_COLORS.pending ?? "text-zinc-400 border-zinc-800";
            const isOpen = a.status === "pending";
            return (
              <li
                key={a.id}
                className={`rounded-md border bg-zinc-950 p-3 ${color}`}
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-zinc-500">{a.actionIndex + 1}.</span>
                  <div className="flex-1">
                    <p className="text-sm text-zinc-100">{a.actionText}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      status: <span className={color.split(" ")[0] ?? "text-zinc-400"}>{a.status}</span>
                      {a.completedAt ? ` · ${formatDate(a.completedAt)}` : ""}
                      {a.completedBy ? ` · by ${a.completedBy}` : ""}
                    </p>
                    {a.notes ? (
                      <p className="mt-1 rounded bg-zinc-900 p-2 text-xs text-zinc-300">{a.notes}</p>
                    ) : null}
                  </div>
                  {isOpen ? (
                    <div className="flex shrink-0 gap-2">
                      <SetActionStatusButton
                        invocationId={r.invocation.id}
                        actionIndex={a.actionIndex}
                        status="completed"
                      />
                      <SetActionStatusButton
                        invocationId={r.invocation.id}
                        actionIndex={a.actionIndex}
                        status="rejected"
                      />
                      <SetActionStatusButton
                        invocationId={r.invocation.id}
                        actionIndex={a.actionIndex}
                        status="failed"
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

function Pair({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="w-32 shrink-0 text-zinc-500">{label}</dt>
      <dd className="text-zinc-200">{children}</dd>
    </div>
  );
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
