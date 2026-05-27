import { promises as fs } from "node:fs";
import path from "node:path";
import { renderMarkdown } from "../lib/markdown";

export const metadata = {
  title: "Changelog — Roushi",
};

// Re-read on every render (dev), let Next cache in production.
export const dynamic = "force-dynamic";

async function loadChangelog(): Promise<string> {
  const p = path.resolve(process.cwd(), "CHANGELOG.md");
  try {
    return await fs.readFile(p, "utf-8");
  } catch (err) {
    return `# Changelog\n\nCould not read CHANGELOG.md: ${err instanceof Error ? err.message : err}`;
  }
}

export default async function ChangelogPage() {
  const raw = await loadChangelog();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="changelog">{renderMarkdown(raw)}</div>
    </main>
  );
}
