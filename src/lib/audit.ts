// Edge-quality audit. Scans all edges and flags ones whose relation doesn't
// match the canonical type→relation pairs (e.g. LisAI's extraction produced
// `product --depends_on--> tech` edges that should have been `uses`).
//
// Three severity levels:
//   - wrong   — relation is incompatible with the source/target types
//   - suspect — relation isn't the canonical pick for these types
//   - ok      — relation matches the expected pattern
//
// auditEdges() returns only wrong + suspect (ok rows are not interesting).
// applyFix() rewrites a single edge's relation (idempotent — unique
// constraint prevents duplicates).

import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Edge, Entity } from "../db/schema";
import { edges, entities } from "../db/schema";

export type Severity = "wrong" | "suspect";

export interface EdgeAuditFinding {
  edge: Edge;
  from: { id: string; slug: string; name: string; type: string };
  to: { id: string; slug: string; name: string; type: string };
  severity: Severity;
  reason: string;
  /** A suggested replacement relation if we have one. */
  suggestion: Edge["relation"] | null;
}

// Canonical relation per source-type → target-type pair. Anything matching this
// is "ok" and won't be reported.
const CANONICAL: Record<string, Record<string, Edge["relation"]>> = {
  product: {
    tech: "uses",
    vendor: "hosted_on",
    decision: "led_to",
    pattern: "defined_by",
    lesson: "depends_on",
    incident: "led_to",
    person: "mentions",
    product: "shares_pattern",
  },
  decision: {
    decision: "supersedes",
    tech: "applies_to",
    pattern: "applies_to",
    product: "applies_to",
  },
  pattern: {
    product: "applies_to",
    tech: "uses",
    pattern: "shares_pattern",
  },
  lesson: {
    tech: "mentions",
    vendor: "mentions",
    pattern: "mentions",
    decision: "led_to",
  },
  incident: {
    product: "applies_to",
    decision: "led_to",
    lesson: "led_to",
  },
  goal: {
    product: "applies_to",
    goal: "blocks",
  },
};

// Relations that don't make sense for a source-type → target-type pair at all.
// e.g. `tech --hosted_on--> product` is wrong-direction.
const WRONG_PAIRS = new Set<string>([
  // tech can't host_on / depend_on / lead_to anything in the source position
  "tech:hosted_on",
  "tech:led_to",
  "vendor:uses",
  // products don't supersede things
  "product:supersedes",
]);

export async function auditEdges(): Promise<EdgeAuditFinding[]> {
  const rows = await db.execute<{
    edge_id: string;
    from_id: string;
    to_id: string;
    relation: string;
    from_slug: string;
    from_name: string;
    from_type: string;
    to_slug: string;
    to_name: string;
    to_type: string;
  } & Record<string, unknown>>(sql`
    SELECT
      e.id AS edge_id, e.from_entity_id AS from_id, e.to_entity_id AS to_id,
      e.relation::text AS relation,
      f.slug AS from_slug, f.name AS from_name, f.type::text AS from_type,
      t.slug AS to_slug, t.name AS to_name, t.type::text AS to_type
    FROM edges e
    JOIN entities f ON f.id = e.from_entity_id
    JOIN entities t ON t.id = e.to_entity_id
  `);

  const findings: EdgeAuditFinding[] = [];

  for (const r of rows.rows) {
    const wrongKey = `${r.from_type}:${r.relation}`;
    if (WRONG_PAIRS.has(wrongKey)) {
      findings.push(buildFinding(r, "wrong", `${r.from_type} entities cannot be the source of a "${r.relation}" edge`, null));
      continue;
    }

    const expected = CANONICAL[r.from_type]?.[r.to_type];
    if (!expected) {
      // No canonical rule for this combo → can't judge, treat as ok.
      continue;
    }

    if (r.relation !== expected) {
      findings.push(
        buildFinding(
          r,
          "suspect",
          `${r.from_type} → ${r.to_type} typically uses "${expected}", not "${r.relation}"`,
          expected,
        ),
      );
    }
  }

  return findings;
}

function buildFinding(
  r: {
    edge_id: string;
    from_id: string;
    to_id: string;
    relation: string;
    from_slug: string;
    from_name: string;
    from_type: string;
    to_slug: string;
    to_name: string;
    to_type: string;
  },
  severity: Severity,
  reason: string,
  suggestion: Edge["relation"] | null,
): EdgeAuditFinding {
  return {
    edge: {
      id: r.edge_id,
      fromEntityId: r.from_id,
      toEntityId: r.to_id,
      relation: r.relation as Edge["relation"],
      declaredByEntityId: null,
      context: null,
      createdAt: new Date(),
    },
    from: { id: r.from_id, slug: r.from_slug, name: r.from_name, type: r.from_type },
    to: { id: r.to_id, slug: r.to_slug, name: r.to_name, type: r.to_type },
    severity,
    reason,
    suggestion,
  };
}

/**
 * Apply a suggested fix: rewrite the edge's relation. Idempotent — if an edge
 * with the new relation already exists, deletes the old one rather than
 * hitting the unique constraint.
 */
export async function applyEdgeFix(edgeId: string, newRelation: Edge["relation"]): Promise<boolean> {
  // Look up the edge first to grab from/to.
  const [edge] = await db.select().from(edges).where(eq(edges.id, edgeId)).limit(1);
  if (!edge) return false;

  // Does an edge already exist with the new relation? If so, just delete this one.
  const dupeCheck = await db
    .select({ id: edges.id })
    .from(edges)
    .where(
      sql`${edges.fromEntityId} = ${edge.fromEntityId} AND ${edges.toEntityId} = ${edge.toEntityId} AND ${edges.relation}::text = ${newRelation}`,
    )
    .limit(1);

  if (dupeCheck.length > 0) {
    await db.delete(edges).where(eq(edges.id, edgeId));
    return true;
  }

  await db
    .update(edges)
    .set({ relation: newRelation })
    .where(eq(edges.id, edgeId));
  return true;
}

export async function applyAllSuggestedFixes(): Promise<{ applied: number; skipped: number }> {
  const findings = await auditEdges();
  let applied = 0;
  let skipped = 0;
  for (const f of findings) {
    if (f.severity !== "suspect" || !f.suggestion) {
      skipped += 1;
      continue;
    }
    const ok = await applyEdgeFix(f.edge.id, f.suggestion);
    if (ok) applied += 1;
    else skipped += 1;
  }
  return { applied, skipped };
}
