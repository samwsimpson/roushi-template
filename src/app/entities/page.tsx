import Link from "next/link";
import { RemoveEntityForm } from "../components/RemoveEntityForm";
import { Tooltip } from "../components/Tooltip";
import { entityTypeCounts, listEntities } from "../lib/queries";

interface PageProps {
  searchParams: Promise<{ type?: string; q?: string; client?: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  product: "Products",
  tech: "Tech",
  vendor: "Vendor",
  pattern: "Pattern",
  decision: "Decision",
  lesson: "Lesson",
  incident: "Incident",
  goal: "Goal",
  person: "Person",
  roadmap_item: "Roadmap",
};

const TYPE_TOOLTIPS: Record<string, string> = {
  product: "A repo or shipping product — KumoKodo SaaS or client work",
  tech: "A library or framework (Drizzle, Next.js, pgvector…)",
  vendor: "A platform or paid service (Vercel, Stripe, Anthropic…)",
  pattern: "A reusable architectural pattern that transfers across products",
  decision: "A locked architectural choice with reasoning",
  lesson: "Something learned the hard way — gotchas, postmortems",
  incident: "A specific failure event for retrospective",
  goal: "A durable multi-week objective",
  person: "A person referenced by entities",
  roadmap_item: "A planned future capability",
};

const TYPE_COLORS: Record<string, string> = {
  product: "text-emerald-400 border-emerald-900/60 bg-emerald-950/40",
  tech: "text-sky-400 border-sky-900/60 bg-sky-950/40",
  vendor: "text-amber-400 border-amber-900/60 bg-amber-950/40",
  pattern: "text-violet-400 border-violet-900/60 bg-violet-950/40",
  decision: "text-rose-400 border-rose-900/60 bg-rose-950/40",
  lesson: "text-zinc-400 border-zinc-800 bg-zinc-900/40",
  incident: "text-orange-400 border-orange-900/60 bg-orange-950/40",
  goal: "text-yellow-400 border-yellow-900/60 bg-yellow-950/40",
  person: "text-pink-400 border-pink-900/60 bg-pink-950/40",
  roadmap_item: "text-cyan-400 border-cyan-900/60 bg-cyan-950/40",
};

export default async function EntitiesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const type = params.type ?? undefined;
  const q = params.q ?? "";
  const clientWork = params.client === "yes" ? "yes" : params.client === "no" ? "no" : undefined;

  const [items, counts] = await Promise.all([
    listEntities({ type, q, clientWork }),
    entityTypeCounts(),
  ]);
  const total = counts.reduce((s, c) => s + c.n, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-light text-zinc-100">Browse</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Everything Roushi knows. Products, the tech and vendors they use, decisions made,
          patterns reused across them, lessons learned. Filter by type or search across name +
          description — click any entity to see its full content and edges. Use{" "}
          <strong>Portfolio</strong> vs <strong>Client work</strong> to separate KumoKodo's own
          products from client engagements.
        </p>
      </header>

      <div className="mb-6 flex items-baseline justify-between">
        <h2 className="text-sm text-zinc-500">
          {items.length} <span>of {total} entities</span>
        </h2>
        <form className="flex items-center gap-2">
          {type ? <input type="hidden" name="type" value={type} /> : null}
          {clientWork ? <input type="hidden" name="client" value={clientWork} /> : null}
          <input
            type="search"
            name="q"
            placeholder="Search name, slug, description…"
            defaultValue={q}
            className="w-72 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          />
        </form>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <TypeFilterLink type={undefined} current={type} q={q} client={clientWork} label={`All (${total})`} />
        {counts.map((c) => (
          <TypeFilterLink
            key={c.type}
            type={c.type}
            current={type}
            q={q}
            client={clientWork}
            label={`${TYPE_LABELS[c.type] ?? c.type} (${c.n})`}
          />
        ))}
        <div className="mx-2 h-4 w-px bg-zinc-800" />
        <ClientFilterLink current={clientWork} type={type} q={q} label="Portfolio" value="no" />
        <ClientFilterLink current={clientWork} type={type} q={q} label="Client work" value="yes" />
      </div>

      {items.length === 0 ? (
        <p className="rounded-md border border-zinc-900 bg-zinc-950 p-6 text-sm text-zinc-500">
          No entities match these filters.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-900 rounded-md border border-zinc-900">
          {items.map((e) => {
            const fm = (e.frontmatter ?? {}) as Record<string, unknown>;
            const isClientWork = fm.client_work === true;
            const client = typeof fm.client === "string" ? fm.client : null;
            const endClient = typeof fm.end_client === "string" ? fm.end_client : null;
            const clientLabel = isClientWork
              ? [client, endClient].filter(Boolean).join(" → ") || "client work"
              : null;
            const colorClass = TYPE_COLORS[e.type] ?? TYPE_COLORS.lesson;
            return (
              <li key={e.id} className="flex items-start gap-4 px-4 py-3 transition hover:bg-zinc-950/60">
                <Tooltip text={TYPE_TOOLTIPS[e.type] ?? e.type}>
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide ${colorClass}`}
                  >
                    {e.type}
                  </span>
                </Tooltip>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-3">
                    <Link
                      href={`/entities/${e.slug}`}
                      className="truncate text-base text-zinc-100 transition hover:text-emerald-400"
                    >
                      {e.name}
                    </Link>
                    <span className="text-xs text-zinc-600">{e.slug}</span>
                    {clientLabel ? (
                      <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-400">
                        {clientLabel}
                      </span>
                    ) : null}
                  </div>
                  {e.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                      {firstParagraph(e.description)}
                    </p>
                  ) : null}
                  {e.sourcePath ? (
                    <p className="mt-1 truncate font-mono text-xs text-zinc-700">{e.sourcePath}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-3 self-center">
                  <Link
                    href={`/entities/${e.slug}`}
                    className="text-xs text-zinc-500 transition hover:text-zinc-200"
                  >
                    open
                  </Link>
                  <RemoveEntityForm slug={e.slug} name={e.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function TypeFilterLink({
  type,
  current,
  q,
  client,
  label,
}: {
  type: string | undefined;
  current: string | undefined;
  q: string;
  client: "yes" | "no" | undefined;
  label: string;
}) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);
  if (client) params.set("client", client);
  const href = params.toString() ? `/entities?${params.toString()}` : "/entities";
  const active = (type ?? "") === (current ?? "");
  return (
    <Link
      href={href}
      className={`rounded border px-2 py-1 transition ${
        active
          ? "border-zinc-600 bg-zinc-800 text-zinc-100"
          : "border-zinc-900 bg-zinc-950 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      }`}
    >
      {label}
    </Link>
  );
}

function ClientFilterLink({
  current,
  type,
  q,
  label,
  value,
}: {
  current: "yes" | "no" | undefined;
  type: string | undefined;
  q: string;
  label: string;
  value: "yes" | "no";
}) {
  const active = current === value;
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (q) params.set("q", q);
  if (!active) params.set("client", value);
  const href = params.toString() ? `/entities?${params.toString()}` : "/entities";
  return (
    <Link
      href={href}
      className={`rounded border px-2 py-1 transition ${
        active
          ? "border-amber-700 bg-amber-950/40 text-amber-300"
          : "border-zinc-900 bg-zinc-950 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
      }`}
    >
      {label}
    </Link>
  );
}

function firstParagraph(s: string): string {
  const trimmed = s.trim();
  const stripHeading = trimmed.replace(/^#[^\n]*\n+/, "");
  const para = stripHeading.split(/\n\s*\n/)[0] ?? "";
  return para.slice(0, 280);
}
