"use server";

import { promises as fs } from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ingestPath } from "../../lib/ingest";

export interface CreateRuleFormState {
  ok: boolean;
  message: string;
  slug?: string;
}

/**
 * Creates a new rule by writing a markdown file to `content/rules/<slug>.md`
 * and re-ingesting that directory so the rule lands in the brain. Keeps the
 * "markdown is the source of truth, DB is the index" convention.
 */
export async function createRuleAction(
  _prev: CreateRuleFormState,
  formData: FormData,
): Promise<CreateRuleFormState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const scopeKind = String(formData.get("scopeKind") ?? "").trim();
  const scopeValue = String(formData.get("scopeValue") ?? "").trim();
  const priority = String(formData.get("priority") ?? "normal").trim();
  const body = String(formData.get("body") ?? "").trim();

  if (!slug) return { ok: false, message: "Slug is required." };
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    return { ok: false, message: "Slug must be lowercase letters, digits, and dashes only." };
  }
  if (!name) return { ok: false, message: "Name is required." };
  if (!body) return { ok: false, message: "Body is required — write the rule." };

  const frontmatterLines: string[] = ["---", `slug: ${slug}`, "type: rule", `name: ${escapeYaml(name)}`];
  if (scopeKind === "slug") {
    if (!scopeValue) return { ok: false, message: "Product slug is required for slug scope." };
    frontmatterLines.push(`applies_to_slug: ${scopeValue}`);
  } else if (scopeKind === "type") {
    if (!scopeValue) return { ok: false, message: "Type is required for type scope." };
    frontmatterLines.push(`applies_to_type: ${scopeValue}`);
  } else if (scopeKind === "portfolio") {
    frontmatterLines.push(`applies_to: portfolio`);
  } else {
    return { ok: false, message: "Pick a scope." };
  }
  frontmatterLines.push(`priority: ${priority}`, "---", "");

  const fileContent = `${frontmatterLines.join("\n")}\n${body}\n`;
  const rulesDir = path.resolve(process.cwd(), "content", "rules");
  await fs.mkdir(rulesDir, { recursive: true });
  const filePath = path.join(rulesDir, `${slug}.md`);

  // Refuse to overwrite an existing rule from the form — use edit instead.
  try {
    await fs.access(filePath);
    return {
      ok: false,
      message: `A rule with slug "${slug}" already exists. Edit the file directly or pick a new slug.`,
    };
  } catch {
    // doesn't exist — safe to create
  }

  await fs.writeFile(filePath, fileContent, "utf-8");
  try {
    await ingestPath(rulesDir);
  } catch (err) {
    return {
      ok: false,
      message: `Wrote the file but ingest failed: ${err instanceof Error ? err.message : String(err)}`,
      slug,
    };
  }

  revalidatePath("/rules");
  revalidatePath(`/rules/${slug}`);
  redirect(`/rules/${slug}`);
}

function escapeYaml(s: string): string {
  // YAML strings with quotes or colons need quoting; this is the conservative form.
  if (/[:#\n"]/.test(s)) return JSON.stringify(s);
  return s;
}
