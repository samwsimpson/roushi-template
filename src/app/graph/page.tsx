import { loadGraphSnapshot } from "../../lib/graph-data";
import { GraphCanvas } from "../components/GraphCanvas";

export const metadata = {
  title: "Graph — Roushi",
};

// The graph reflects the latest brain state. Force-dynamic so refreshes
// after ingest pick up new nodes/edges without manual cache busting.
export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const snapshot = await loadGraphSnapshot();

  return (
    <main className="mx-auto max-w-7xl px-6 py-6">
      <header className="mb-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-light text-zinc-100">Graph</h1>
          <span className="text-xs text-zinc-500">
            {snapshot.nodes.length} entities · {snapshot.edges.length} edges
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Force-directed view of every entity and edge in the brain. Each color is an entity type
          (toggle in the legend to hide). Click any node to open its detail page. Search highlights
          matching names; non-matches dim.
        </p>
      </header>

      <GraphCanvas
        nodes={snapshot.nodes}
        edges={snapshot.edges}
        typeCounts={snapshot.typeCounts}
      />
    </main>
  );
}
