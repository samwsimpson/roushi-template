import Link from "next/link";
import { notFound } from "next/navigation";
import { refreshProjectAction } from "../../actions";
import { IntroPanel } from "../../components/IntroPanel";
import { RemoveEntityForm } from "../../components/RemoveEntityForm";
import { Tooltip } from "../../components/Tooltip";
import { getEdgesForEntity, getEntityBySlug } from "../../lib/queries";

// Queries the brain on every load — must be dynamic. Build-time prerendering
// would crash on a fresh deploy where the entities table doesn't exist yet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

const TYPE_COLORS: Record<string, string> = {
  product: "text-emerald-400 border-emerald-900/60 bg-emerald-950/40",
  tech: "text-sky-400 border-sky-900/60 bg-sky-950/40",
  vendor: "text-amber-400 border-amber-900/60 bg-amber-950/40",
  pattern: "text-violet-400 border-violet-900/60 bg-violet-950/40",
  decision: "text-rose-400 border-rose-900/60 bg-rose-950/40",
  lesson: "text-zinc-400 border-zinc-800 bg-zinc-900/40",
  incident: "text-orange-400 border-orange-900/60 bg-orange-950/40",
  goal: "text-yellow-400 border-yellow-900/60 bg-yellow-950/40",
};

const RELATION_TOOLTIPS: Record<string, string> = {
  uses: "Product imports / depends on tech",
  hosted_on: "Product runs on vendor / paid service",
  defined_by: "Product implements a reusable pattern",
  led_to: "Product / situation produced this decision",
  depends_on: "Soft dependency / lesson must be heeded",
  applies_to: "Pattern or decision applies cross-cuttingly",
  mentions: "Soft reference when nothing better fits",
  supersedes: "Newer decision replacing an older one",
  blocks: "Goal blocked by another goal or incident",
  shares_pattern: "Two products implement the same pattern",
};

export default async function EntityDetailPage({ params }: Props) {
  const { slug } = await params;
  const entity = await getEntityBySlug(slug);
  if (!entity) notFound();

  const allEdges = await getEdgesForEntity(entity.id);
  const outgoing = allEdges.filter((e) => e.direction === "outgoing");
  const incoming = allEdges.filter((e) => e.direction === "incoming");

  const colorClass = TYPE_COLORS[entity.type] ?? TYPE_COLORS.lesson;
  const fm = (entity.frontmatter ?? {}) as Record<string, unknown>;
  const isClientWork = fm.client_work === true;
  const client = typeof fm.client === "string" ? fm.client : null;
  const endClient = typeof fm.end_client === "string" ? fm.end_client : null;
  const wasExtracted = fm.extracted === true;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Back</Link>
      </div>

      <IntroPanel
        storageKey="roushi-intro-entity-detail"
        title="Entity detail"
        helpAnchor="#edges"
      >
        Every entity is a node in the brain graph. <strong>Outgoing</strong> edges go from this
        entity to others (e.g. a product → tech it uses). <strong>Incoming</strong> edges come from
        others pointing here (e.g. all products that <code>uses</code> this tech). Edges are
        grouped by relation type. Click any linked entity to follow the graph. The{" "}
        <strong>Refresh</strong> button on products re-runs LLM extraction with the latest docs.
      </IntroPanel>

      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span
              className={`shrink-0 rounded border px-2 py-0.5 text-[11px] uppercase tracking-wide ${colorClass}`}
            >
              {entity.type}
            </span>
            <h1 className="truncate text-3xl font-light text-zinc-100">{entity.name}</h1>
          </div>
          <p className="mt-2 font-mono text-xs text-zinc-500">{entity.slug}</p>
          {isClientWork ? (
            <p className="mt-2 inline-block rounded bg-amber-950/60 px-2 py-0.5 text-xs text-amber-300">
              KumoKodo Studio client work{client ? ` — ${client}` : ""}{endClient ? ` → ${endClient}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {entity.sourcePath && entity.type === "product" ? (
            <form action={refreshProjectAction}>
              <input type="hidden" name="path" value={entity.sourcePath} />
              <input type="hidden" name="slug" value={entity.slug} />
              <button
                type="submit"
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
              >
                Refresh
              </button>
            </form>
          ) : null}
          <RemoveEntityForm slug={entity.slug} name={entity.name} />
        </div>
      </header>

      <dl className="mb-6 grid grid-cols-2 gap-x-8 gap-y-2 rounded-md border border-zinc-900 bg-zinc-950 p-4 text-sm">
        {entity.sourcePath ? (
          <Pair label="Source path">
            <span className="font-mono text-xs text-zinc-300">{entity.sourcePath}</span>
          </Pair>
        ) : null}
        <Pair label="Created">{formatDate(entity.createdAt)}</Pair>
        <Pair label="Updated">{formatDate(entity.updatedAt)}</Pair>
        <Pair label="Last validated">{formatDate(entity.lastValidatedAt)}</Pair>
        <Pair label="Outgoing edges">{outgoing.length}</Pair>
        <Pair label="Incoming edges">{incoming.length}</Pair>
        {wasExtracted ? (
          <Pair label="Origin">
            <span className="text-xs text-violet-300">LLM-extracted</span>
          </Pair>
        ) : null}
      </dl>

      {entity.description ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-500">Description</h2>
          <div className="whitespace-pre-wrap rounded-md border border-zinc-900 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
            {entity.description}
          </div>
        </section>
      ) : null}

      <EdgeSection title={`Outgoing (${outgoing.length})`} edges={outgoing} />
      <EdgeSection title={`Incoming (${incoming.length})`} edges={incoming} />
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

function EdgeSection({
  title,
  edges,
}: {
  title: string;
  edges: Awaited<ReturnType<typeof getEdgesForEntity>>;
}) {
  if (edges.length === 0) return null;
  const grouped = new Map<string, typeof edges>();
  for (const e of edges) {
    const k = e.edge.relation;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)?.push(e);
  }
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="space-y-3">
        {[...grouped.entries()].map(([relation, group]) => (
          <div key={relation} className="rounded-md border border-zinc-900 bg-zinc-950 p-3">
            <Tooltip text={RELATION_TOOLTIPS[relation] ?? relation}>
            <div className="mb-2 inline-block cursor-help font-mono text-xs uppercase tracking-wider text-zinc-500">
              {relation}
            </div>
          </Tooltip>
            <ul className="space-y-1">
              {group.map((e) => {
                const colorClass = TYPE_COLORS[e.other.type] ?? TYPE_COLORS.lesson;
                return (
                  <li key={e.edge.id} className="flex items-baseline gap-3">
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${colorClass}`}
                    >
                      {e.other.type}
                    </span>
                    <Link
                      href={`/entities/${e.other.slug}`}
                      className="text-sm text-zinc-200 transition hover:text-emerald-400"
                    >
                      {e.other.name}
                    </Link>
                    <span className="text-xs text-zinc-600">{e.other.slug}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}
