// Markdown ingest + wikilink extraction
// v0 implementation: parse frontmatter + extract [[wikilink]] references.
// Typed-link syntax (e.g. [[uses:drizzle]]) extracted as edges with the relation prefix.
// Zero LLM calls — pure regex + frontmatter parsing.

import matter from "gray-matter";

const WIKILINK_RE = /\[\[([^\]\n]+)\]\]/g;

export interface ParsedEntity {
  frontmatter: Record<string, unknown>;
  body: string;
  wikilinks: WikilinkRef[];
}

export interface WikilinkRef {
  /** The slug portion (after any "relation:" prefix) */
  slug: string;
  /** Optional relation name if the link used `[[relation:slug]]` syntax */
  relation: string | null;
  /** Snippet of body text surrounding the link (≈80 chars on either side) */
  context: string;
}

export function parseMarkdown(raw: string): ParsedEntity {
  // gray-matter throws on malformed YAML frontmatter (unquoted colons,
  // bad indentation, etc.). When that happens, fall back to treating
  // the whole input as body with no frontmatter — better than refusing
  // to ingest a useful markdown file because its frontmatter is sloppy.
  let frontmatter: Record<string, unknown> = {};
  let body = raw;
  try {
    const parsed = matter(raw);
    frontmatter = parsed.data as Record<string, unknown>;
    body = parsed.content;
  } catch {
    body = raw;
  }
  const wikilinks = extractWikilinks(body);
  return { frontmatter, body, wikilinks };
}

function extractWikilinks(body: string): WikilinkRef[] {
  const refs: WikilinkRef[] = [];
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(body)) !== null) {
    const inner = match[1]?.trim() ?? "";
    if (!inner) continue;
    const [first, second] = inner.split(":").map((s) => s.trim());
    const relation = second ? first ?? null : null;
    const slug = second ? second : (first ?? "");
    if (!slug) continue;
    const start = Math.max(0, match.index - 80);
    const end = Math.min(body.length, match.index + match[0].length + 80);
    refs.push({
      slug,
      relation,
      context: body.slice(start, end).trim(),
    });
  }
  return refs;
}
