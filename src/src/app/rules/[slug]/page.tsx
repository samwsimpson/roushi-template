import Link from "next/link";
import { notFound } from "next/navigation";
import { getRule } from "../../../lib/rules";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function RuleDetailPage({ params }: Props) {
  const { slug } = await params;
  const r = await getRule(slug);
  if (!r) notFound();

  const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
  const scopeLabel = describeScope(fm);
  const priority = typeof fm.priority === "string" ? fm.priority : "normal";

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link href="/rules" className="text-sm text-zinc-500 hover:text-zinc-300">
          ← All rules
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl font-light text-zinc-100">{r.name}</h1>
        <p className="mt-2 font-mono text-xs text-zinc-500">{r.slug}</p>
        <div className="mt-3 flex flex-wrap items-baseline gap-3 text-xs">
          <span className="rounded border border-violet-900/60 bg-violet-950/40 px-2 py-0.5 uppercase tracking-wide text-violet-300">
            {scopeLabel}
          </span>
          <span className="rounded border border-zinc-800 bg-zinc-900/40 px-2 py-0.5 uppercase tracking-wide text-zinc-400">
            priority: {priority}
          </span>
          <span className="text-zinc-600">
            updated {new Date(r.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        </div>
      </header>

      <section className="mb-6 rounded-md border border-zinc-900 bg-zinc-950 px-4 py-3 text-sm text-zinc-300">
        <h2 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">How this rule works</h2>
        <p>
          The body below isn&apos;t code Roushi runs — it&apos;s an instruction Claude reads.
          When you open Claude Code in a workspace this rule applies to ({scopeLabel}), the
          rule&apos;s text is loaded into Claude&apos;s context automatically via the SessionStart
          hook. Claude then follows it as you work without you needing to repeat the
          instruction. The agent is the runtime.
        </p>
        <p className="mt-2 text-zinc-500">
          <strong className="text-zinc-300">To verify it&apos;s active in a workspace</strong>: look for{" "}
          <code className="rounded bg-zinc-900 px-1 py-0.5">
            roushi-rule_{r.slug}.md
          </code>{" "}
          in that workspace&apos;s{" "}
          <code className="rounded bg-zinc-900 px-1 py-0.5">.claude/projects/&lt;dir&gt;/memory/</code>{" "}
          directory.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs uppercase tracking-wider text-zinc-500">Rule body (what Claude reads)</h2>
        <pre className="overflow-auto whitespace-pre-wrap rounded-md border border-zinc-900 bg-zinc-950 p-5 text-sm leading-relaxed text-zinc-200">
          {r.description ?? "(empty)"}
        </pre>
      </section>

      {r.sourcePath ? (
        <p className="text-xs text-zinc-600">
          source: <code className="text-zinc-500">{r.sourcePath}</code>
        </p>
      ) : null}
    </main>
  );
}

function describeScope(fm: Record<string, unknown>): string {
  if (typeof fm.applies_to_slug === "string" && fm.applies_to_slug) return `product: ${fm.applies_to_slug}`;
  if (typeof fm.applies_to_type === "string" && fm.applies_to_type) return `every ${fm.applies_to_type}`;
  if (fm.applies_to === "portfolio") return "portfolio-wide";
  return "no scope (won't propagate)";
}
