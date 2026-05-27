import Link from "next/link";
import { listRules } from "../../lib/rules";

export const metadata = {
  title: "Rules — Roushi",
};

type RuleScope = "slug" | "type" | "portfolio" | "unscoped";

export default async function RulesPage() {
  const all = await listRules();
  const grouped: Record<RuleScope, typeof all> = {
    slug: [],
    type: [],
    portfolio: [],
    unscoped: [],
  };
  for (const r of all) grouped[scopeOf(r)].push(r);

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-2 flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-light text-zinc-100">Rules</h1>
        <Link
          href="/rules/new"
          className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-100 transition hover:bg-emerald-900/60"
        >
          + New rule
        </Link>
      </header>
      <p className="mb-8 max-w-3xl text-sm text-zinc-400">
        Rules are durable instructions Roushi writes into each workspace&apos;s Claude memory directory
        so the agent follows them automatically. Edit a rule here once, and it propagates to every
        workspace it applies to the next time you run{" "}
        <code className="rounded bg-zinc-900 px-1.5 py-0.5">pnpm roushi rules sync</code> (or
        automatically when you add a project). The agent is the runtime.
      </p>

      <ScopeSection
        title="Product-specific"
        subtitle="Apply only to the named product"
        items={grouped.slug}
      />
      <ScopeSection
        title="By entity type"
        subtitle="Apply to every entity of this type (typically every product)"
        items={grouped.type}
      />
      <ScopeSection
        title="Portfolio-wide"
        subtitle="Apply to every workspace in the KumoKodo portfolio"
        items={grouped.portfolio}
      />
      {grouped.unscoped.length > 0 ? (
        <ScopeSection
          title="Unscoped (won't propagate)"
          subtitle="No applies_to_* set — sync will never write these out"
          items={grouped.unscoped}
        />
      ) : null}
    </main>
  );
}

function ScopeSection({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle: string;
  items: Awaited<ReturnType<typeof listRules>>;
}) {
  return (
    <section className="mb-10">
      <header className="mb-3">
        <h2 className="flex items-baseline gap-3 text-xs uppercase tracking-wider text-zinc-500">
          {title}
          <span className="text-zinc-700">({items.length})</span>
        </h2>
        <p className="mt-1 text-xs text-zinc-600">{subtitle}</p>
      </header>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-900 bg-zinc-950/40 px-3 py-4 text-sm text-zinc-500">
          None yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => {
            const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
            const priority = typeof fm.priority === "string" ? fm.priority : "normal";
            const scopeLabel = scopeOfLabel(r);
            return (
              <li key={r.id}>
                <Link
                  href={`/rules/${r.slug}`}
                  className="block rounded-md border border-zinc-900 bg-zinc-950 px-4 py-3 transition hover:border-zinc-700"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="truncate text-base text-zinc-100">{r.name}</span>
                    <div className="flex shrink-0 items-baseline gap-3 text-[10px] uppercase tracking-wide">
                      <span className="rounded border border-violet-900/60 bg-violet-950/40 px-1.5 py-0.5 text-violet-300">
                        {scopeLabel}
                      </span>
                      <span className={priorityClass(priority)}>{priority}</span>
                    </div>
                  </div>
                  <p className="mt-1 font-mono text-xs text-zinc-600">{r.slug}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function scopeOf(r: Awaited<ReturnType<typeof listRules>>[number]): RuleScope {
  const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
  if (typeof fm.applies_to_slug === "string" && fm.applies_to_slug) return "slug";
  if (typeof fm.applies_to_type === "string" && fm.applies_to_type) return "type";
  if (fm.applies_to === "portfolio") return "portfolio";
  return "unscoped";
}

function scopeOfLabel(r: Awaited<ReturnType<typeof listRules>>[number]): string {
  const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
  if (typeof fm.applies_to_slug === "string" && fm.applies_to_slug) return fm.applies_to_slug;
  if (typeof fm.applies_to_type === "string" && fm.applies_to_type) return `every ${fm.applies_to_type}`;
  if (fm.applies_to === "portfolio") return "portfolio";
  return "no scope";
}

function priorityClass(p: string): string {
  if (p === "high") return "rounded border border-rose-900/60 bg-rose-950/40 px-1.5 py-0.5 text-rose-300";
  if (p === "low") return "rounded border border-zinc-800 bg-zinc-900/40 px-1.5 py-0.5 text-zinc-500";
  return "rounded border border-zinc-800 bg-zinc-900/40 px-1.5 py-0.5 text-zinc-400";
}
