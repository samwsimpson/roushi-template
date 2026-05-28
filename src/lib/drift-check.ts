// Drift detector — scans every product in the brain for shipment-sweep drift.
//
// Catches mechanical drift the pre-commit hook can't (it only runs on Roushi
// itself). Checks each product for:
//
//   - VERSION DRIFT: package.json version not matching the latest CHANGELOG.md
//     entry, OR not matching lockstep version sites if they exist
//   - STALE PHRASE DRIFT: README / scope docs mentioning a Phase / status that
//     looks superseded (e.g. "v0.10.0" when package.json is 0.13.0)
//   - PATTERN DRIFT: products that have partial-state patterns (a hint that
//     someone started applying a pattern but didn't finish)
//
// Designed to run locally (Vercel can't reach the source paths). Future:
// have the CLI push findings into the brain as `detection_run` entities so
// the deployed /patterns page can show drift state without doing fresh scans.

import { and, sql } from "drizzle-orm";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { db } from "../db";
import { entities, goals } from "../db/schema";
import { Project } from "../patterns/_project";
import { listPatterns } from "../patterns/_registry";
import { createGoal, updateGoalStatus } from "./goals";

export interface DriftFinding {
  productSlug: string;
  productName: string;
  category: "version" | "stale-phrase" | "pattern" | "missing-file";
  severity: "error" | "warning" | "info";
  message: string;
  fix?: string;
}

export interface DriftCheckOptions {
  productSlugs?: string[];
  skipPatterns?: boolean;
  /** Upsert a "[system] Drift:" goal per product with errors. Closes when clean. */
  postGoals?: boolean;
}

const DRIFT_GOAL_PREFIX = "[system] Drift:";

interface ProductRow extends Record<string, unknown> {
  slug: string;
  name: string;
  source_path: string | null;
  frontmatter: Record<string, unknown>;
}

export async function runDriftCheck(
  options: DriftCheckOptions = {},
): Promise<DriftFinding[]> {
  const where = options.productSlugs?.length
    ? sql`AND slug IN (${sql.join(
        options.productSlugs.map((s) => sql`${s}`),
        sql`, `,
      )})`
    : sql``;

  const rows = await db.execute<ProductRow>(sql`
    SELECT slug, name, source_path, frontmatter
    FROM ${entities}
    WHERE type = 'product' AND source_path IS NOT NULL
      ${where}
    ORDER BY slug
  `);

  const findings: DriftFinding[] = [];
  for (const product of rows.rows) {
    if (!product.source_path) continue;

    // Skip if the source_path doesn't exist locally (deleted repo, wrong machine)
    try {
      await fs.access(product.source_path);
    } catch {
      findings.push({
        productSlug: product.slug,
        productName: product.name,
        category: "missing-file",
        severity: "warning",
        message: `source_path not reachable: ${product.source_path}`,
        fix: "Update the product entity's source_path or remove if the repo is gone.",
      });
      continue;
    }

    findings.push(...(await checkProduct(product)));
  }

  if (!options.skipPatterns) {
    // Pattern drift only — partial states only, not "not-applied" (which is
    // legitimate if the project doesn't need the pattern).
    const patterns = listPatterns();
    for (const product of rows.rows) {
      if (!product.source_path) continue;
      try {
        await fs.access(product.source_path);
      } catch {
        continue;
      }
      const project = new Project({
        cwd: product.source_path,
        productSlug: product.slug,
        domain: (product.frontmatter?.domain as string | undefined) ?? null,
      });
      for (const p of patterns) {
        try {
          const result = await p.detect(project);
          if (result.status === "partial") {
            findings.push({
              productSlug: product.slug,
              productName: product.name,
              category: "pattern",
              severity: "warning",
              message: `Pattern ${p.slug} is partially applied${result.missing?.length ? ` (missing: ${result.missing.join(", ")})` : ""}`,
              fix: `Run: pnpm roushi pattern apply ${p.slug} (in the project directory)`,
            });
          }
        } catch {
          // Skip — pattern errors are noise here, not drift
        }
      }
    }
  }

  if (options.postGoals) {
    await syncDriftGoals(findings);
  }

  return findings;
}

/**
 * Reconciles drift findings to `[system] Drift: <product>` goals:
 *   - Creates a new active goal for each product with error-severity findings
 *   - Updates existing goals if findings changed
 *   - Marks goals "completed" when a product's errors clear
 */
async function syncDriftGoals(findings: DriftFinding[]): Promise<void> {
  const errorsByProduct = new Map<string, DriftFinding[]>();
  for (const f of findings) {
    if (f.severity !== "error") continue;
    const arr = errorsByProduct.get(f.productSlug) ?? [];
    arr.push(f);
    errorsByProduct.set(f.productSlug, arr);
  }

  const existing = await db.execute<{ id: string; title: string; status: string }>(sql`
    SELECT id, title, status::text AS status
    FROM ${goals}
    WHERE title LIKE ${DRIFT_GOAL_PREFIX + " %"}
  `);

  const existingByTitle = new Map(existing.rows.map((g) => [g.title, g]));

  // Upsert active goals for products with current errors
  for (const [productSlug, items] of errorsByProduct) {
    const product = items[0]!;
    const title = `${DRIFT_GOAL_PREFIX} ${product.productName} (${productSlug})`;
    const description = items
      .map((f) => `- [${f.category}] ${f.message}${f.fix ? `\n  fix: ${f.fix}` : ""}`)
      .join("\n");

    const existingGoal = existingByTitle.get(title);
    if (existingGoal) {
      // Update description (and reopen if previously completed)
      await db.execute(sql`
        UPDATE ${goals}
        SET description = ${description},
            status = 'active',
            updated_at = now()
        WHERE id = ${existingGoal.id}
      `);
      existingByTitle.delete(title);
    } else {
      await createGoal({
        title,
        description,
        relatedEntitySlugs: [productSlug],
      });
    }
  }

  // Close goals whose products no longer have errors
  for (const stale of existingByTitle.values()) {
    if (stale.status === "active") {
      await updateGoalStatus(stale.id, "completed");
    }
  }
}

async function checkProduct(product: ProductRow): Promise<DriftFinding[]> {
  const findings: DriftFinding[] = [];
  const root = product.source_path!;

  // ─── Read package.json (if it exists) ──────────────────────
  const pkgPath = path.join(root, "package.json");
  let pkgVersion: string | null = null;
  try {
    const pkgRaw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgRaw) as { version?: string };
    pkgVersion = pkg.version ?? null;
  } catch {
    // No package.json — not a Node project, skip version checks
    return findings;
  }

  if (!pkgVersion) return findings;

  // ─── CHANGELOG drift ───────────────────────────────────────
  const changelogPath = path.join(root, "CHANGELOG.md");
  try {
    const changelog = await fs.readFile(changelogPath, "utf-8");
    // Find the latest version heading
    const headings = [
      ...changelog.matchAll(/^##\s+\[?(\d+\.\d+\.\d+)\]?/gm),
    ];
    const latest = headings[0]?.[1];
    if (latest && latest !== pkgVersion) {
      findings.push({
        productSlug: product.slug,
        productName: product.name,
        category: "version",
        severity: "error",
        message: `CHANGELOG.md latest is [${latest}] but package.json is ${pkgVersion}`,
        fix: `Add a "## [${pkgVersion}] — YYYY-MM-DD" entry to CHANGELOG.md, OR revert the version bump.`,
      });
    } else if (!latest) {
      findings.push({
        productSlug: product.slug,
        productName: product.name,
        category: "version",
        severity: "warning",
        message: `CHANGELOG.md has no version headings`,
      });
    }
  } catch {
    findings.push({
      productSlug: product.slug,
      productName: product.name,
      category: "missing-file",
      severity: "info",
      message: `No CHANGELOG.md found`,
      fix: `Scaffold one — see portfolio-standard-md-files rule.`,
    });
  }

  // ─── Stale "current status" version mention in README only ─
  //
  // PROJECT_SCOPE / TECH_STACK legitimately reference historical versions
  // (D-decisions, "shipped in v0.10.0" notes) — checking those is noise.
  // Only check README for a specific "Status: vX.Y.Z" or "What's shipped
  // (vX.Y.Z)" pattern that's meant to reflect CURRENT state.
  try {
    const readme = await fs.readFile(path.join(root, "README.md"), "utf-8");
    const statusPatterns = [
      /\*\*Status:\*\*\s+v(\d+\.\d+\.\d+)/,
      /What's shipped \(v(\d+\.\d+\.\d+)\)/,
      /^Status:\s+v(\d+\.\d+\.\d+)/m,
    ];
    for (const re of statusPatterns) {
      const m = readme.match(re);
      if (m && m[1] && m[1] !== pkgVersion) {
        findings.push({
          productSlug: product.slug,
          productName: product.name,
          category: "stale-phrase",
          severity: "warning",
          message: `README.md status reference is v${m[1]} but package.json is ${pkgVersion}`,
          fix: `Update the status line in README.md to v${pkgVersion}.`,
        });
        break;
      }
    }
  } catch {
    // README doesn't exist — fine
  }

  return findings;
}

