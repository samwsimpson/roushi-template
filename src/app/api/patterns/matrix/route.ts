import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "../../../../auth.js";
import { authEnabled } from "../../../../auth.config.js";
import { db } from "../../../../db/index.js";
import { entities } from "../../../../db/schema.js";
import { Project } from "../../../../patterns/_project.js";
import { listPatterns } from "../../../../patterns/_registry.js";

// Returns a matrix of every product × every pattern with detection status.
// Powers the /patterns web UI. Runs the same detect() logic the CLI does.
//
// Node runtime — the patterns shell out to git/grep which doesn't work on Edge.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProductRow extends Record<string, unknown> {
  slug: string;
  name: string;
  source_path: string | null;
  frontmatter: Record<string, unknown>;
}

interface CellResult {
  status: string;
  detail?: string;
  missing?: string[];
}

interface MatrixResponse {
  patterns: Array<{ slug: string; name: string; description: string; category: string }>;
  products: Array<{
    slug: string;
    name: string;
    cells: Record<string, CellResult>;
  }>;
  generatedAt: string;
}

export async function GET(): Promise<NextResponse<MatrixResponse | { error: string }>> {
  // Org-internal data (workspace paths, which projects are non-compliant) —
  // gate behind the same session check as the rest of the app.
  if (authEnabled) {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
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
        const cells: Record<string, CellResult> = {};
        for (const p of patterns) {
          try {
            const r = await p.detect(project);
            cells[p.slug] = {
              status: r.status,
              detail: r.detail,
              missing: r.missing,
            };
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

    return NextResponse.json({
      patterns: patterns.map((p) => ({
        slug: p.slug,
        name: p.name,
        description: p.description,
        category: p.category,
      })),
      products,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
