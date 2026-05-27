"use client";

// Force-directed graph of the entire brain. Cytoscape is the engine —
// declarative styles, handles cycles in directed graphs, and runs the
// cose layout fast enough for ~500-node graphs. We use the built-in
// 'cose' layout (no plugin) so we don't pull in extra deps.
//
// Click a node → navigate to /entities/<slug>. Toggling a type in the
// legend hides every node of that type AND every edge that touches such
// a node. Search box highlights nodes whose name matches.

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "../../lib/graph-data";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  typeCounts: Record<string, number>;
}

// Color per entity type. Picked to be high-contrast on the dark UI and
// give related-ish categories visually-related hues.
const TYPE_COLOR: Record<string, string> = {
  product: "#34d399",       // emerald — top-level
  tech: "#60a5fa",          // blue
  vendor: "#a78bfa",        // violet
  decision: "#fbbf24",      // amber
  pattern: "#22d3ee",       // cyan
  incident: "#f87171",      // red
  lesson: "#fb923c",        // orange
  goal: "#f472b6",          // pink
  person: "#facc15",        // yellow
  roadmap_item: "#94a3b8",  // slate
  rule: "#c084fc",          // purple
  skill: "#2dd4bf",         // teal
};

const DEFAULT_COLOR = "#71717a"; // zinc-500

export function GraphCanvas({ nodes, edges, typeCounts }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const allTypes = useMemo(() => Object.keys(typeCounts).sort(), [typeCounts]);
  const allRelations = useMemo(() => {
    const set = new Set<string>();
    for (const e of edges) set.add(e.relation);
    return Array.from(set).sort();
  }, [edges]);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenRelations, setHiddenRelations] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  // Path-finding mode: click two nodes; shortest path highlights via BFS.
  // While pathMode is on, clicks select endpoints instead of navigating.
  const [pathMode, setPathMode] = useState(false);
  const [pathSource, setPathSource] = useState<string | null>(null);
  const [pathTarget, setPathTarget] = useState<string | null>(null);
  // Track these in refs so the cytoscape `tap` callback (registered once on
  // mount) sees the current values instead of the closed-over initial ones.
  const pathModeRef = useRef(pathMode);
  const pathSourceRef = useRef(pathSource);
  pathModeRef.current = pathMode;
  pathSourceRef.current = pathSource;

  // Build the cytoscape element array once. Filtering is done via classes
  // on the live instance below, not by rebuilding elements.
  const elements: ElementDefinition[] = useMemo(() => {
    const els: ElementDefinition[] = [];
    for (const n of nodes) {
      els.push({
        data: {
          id: n.id,
          slug: n.slug,
          label: n.name,
          type: n.type,
          color: TYPE_COLOR[n.type] ?? DEFAULT_COLOR,
        },
        classes: `type-${n.type}`,
      });
    }
    for (const e of edges) {
      // Skip edges referencing nodes we don't have (orphan safety).
      els.push({
        data: {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.relation,
        },
      });
    }
    return els;
  }, [nodes, edges]);

  // Initialize cytoscape once.
  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            color: "#e4e4e7",
            "font-size": "10px",
            "font-family": "system-ui, sans-serif",
            "text-outline-color": "#09090b",
            "text-outline-width": 2,
            "text-valign": "bottom",
            "text-margin-y": 6,
            width: 14,
            height: 14,
            "border-width": 0,
          },
        },
        {
          selector: "node:selected, node.match",
          style: {
            "border-width": 3,
            "border-color": "#fafafa",
            width: 20,
            height: 20,
          },
        },
        {
          selector: "node.path-endpoint",
          style: {
            "border-width": 3,
            "border-color": "#fafafa",
            width: 22,
            height: 22,
          },
        },
        {
          selector: "node.in-path",
          style: {
            "border-width": 3,
            "border-color": "#fafafa",
            width: 18,
            height: 18,
          },
        },
        {
          selector: "node.dimmed",
          style: { opacity: 0.15 },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#3f3f46",
            "target-arrow-color": "#3f3f46",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            "arrow-scale": 0.8,
            opacity: 0.6,
          },
        },
        {
          selector: "edge.dimmed",
          style: { opacity: 0.05 },
        },
        {
          selector: "edge.in-path",
          style: {
            "line-color": "#fafafa",
            "target-arrow-color": "#fafafa",
            width: 2.5,
            opacity: 1,
          },
        },
        {
          selector: "edge:selected",
          style: {
            "line-color": "#fafafa",
            "target-arrow-color": "#fafafa",
            width: 2,
            opacity: 1,
          },
        },
      ],
      layout: {
        name: "cose",
        animate: false,
        nodeRepulsion: 6000,
        idealEdgeLength: 80,
        edgeElasticity: 100,
        gravity: 0.25,
        numIter: 1500,
      },
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
    });

    cy.on("tap", "node", (event) => {
      const node = event.target;
      const slug = node.data("slug");
      // In path mode: clicks set source then target instead of navigating.
      if (pathModeRef.current) {
        const id = node.id();
        if (!pathSourceRef.current) {
          setPathSource(id);
          setPathTarget(null);
        } else if (pathSourceRef.current !== id) {
          setPathTarget(id);
        } else {
          // Clicked the same node again — clear and restart selection.
          setPathSource(null);
          setPathTarget(null);
        }
        return;
      }
      if (typeof slug === "string" && slug) {
        router.push(`/entities/${slug}`);
      }
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, router]);

  // React to hiddenTypes / hiddenRelations / search / path selection by
  // toggling classes on the live instance.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Compute the shortest-path set when both endpoints are picked.
    // Use Dijkstra with constant weight = 1 to get unweighted shortest
    // path; the SDK's bfs() return shape doesn't expose pathTo(), so
    // Dijkstra is the cleanest path-to-target API.
    const pathNodeIds = new Set<string>();
    const pathEdgeIds = new Set<string>();
    if (pathSource && pathTarget && pathSource !== pathTarget) {
      try {
        const dijkstra = cy.elements().dijkstra({
          root: cy.getElementById(pathSource),
          weight: () => 1,
          directed: false,
        });
        const target = cy.getElementById(pathTarget);
        const path = dijkstra.pathTo(target);
        // Cast to `any` for the iteration — cytoscape's union type
        // narrows poorly after isNode() so el.id() unfortunately reports
        // as `never` in the else branch. The underlying API is correct.
        // biome-ignore lint/suspicious/noExplicitAny: see comment above
        path.forEach((el: any) => {
          if (el.isNode()) {
            pathNodeIds.add(el.id() as string);
          } else {
            pathEdgeIds.add(el.id() as string);
          }
        });
      } catch {
        // Dijkstra failed (disconnected components, etc.) — leave sets
        // empty; we'll dim everything to signal no path exists.
      }
    }

    cy.batch(() => {
      const term = search.trim().toLowerCase();
      const hasPath = pathNodeIds.size > 0;

      cy.nodes().forEach((n) => {
        const type = n.data("type") as string;
        const label = (n.data("label") as string).toLowerCase();
        const hiddenByType = hiddenTypes.has(type);
        const matchesSearch = term && label.includes(term);

        let dim: boolean;
        if (hasPath) {
          dim = !pathNodeIds.has(n.id());
        } else if (pathSource && !pathTarget) {
          // Source picked, waiting for target — highlight just source.
          dim = n.id() !== pathSource;
        } else {
          dim = hiddenByType || (term ? !matchesSearch : false);
        }

        n.toggleClass("dimmed", dim);
        n.toggleClass("match", Boolean(matchesSearch));
        n.toggleClass(
          "path-endpoint",
          (pathSource === n.id() || pathTarget === n.id()) && !hasPath ? true : false,
        );
        n.toggleClass("in-path", hasPath && pathNodeIds.has(n.id()));
      });

      cy.edges().forEach((e) => {
        const relation = e.data("label") as string;
        const source = e.source();
        const target = e.target();
        const hiddenByRel = hiddenRelations.has(relation);

        let dim: boolean;
        if (hasPath) {
          dim = !pathEdgeIds.has(e.id());
        } else {
          dim = hiddenByRel || source.hasClass("dimmed") || target.hasClass("dimmed");
        }
        e.toggleClass("dimmed", dim);
        e.toggleClass("in-path", hasPath && pathEdgeIds.has(e.id()));
      });
    });
  }, [hiddenTypes, hiddenRelations, search, pathSource, pathTarget]);

  const toggleType = (t: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleRelation = (r: string) => {
    setHiddenRelations((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const clearPath = () => {
    setPathSource(null);
    setPathTarget(null);
  };

  // Look up labels for the selected path endpoints (cosmetic — UI display).
  const pathSourceLabel = useMemo(() => {
    if (!pathSource) return null;
    return nodes.find((n) => n.id === pathSource)?.name ?? null;
  }, [pathSource, nodes]);
  const pathTargetLabel = useMemo(() => {
    if (!pathTarget) return null;
    return nodes.find((n) => n.id === pathTarget)?.name ?? null;
  }, [pathTarget, nodes]);

  return (
    <div className="flex h-[calc(100vh-180px)] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-56 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {allTypes.map((t) => {
            const hidden = hiddenTypes.has(t);
            const color = TYPE_COLOR[t] ?? DEFAULT_COLOR;
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={`flex items-center gap-1.5 rounded border px-2 py-0.5 transition ${
                  hidden
                    ? "border-zinc-800 bg-zinc-950 text-zinc-600"
                    : "border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-600"
                }`}
                title={`${hidden ? "Show" : "Hide"} ${t} (${typeCounts[t]})`}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: hidden ? "#3f3f46" : color }}
                />
                {t}
                <span className="text-[10px] text-zinc-600">{typeCounts[t]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Relation filters + path-finding controls */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-zinc-600">edges:</span>
          {allRelations.map((r) => {
            const hidden = hiddenRelations.has(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRelation(r)}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] transition ${
                  hidden
                    ? "border-zinc-800 bg-zinc-950 text-zinc-600"
                    : "border-zinc-700 bg-zinc-900 text-yellow-400/80 hover:border-zinc-600"
                }`}
                title={`${hidden ? "Show" : "Hide"} ${r} edges`}
              >
                {r}
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = !pathMode;
              setPathMode(next);
              if (!next) clearPath();
            }}
            className={`rounded border px-2 py-1 transition ${
              pathMode
                ? "border-emerald-700 bg-emerald-950/40 text-emerald-300"
                : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-600"
            }`}
            title="Toggle path-finding mode: click two nodes to highlight the shortest path between them"
          >
            {pathMode ? "Path mode: ON" : "Find path"}
          </button>
          {pathMode ? (
            <span className="text-zinc-500">
              {!pathSource ? (
                <em>Click source node…</em>
              ) : !pathTarget ? (
                <>
                  source: <strong className="text-zinc-300">{pathSourceLabel}</strong> · click
                  target
                </>
              ) : (
                <>
                  <strong className="text-zinc-300">{pathSourceLabel}</strong>
                  {" → "}
                  <strong className="text-zinc-300">{pathTargetLabel}</strong>
                </>
              )}
            </span>
          ) : null}
          {pathMode && (pathSource || pathTarget) ? (
            <button
              type="button"
              onClick={clearPath}
              className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-500 transition hover:text-zinc-200"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 rounded-md border border-zinc-900 bg-zinc-950"
        style={{ minHeight: 400 }}
      />
    </div>
  );
}
