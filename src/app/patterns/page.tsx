import { sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { authEnabled } from "../../auth.config";
import { db } from "../../db/index";
import { entities } from "../../db/schema";
import { Project } from "../../patterns/_project";
import { listPatterns } from "../../patterns/_registry";

export const metadata = {
  title: "Patterns — Roushi",
};

export const dynamic = "force-dynamic";

interface ProductRow extends Record<string, unknown> {
  slug: string;
  name: string;
  source_path: string | null;
  frontmatter: Record<string, unknown>;
}

interface Cell {
  status: string;
  detail?: string;
  missing?: string[];
}

async function loadMatrix() {
  const patterns = listPatterns();
  const rows = await db.execute<ProductRow>(sql`
    SELECT slug, name, source_path, frontmatter
    FROM ${entities}
    WHERE type = 'product' AND source_path IS NOT NULL
    ORDER BY slug
  `);

  const products = await Promise.all(
    rows.rows.map(async (product) => {
      const project = new Project({
        cwd: product.source_path!,
        productSlug: product.slug,
        domain: (product.frontmatter?.domain as string | undefined) ?? null,
      });
      const cells: Record<string, Cell> = {};
      for (const p of patterns) {
        try {
          const r = await p.detect(project);
          cells[p.slug] = { status: r.status, detail: r.detail, missing: r.missing };
        } catch (err) {
          cells[p.slug] = {
            status: "error",
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      }
      return { slug: product.slug, name: product.name, cells };
    }),
  );

  return { patterns, products };
}

export default async function PatternsPage() {
  // Defense in depth — the proxy (src/proxy.ts) already gates this route
  // since /patterns isn't in PUBLIC_MARKETING_PATHS, but page-level check
  // means we're safe if middleware ever ships misconfigured.
  if (authEnabled) {
    const session = await auth();
    if (!session) redirect("/auth/signin?callbackUrl=/patterns");
  }

  const { patterns, products } = await loadMatrix();

  // Summary counters
  const totalCells = patterns.length * products.length;
  let appliedCount = 0;
  let partialCount = 0;
  for (const product of products) {
    for (const pattern of patterns) {
      const cell = product.cells[pattern.slug];
      if (cell?.status === "applied") appliedCount++;
      else if (cell?.status === "partial") partialCount++;
    }
  }
  const compliance = totalCells > 0 ? Math.round((appliedCount / totalCells) * 100) : 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-light text-zinc-100">Patterns</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Portfolio-wide automation patterns — &quot;snippet + env var + commit&quot; transforms
          that can be applied to any project. Each cell shows whether the pattern is{" "}
          <span className="text-emerald-400">applied</span>,{" "}
          <span className="text-amber-400">partial</span>, or{" "}
          <span className="text-zinc-500">not applied</span> in that product. Run{" "}
          <code className="text-zinc-300">pnpm roushi pattern apply &lt;slug&gt;</code>{" "}
          in the project workspace to fix.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-4 sm:max-w-md">
        <Stat label="Compliance" value={`${compliance}%`} tint="emerald" />
        <Stat label="Applied" value={`${appliedCount} / ${totalCells}`} tint="zinc" />
        <Stat label="Partial" value={`${partialCount}`} tint="amber" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-900 bg-zinc-950">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-950 text-left">
              <th className="px-4 py-3 font-medium text-zinc-300">Product</th>
              {patterns.map((p) => (
                <th key={p.slug} className="px-4 py-3 font-medium text-zinc-300">
                  <div title={p.description}>
                    <div>{p.slug}</div>
                    <div className="font-normal text-[10px] uppercase tracking-wider text-zinc-600">
                      {p.category}
                    </div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.slug} className="border-b border-zinc-900 last:border-b-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/entities/${product.slug}`}
                    className="text-zinc-200 hover:text-emerald-400 hover:underline"
                  >
                    {product.name}
                  </Link>
                  <div className="text-[10px] text-zinc-600">{product.slug}</div>
                </td>
                {patterns.map((p) => {
                  const cell = product.cells[p.slug];
                  return (
                    <td key={p.slug} className="px-4 py-3">
                      <StatusBadge cell={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-12">
        <h2 className="mb-4 text-lg font-medium text-zinc-100">Available patterns</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {patterns.map((p) => (
            <div
              key={p.slug}
              className="rounded-lg border border-zinc-900 bg-zinc-950 p-4"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-medium text-zinc-100">{p.slug}</h3>
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  {p.category}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{p.description}</p>
              <code className="mt-3 block text-xs text-zinc-500">
                pnpm roushi pattern apply {p.slug}
              </code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ cell }: { cell: Cell | undefined }) {
  if (!cell) return <span className="text-zinc-700">—</span>;

  const colors: Record<string, { bg: string; text: string; symbol: string }> = {
    applied: { bg: "bg-emerald-950/50", text: "text-emerald-400", symbol: "✓" },
    partial: { bg: "bg-amber-950/50", text: "text-amber-400", symbol: "~" },
    "not-applied": { bg: "bg-zinc-900/50", text: "text-zinc-500", symbol: "○" },
    error: { bg: "bg-red-950/50", text: "text-red-400", symbol: "✗" },
    incompatible: { bg: "bg-zinc-900/50", text: "text-zinc-600", symbol: "–" },
  };
  const c = colors[cell.status] ?? colors["not-applied"]!;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${c.bg} ${c.text}`}
      title={cell.detail ?? cell.status}
    >
      <span>{c.symbol}</span>
      <span>{cell.status}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint: "emerald" | "amber" | "zinc";
}) {
  const colors = {
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    zinc: "text-zinc-300",
  };
  return (
    <div className="rounded-lg border border-zinc-900 bg-zinc-950 px-4 py-3">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-2xl font-light ${colors[tint]}`}>{value}</div>
    </div>
  );
}
