// Portfolio registry — generate a portfolio catalog markdown from brain
// state instead of hand-maintaining ~/.claude/rules/projects-registry.md.
//
// Status taxonomy (matches product entity frontmatter.status):
//   - live          → shipping product
//   - private-beta  → not yet GA
//   - pre-dev       → scoping / scaffold
//   - marketing     → umbrella site
//   - plugin        → side project / WP plugin
//   - experimental  → pitch / fundraising
//   - client        → KumoKodo Studio client work

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity } from "../db/schema";
import { entities } from "../db/schema";

const STATUS_ORDER = [
  "live",
  "private-beta",
  "pre-dev",
  "marketing",
  "plugin",
  "experimental",
  "client",
] as const;

const STATUS_LABELS: Record<string, string> = {
  live: "Production / Live",
  "private-beta": "Private Beta",
  "pre-dev": "Pre-development / Scoping",
  marketing: "Marketing / Site",
  plugin: "WordPress plugins / side projects",
  experimental: "Experimental / Pitch",
  client: "Client work (KumoKodo Studio)",
};

export interface PortfolioEntry {
  slug: string;
  name: string;
  status: string;
  domain: string | null;
  tagline: string | null;
  repoPath: string | null;
  client: string | null;
  endClient: string | null;
}

export async function listPortfolio(): Promise<PortfolioEntry[]> {
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.type} = 'product'`)
    .orderBy(sql`${entities.name}`);
  return rows.map(toEntry);
}

function toEntry(e: Entity): PortfolioEntry {
  const fm = (e.frontmatter ?? {}) as Record<string, unknown>;
  return {
    slug: e.slug,
    name: e.name,
    status: typeof fm.status === "string" ? fm.status : "unknown",
    domain: typeof fm.domain === "string" ? fm.domain : null,
    tagline: typeof fm.tagline === "string" ? fm.tagline : null,
    repoPath: e.sourcePath,
    client: typeof fm.client === "string" ? fm.client : null,
    endClient: typeof fm.end_client === "string" ? fm.end_client : null,
  };
}

/**
 * Render the portfolio catalog as a Claude-Code-friendly markdown rule,
 * grouped by status. Designed to live at `~/.claude/rules/projects-registry.md`
 * so every Claude Code session in any directory has the directory loaded.
 */
export async function renderRegistryMarkdown(): Promise<string> {
  const entries = await listPortfolio();
  const grouped = new Map<string, PortfolioEntry[]>();
  for (const e of entries) {
    const bucket = grouped.get(e.status) ?? [];
    bucket.push(e);
    grouped.set(e.status, bucket);
  }

  const out: string[] = [];
  out.push("# KumoKodo Projects Registry");
  out.push("");
  out.push(
    `Auto-generated from the Roushi brain (${entries.length} product entities). ` +
      `Edit each product's entity in Roushi (\`https://roushi.ai/entities/<slug>\` or its content/ file) ` +
      `then re-run \`pnpm roushi portfolio export-registry\` to regenerate this file.`,
  );
  out.push("");
  out.push(
    "**Do not edit by hand** — your edits will be overwritten on the next export. " +
      "If you need to add or change a product, update the brain (the product's `content/products/*.md` file, " +
      "or via `pnpm roushi add-project`), then regenerate.",
  );
  out.push("");
  out.push(
    `**Marketing umbrella site:** ${entries.find((e) => e.slug === "kumokodo-website")?.domain ?? "kumokodo.ai"}.`,
  );
  out.push("");

  for (const status of STATUS_ORDER) {
    const bucket = grouped.get(status);
    if (!bucket || bucket.length === 0) continue;
    out.push(`## ${STATUS_LABELS[status] ?? status}`);
    out.push("");
    if (status === "client") {
      out.push("| Brand | Repo path | Client | End-customer | What it is |");
      out.push("|---|---|---|---|---|");
      for (const e of bucket) {
        out.push(
          `| **${e.name}** | \`${e.repoPath ?? "(unset)"}\` | ${e.client ?? "—"} | ${e.endClient ?? "—"} | ${e.tagline ?? "—"} |`,
        );
      }
    } else {
      out.push("| Brand | Domain | Repo path | What it is |");
      out.push("|---|---|---|---|");
      for (const e of bucket) {
        out.push(
          `| **${e.name}** | ${e.domain ?? "—"} | \`${e.repoPath ?? "(unset)"}\` | ${e.tagline ?? "—"} |`,
        );
      }
    }
    out.push("");
  }

  out.push("## How to use this file");
  out.push("");
  out.push("- You're in any project and the user mentions another product by name → look it up here.");
  out.push("- Need detail beyond what's in this table → query Roushi:");
  out.push("  - `mcp__roushi__roushi_get_entity <slug>` for the product's full description and docs");
  out.push("  - `mcp__roushi__roushi_graph_query <slug>` to see its tech, vendors, decisions, lessons");
  out.push("  - `mcp__roushi__roushi_search \"<query>\"` for portfolio-wide context");
  out.push("");
  out.push("Cross-product conventions (default stack, deployment defaults, etc.) live as Roushi rules — see `https://roushi.ai/rules` and the synced `roushi-rule_*.md` files in each workspace's Claude memory dir.");
  out.push("");
  return out.join("\n");
}
