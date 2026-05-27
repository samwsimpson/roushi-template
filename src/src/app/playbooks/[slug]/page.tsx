import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlaybookBySlug } from "../../../lib/playbooks";
import { RemovePlaybookForm } from "../../components/RemovePlaybookForm";

interface Props {
  params: Promise<{ slug: string }>;
}

const TRIGGER_LABELS: Record<string, string> = {
  project_created: "Project created",
  project_updated: "Project updated",
  scope_changed: "Scope changed",
  tech_stack_changed: "Tech stack changed",
  significant_change: "Significant change",
  entity_added: "Entity added",
  manual: "Manual",
};

export default async function PlaybookDetailPage({ params }: Props) {
  const { slug } = await params;
  const p = await getPlaybookBySlug(slug);
  if (!p) notFound();

  const filterEntries = Object.entries(p.filter as Record<string, unknown>);

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link href="/playbooks" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← All playbooks
        </Link>
      </div>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="shrink-0 rounded border border-cyan-900/60 bg-cyan-950/40 px-2 py-0.5 text-[11px] uppercase tracking-wide text-cyan-300">
              {TRIGGER_LABELS[p.trigger] ?? p.trigger}
            </span>
            <h1 className="truncate text-3xl font-light text-zinc-100">{p.name}</h1>
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-500">{p.slug}</p>
          {!p.active ? (
            <p className="mt-2 inline-block rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-500">
              draft — won't fire until activated
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <RemovePlaybookForm slug={p.slug} name={p.name} />
        </div>
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-md border border-zinc-900 bg-zinc-950 p-4 text-sm">
        <Pair label="Trigger">
          <code className="font-mono text-xs text-cyan-300">{p.trigger}</code>
        </Pair>
        <Pair label="Active">{p.active ? "yes" : "no"}</Pair>
        <Pair label="Created">{formatDate(p.createdAt)}</Pair>
        <Pair label="Updated">{formatDate(p.updatedAt)}</Pair>
        {p.appliesToSlugs.length > 0 ? (
          <Pair label="Applies to">
            <div className="flex flex-wrap gap-1">
              {p.appliesToSlugs.map((s) => (
                <Link
                  key={s}
                  href={`/entities/${s}`}
                  className="rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-300 hover:border-zinc-600"
                >
                  {s}
                </Link>
              ))}
            </div>
          </Pair>
        ) : (
          <Pair label="Applies to">
            <span className="text-xs text-zinc-500">all matching entities</span>
          </Pair>
        )}
        {filterEntries.length > 0 ? (
          <Pair label="Filter">
            <code className="font-mono text-xs text-zinc-300">{JSON.stringify(p.filter)}</code>
          </Pair>
        ) : null}
      </dl>

      {p.description ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-500">Description</h2>
          <p className="whitespace-pre-wrap rounded-md border border-zinc-900 bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-300">
            {p.description}
          </p>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-500">
          Actions ({p.actions.length})
        </h2>
        <ol className="space-y-2 rounded-md border border-zinc-900 bg-zinc-950 p-4">
          {p.actions.map((a, i) => (
            <li key={i} className="flex items-baseline gap-3 text-sm leading-relaxed">
              <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">
                {i + 1}
              </span>
              <span className="text-zinc-200">{a}</span>
            </li>
          ))}
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
