// Rules — durable instructions Roushi writes into each workspace's memory dir
// so Claude obeys them automatically. Rules are first-class entities in the
// brain (type=rule). Their frontmatter declares scope (applies_to_slug,
// applies_to_type, or applies_to: "portfolio") and priority. Their body is
// markdown — written for an agent to read.
//
// Distribution model: when a workspace is added (via `roushi add-project`) or
// when the user explicitly runs `roushi rules sync <workspace>`, Roushi
// queries the brain for rules that apply to that workspace's product slug,
// to its type (= "product"), and to "portfolio". It writes each as
// `roushi-rule_<slug>.md` into the workspace's Claude Code memory dir, and
// removes orphans (rules previously written for this workspace but no longer
// applicable).
//
// The agent in the workspace reads those memory files at session start. The
// agent is the runtime; Roushi is the rules-authoring + distribution system.

import { promises as fs } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import type { Entity } from "../db/schema";
import { entities } from "../db/schema";
import { autoMemoryDirFor } from "./discovery";

const WRITTEN_FILE_PREFIX = "roushi-rule_";

export interface RuleFrontmatter {
  applies_to_slug?: string;
  applies_to_type?: string;
  applies_to?: "portfolio";
  priority?: "high" | "normal" | "low";
}

export type Rule = Entity & { type: "rule" };

export interface SyncResult {
  workspacePath: string;
  productSlug: string | null;
  memoryDir: string;
  written: string[];
  removed: string[];
}

export async function listRules(): Promise<Rule[]> {
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.type} = 'rule'`)
    .orderBy(sql`${entities.name}`);
  return rows as Rule[];
}

export async function getRule(slug: string): Promise<Rule | null> {
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.type} = 'rule' AND ${entities.slug} = ${slug}`)
    .limit(1);
  return (rows[0] as Rule | undefined) ?? null;
}

/**
 * Returns the rules that apply to a given workspace. A rule applies if any of:
 *   - frontmatter.applies_to_slug === productSlug
 *   - frontmatter.applies_to_type === productType (typically "product")
 *   - frontmatter.applies_to === "portfolio"
 */
export async function rulesForWorkspace(
  productSlug: string | null,
  productType = "product",
): Promise<Rule[]> {
  const all = await listRules();
  return all.filter((r) => {
    const fm = (r.frontmatter ?? {}) as RuleFrontmatter;
    if (productSlug && fm.applies_to_slug === productSlug) return true;
    if (fm.applies_to_type === productType) return true;
    if (fm.applies_to === "portfolio") return true;
    return false;
  });
}

/**
 * Writes applicable rules to the workspace's Claude memory directory. Each
 * rule becomes `roushi-rule_<slug>.md`. Idempotent: re-running rewrites
 * matching files and removes any `roushi-rule_*.md` that no longer applies.
 *
 * If `productSlug` is null, only `applies_to_type` and `applies_to: portfolio`
 * rules match — useful for workspaces not yet registered in the brain.
 */
export async function syncRulesToWorkspace(
  workspacePath: string,
  productSlug: string | null,
): Promise<SyncResult> {
  const memoryDir = autoMemoryDirFor(workspacePath);
  await fs.mkdir(memoryDir, { recursive: true });

  const rules = await rulesForWorkspace(productSlug);
  const desiredFilenames = new Set<string>();

  const written: string[] = [];
  for (const r of rules) {
    const filename = `${WRITTEN_FILE_PREFIX}${r.slug}.md`;
    desiredFilenames.add(filename);
    const filePath = path.join(memoryDir, filename);
    const content = renderRuleAsMarkdown(r);
    await fs.writeFile(filePath, content, "utf-8");
    written.push(filename);
  }

  // Remove orphaned roushi-rule_*.md files.
  const removed: string[] = [];
  const existing = await fs.readdir(memoryDir).catch(() => [] as string[]);
  for (const name of existing) {
    if (!name.startsWith(WRITTEN_FILE_PREFIX) || !name.endsWith(".md")) continue;
    if (desiredFilenames.has(name)) continue;
    await fs.unlink(path.join(memoryDir, name));
    removed.push(name);
  }

  return { workspacePath, productSlug, memoryDir, written, removed };
}

function renderRuleAsMarkdown(rule: Rule): string {
  const fm = (rule.frontmatter ?? {}) as RuleFrontmatter & Record<string, unknown>;
  const scope = scopeLabel(fm);
  const priority = fm.priority ?? "normal";

  // The header is Roushi-stamped so the agent knows where the file came from
  // and why it's present. Body is the rule itself (entity.description), which
  // is the markdown the author wrote.
  const header = [
    `<!-- ROUSHI MANAGED FILE. Do not edit directly; edit the rule at https://roushi.ai/rules/${rule.slug} -->`,
    "",
    `# ${rule.name}`,
    "",
    `> **Scope:** ${scope} · **Priority:** ${priority}`,
    `> Sourced from Roushi rule \`${rule.slug}\`. Updated ${new Date(rule.updatedAt).toISOString().slice(0, 10)}.`,
    "",
    "---",
    "",
  ].join("\n");

  return header + (rule.description ?? "");
}

function scopeLabel(fm: RuleFrontmatter): string {
  if (fm.applies_to_slug) return `product \`${fm.applies_to_slug}\``;
  if (fm.applies_to_type) return `every \`${fm.applies_to_type}\``;
  if (fm.applies_to === "portfolio") return "entire KumoKodo portfolio";
  return "(no scope specified — will not propagate)";
}
