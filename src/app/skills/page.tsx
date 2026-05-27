import { listSkills } from "../../lib/skills";

export const metadata = {
  title: "Skills — Roushi",
};

// Skills change via disk edits + `roushi skill ingest`, not via the web UI —
// force-dynamic so we read the latest indexed state every visit.
export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const all = await listSkills();
  const withWarnings = all.filter((s) => {
    const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
    return Array.isArray(fm._warnings) && (fm._warnings as unknown[]).length > 0;
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-2 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-light text-zinc-100">Skills</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Claude Code skills indexed from{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5">~/.claude/skills/</code>. Roushi
            doesn&apos;t host skill bodies — Claude Code reads them directly off disk for native{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5">/&lt;skill&gt;</code>{" "}
            invocation. We index them here so{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5">think</code>/search can recommend a
            skill (e.g. <em>&quot;for this you&apos;d want [aether-integration]&quot;</em>) and so we can flag
            misfiled or weakly-described skills.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Re-index from CLI:{" "}
            <code className="rounded bg-zinc-900 px-1.5 py-0.5">pnpm roushi skill ingest</code>{" "}
            (or via MCP: <code className="rounded bg-zinc-900 px-1.5 py-0.5">roushi_skill_ingest</code>).
            Edit the SKILL.md on disk, then re-ingest to refresh.
          </p>
        </div>
      </header>

      {withWarnings.length > 0 ? (
        <section className="mt-6 mb-8 rounded-md border border-amber-900/60 bg-amber-950/20 p-4">
          <h2 className="mb-2 text-xs uppercase tracking-wider text-amber-300">
            {withWarnings.length} skill(s) with lint warnings
          </h2>
          <p className="mb-3 text-xs text-amber-200/70">
            Misfiled paths, missing frontmatter, or name/slug mismatches. These still appear below;
            the warning detail shows on each card.
          </p>
        </section>
      ) : null}

      {all.length === 0 ? (
        <p className="mt-8 rounded-md border border-dashed border-zinc-900 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500">
          No skills indexed yet. Run{" "}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5">pnpm roushi skill ingest</code> to scan{" "}
          <code className="rounded bg-zinc-900 px-1.5 py-0.5">~/.claude/skills/</code>.
        </p>
      ) : (
        <ul className="space-y-3">
          {all.map((s) => {
            const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
            const warnings = Array.isArray(fm._warnings) ? (fm._warnings as string[]) : [];
            const sourcePath = typeof fm._source_path === "string" ? fm._source_path : s.sourcePath ?? "";
            const trigger = (s.description ?? "").split("\n\n---\n\n")[0] ?? "";
            return (
              <li
                key={s.id}
                className="rounded-md border border-zinc-900 bg-zinc-950 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div className="flex items-baseline gap-3">
                    <span className="text-base text-zinc-100">{s.name}</span>
                    <span className="font-mono text-xs text-zinc-600">{s.slug}</span>
                  </div>
                  {warnings.length > 0 ? (
                    <span className="rounded border border-amber-900/60 bg-amber-950/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                      {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                {trigger ? (
                  <p className="mt-2 text-sm text-zinc-300">{trigger}</p>
                ) : (
                  <p className="mt-2 text-sm italic text-zinc-600">(no trigger description)</p>
                )}
                {warnings.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-amber-200/80">
                    {warnings.map((w, i) => (
                      <li key={i}>
                        <span className="text-amber-400">⚠</span> {w}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {sourcePath ? (
                  <p className="mt-2 font-mono text-[11px] text-zinc-600">{sourcePath}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
