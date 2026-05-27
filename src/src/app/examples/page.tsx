import Link from "next/link";
import { Tooltip } from "../components/Tooltip";
import { hybridSearch } from "../../lib/search";
import { traverseFrom } from "../../lib/graph";

export const metadata = {
  title: "Examples — Roushi",
};

// Each example is either a search query (renders top hits) or a graph walk
// from a starting slug (renders connected entities by relation).
interface SearchExample {
  kind: "search";
  title: string;
  query: string;
  why: string;
}

interface GraphExample {
  kind: "graph";
  title: string;
  slug: string;
  why: string;
}

type Example = SearchExample | GraphExample;

const EXAMPLES: Example[] = [
  {
    kind: "search",
    title: "Which products use Drizzle ORM?",
    query: "Drizzle ORM",
    why: "Semantic + keyword overlap. The Drizzle tech entity ranks #1; products that use it follow because their descriptions mention Drizzle.",
  },
  {
    kind: "graph",
    title: "Everything connected to Drizzle ORM",
    slug: "drizzle-orm",
    why: "Walk the graph from the tech entity outward — see all products with a `uses` edge pointing at Drizzle.",
  },
  {
    kind: "search",
    title: "Audit trail / hash chain patterns",
    query: "audit trail hash chain immutable",
    why: "Kodori implements this pattern; Kuroji inherits it. Both should surface with source=both (vector + keyword agreement).",
  },
  {
    kind: "search",
    title: "react-pdf crash patterns",
    query: "react-pdf 4.5 crash patterns",
    why: "Lesson auto-extracted from ZoningAI's per-project Claude memory. Now searchable from any other repo's session — exactly the cross-project value-prop.",
  },
  {
    kind: "search",
    title: "What's our default database?",
    query: "what is our default database for new projects",
    why: "Pure semantic match. The query has no keywords in common with the projects-registry text, but the embedding catches the meaning.",
  },
  {
    kind: "search",
    title: "Site investigation reports / zoning",
    query: "site investigation report zoning permitting",
    why: "Surfaces ZoningAI (client work) and related entities. Useful when you can't remember a product's name but recall what it does.",
  },
  {
    kind: "graph",
    title: "Everything connected to Roushi itself",
    slug: "roushi",
    why: "Dogfooding — the brain knows about itself. Useful self-portrait.",
  },
  {
    kind: "search",
    title: "Stripe billing across the portfolio",
    query: "Stripe billing integration",
    why: "Stripe vendor entity ranks high; products that depend on it follow. Run this when starting any new billing work.",
  },
];

export default async function ExamplesPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-light text-zinc-100">Examples</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Canned queries that run live against the brain on page load — useful for feeling out
          what Roushi can answer. <strong>Search</strong> examples use hybrid vector + keyword
          retrieval. <strong>Graph</strong> examples walk the typed edge graph from a starting
          entity. Anything tagged <code>both</code> in a result ranked in both rankers — the
          strongest signal.
        </p>
      </header>

      <div className="space-y-6">
        {EXAMPLES.map((ex, i) =>
          ex.kind === "search" ? <SearchCard key={i} example={ex} /> : <GraphCard key={i} example={ex} />,
        )}
      </div>
    </main>
  );
}

async function SearchCard({ example }: { example: SearchExample }) {
  const hits = await hybridSearch(example.query, { limit: 3 });
  return (
    <article className="rounded-md border border-zinc-900 bg-zinc-950 p-5">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex-1">
          <Tooltip text="Hybrid search: vector + keyword, fused via RRF">
            <span className="cursor-help rounded border border-sky-900/60 bg-sky-950/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-sky-400">
              search
            </span>
          </Tooltip>
          <h2 className="mt-2 text-base text-zinc-100">{example.title}</h2>
          <code className="mt-1 block font-mono text-xs text-zinc-500">"{example.query}"</code>
        </div>
        <Link
          href={`/?q=${encodeURIComponent(example.query)}`}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500"
        >
          see all →
        </Link>
      </div>
      <p className="mb-3 text-xs text-zinc-500">{example.why}</p>
      <div className="space-y-1">
        {hits.length === 0 ? (
          <p className="text-xs text-zinc-600">(no hits — brain may be empty)</p>
        ) : (
          hits.map((h, i) => (
            <Link
              key={h.entity.id}
              href={`/entities/${h.entity.slug}`}
              className="flex items-baseline gap-2 rounded px-2 py-1 text-xs transition hover:bg-zinc-900/60"
            >
              <span className="w-5 shrink-0 text-zinc-700">{i + 1}.</span>
              <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
                {h.entity.type}
              </span>
              <span className="text-zinc-200">{h.entity.name}</span>
              <span className="text-zinc-600">({h.entity.slug})</span>
              <span className="ml-auto text-zinc-600">
                {h.score.toFixed(4)} · {h.source}
              </span>
            </Link>
          ))
        )}
      </div>
    </article>
  );
}

async function GraphCard({ example }: { example: GraphExample }) {
  const nodes = await traverseFrom(example.slug, { maxHops: 1 });
  // Drop the start node from the displayed list — we already mention it in the title.
  const connected = nodes.filter((n) => n.depth > 0).slice(0, 8);
  return (
    <article className="rounded-md border border-zinc-900 bg-zinc-950 p-5">
      <div className="mb-2 flex items-start justify-between gap-4">
        <div className="flex-1">
          <Tooltip text="Walk the typed edge graph from this entity">
            <span className="cursor-help rounded border border-violet-900/60 bg-violet-950/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-400">
              graph
            </span>
          </Tooltip>
          <h2 className="mt-2 text-base text-zinc-100">{example.title}</h2>
          <code className="mt-1 block font-mono text-xs text-zinc-500">graph-query {example.slug} --hops 1</code>
        </div>
        <Link
          href={`/entities/${example.slug}`}
          className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-zinc-500"
        >
          open entity →
        </Link>
      </div>
      <p className="mb-3 text-xs text-zinc-500">{example.why}</p>
      <div className="space-y-1">
        {connected.length === 0 ? (
          <p className="text-xs text-zinc-600">(no connected entities)</p>
        ) : (
          connected.map((n) => {
            const lastEdge = n.pathEdges.at(-1);
            return (
              <Link
                key={n.entity.id}
                href={`/entities/${n.entity.slug}`}
                className="flex items-baseline gap-2 rounded px-2 py-1 text-xs transition hover:bg-zinc-900/60"
              >
                <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-zinc-400">
                  {n.entity.type}
                </span>
                <span className="text-zinc-200">{n.entity.name}</span>
                <span className="text-zinc-600">({n.entity.slug})</span>
                {lastEdge ? (
                  <span className="ml-auto font-mono text-zinc-600">&lt;{lastEdge.relation}&gt;</span>
                ) : null}
              </Link>
            );
          })
        )}
      </div>
    </article>
  );
}
