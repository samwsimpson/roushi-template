import Link from "next/link";
import type { Session } from "next-auth";
import { auth, authEnabled } from "../auth";
import { listGoals } from "../lib/goals";
import { hybridSearch } from "../lib/search";
import { think } from "../lib/think";
import { AnswerBody } from "./components/AnswerBody";
import { AskForm } from "./components/AskForm";
import { MarketingHomepage } from "./components/MarketingHomepage";
import { recentEntities } from "./lib/queries";

interface PageProps {
  searchParams: Promise<{ q?: string; mode?: string; view?: string }>;
}

const TYPE_COLORS: Record<string, string> = {
  product: "text-emerald-400 border-emerald-900/60 bg-emerald-950/40",
  tech: "text-sky-400 border-sky-900/60 bg-sky-950/40",
  vendor: "text-amber-400 border-amber-900/60 bg-amber-950/40",
  pattern: "text-violet-400 border-violet-900/60 bg-violet-950/40",
  decision: "text-rose-400 border-rose-900/60 bg-rose-950/40",
  lesson: "text-zinc-400 border-zinc-800 bg-zinc-900/40",
  incident: "text-orange-400 border-orange-900/60 bg-orange-950/40",
  goal: "text-yellow-400 border-yellow-900/60 bg-yellow-950/40",
  person: "text-pink-400 border-pink-900/60 bg-pink-950/40",
  roadmap_item: "text-cyan-400 border-cyan-900/60 bg-cyan-950/40",
  rule: "text-fuchsia-400 border-fuchsia-900/60 bg-fuchsia-950/40",
};

const SUGGESTED_QUERIES = [
  "what gotchas have we hit with Inngest",
  "which products use Auth.js v5",
  "trusted publishing",
  "auth.js v5 edge runtime",
  "what's the shipment sweep for Kodori",
];

export default async function HomePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const mode = params.mode === "search" ? "search" : "ask";
  const forceMarketing = params.view === "marketing";

  // Signed-out visitors get the marketing homepage; signed-in operators
  // land on the Ask interface — unless they explicitly opt into the
  // marketing view via `?view=marketing` (e.g. via the "Public site"
  // link in the app nav). The proxy lets `/` through unauthenticated
  // so the marketing branch can actually run.
  let session: Session | null = null;
  if (authEnabled) {
    try {
      session = (await auth()) as Session | null;
    } catch (err) {
      console.error("[page] auth() failed:", err);
    }
  }
  if ((authEnabled && !session && !q) || forceMarketing) {
    return <MarketingHomepage />;
  }

  if (q) {
    if (mode === "search") {
      const hits = await hybridSearch(q, { limit: 15 });
      return <SearchResults q={q} hits={hits} />;
    }
    const result = await think(q);
    return <AskResults q={q} result={result} />;
  }

  const [activeGoals, recent] = await Promise.all([
    listGoals({ status: "active", limit: 5 }),
    recentEntities(8),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <AskHero />

      <div className="mt-16 grid gap-10 md:grid-cols-2">
        <section>
          <SectionHeader title="Active goals" href="/goals" count={activeGoals.length} />
          {activeGoals.length === 0 ? (
            <EmptyHint>
              No active goals.{" "}
              <span className="text-zinc-500">
                Add one via <code className="rounded bg-zinc-900 px-1.5 py-0.5">pnpm roushi goal add</code>.
              </span>
            </EmptyHint>
          ) : (
            <ul className="space-y-2">
              {activeGoals.map((g) => (
                <li
                  key={g.id}
                  className="flex items-baseline justify-between gap-4 rounded-md border border-zinc-900 bg-zinc-950 px-3 py-2"
                >
                  <span className="truncate text-sm text-zinc-200">{g.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {g.targetDate
                      ? new Date(g.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionHeader title="Recently added" href="/entities" />
          {recent.length === 0 ? (
            <EmptyHint>
              No entities yet.{" "}
              <Link href="/projects/new" className="text-emerald-400 hover:underline">
                Add the first project
              </Link>
              .
            </EmptyHint>
          ) : (
            <ul className="space-y-2">
              {recent.map((e) => {
                const colorClass = TYPE_COLORS[e.type] ?? TYPE_COLORS.lesson;
                return (
                  <li key={e.id}>
                    <Link
                      href={`/entities/${e.slug}`}
                      className="flex items-baseline gap-3 rounded-md border border-zinc-900 bg-zinc-950 px-3 py-2 transition hover:border-zinc-700"
                    >
                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${colorClass}`}
                      >
                        {e.type}
                      </span>
                      <span className="truncate text-sm text-zinc-200">{e.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

function AskHero() {
  return (
    <div className="text-center">
      <div className="font-serif text-5xl text-zinc-50">老師</div>
      <p className="mt-3 text-sm text-zinc-500">Ask the master.</p>

      <AskForm variant="hero" />

      <p className="mt-3 text-xs text-zinc-600">
        Roushi composes an answer with citations + tells you what the brain doesn't know yet.{" "}
        <Link href="/?mode=search" className="text-zinc-500 underline-offset-2 hover:underline">
          Need raw results? Switch to search.
        </Link>
      </p>

      <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs text-zinc-600">
        <span>try:</span>
        {SUGGESTED_QUERIES.map((s) => (
          <Link
            key={s}
            href={`/?q=${encodeURIComponent(s)}`}
            className="rounded-full border border-zinc-900 bg-zinc-950 px-2 py-0.5 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            {s}
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionHeader({ title, href, count }: { title: string; href: string; count?: number }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500">
        {title}
        {typeof count === "number" ? <span className="ml-2 text-zinc-700">({count})</span> : null}
      </h2>
      <Link href={href} className="text-xs text-zinc-500 transition hover:text-zinc-200">
        see all →
      </Link>
    </div>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-900 bg-zinc-950/40 px-3 py-4 text-sm text-zinc-400">
      {children}
    </div>
  );
}

async function AskResults({ q, result }: { q: string; result: Awaited<ReturnType<typeof think>> }) {
  const citedSlugs = new Set(result.answer.citations.map((c) => c.slug));

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <AskForm variant="inline" initialQuery={q} />
      <div className="mb-6 flex items-baseline justify-between text-xs">
        <span className="text-zinc-600">
          Asked the master · grounded on {result.hits.length} entit{result.hits.length === 1 ? "y" : "ies"} · model{" "}
          {result.modelUsed}
        </span>
        <div className="flex items-baseline gap-3">
          <Link
            href={`/?mode=search&q=${encodeURIComponent(q)}`}
            className="text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            see raw hits
          </Link>
          <Link href="/" className="text-zinc-500 hover:text-zinc-200">
            ← home
          </Link>
        </div>
      </div>

      <article className="rounded-md border border-zinc-900 bg-zinc-950 px-5 py-4 text-base">
        <AnswerBody body={result.answer.answer} />
      </article>

      {result.answer.citations.length > 0 ? (
        <section className="mt-6">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Citations</h3>
          <ul className="space-y-1.5">
            {result.answer.citations.map((c) => (
              <li key={c.slug} className="flex items-baseline gap-3 text-sm">
                <Link
                  href={`/entities/${c.slug}`}
                  className="shrink-0 font-mono text-xs text-emerald-400 hover:underline"
                >
                  [{c.slug}]
                </Link>
                <span className="text-zinc-400">{c.why}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.answer.gaps.length > 0 ? (
        <section className="mt-6 rounded-md border border-amber-900/60 bg-amber-950/20 px-4 py-3">
          <h3 className="mb-2 text-xs uppercase tracking-wider text-amber-400">What the brain doesn't know yet</h3>
          <ul className="space-y-1 text-sm text-amber-100/80">
            {result.answer.gaps.map((g, i) => (
              <li key={i} className="flex items-baseline gap-2">
                <span className="text-amber-500">·</span>
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result.hits.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
            Show the {result.hits.length} retrieved entit{result.hits.length === 1 ? "y" : "ies"} the answer was grounded on
          </summary>
          <ul className="mt-3 space-y-2">
            {result.hits.map((h) => {
              const colorClass = TYPE_COLORS[h.entity.type] ?? TYPE_COLORS.lesson;
              const wasCited = citedSlugs.has(h.entity.slug);
              return (
                <li key={h.entity.id}>
                  <Link
                    href={`/entities/${h.entity.slug}`}
                    className={`flex items-start gap-3 rounded-md border bg-zinc-950 p-2.5 transition ${
                      wasCited ? "border-emerald-900/60" : "border-zinc-900 hover:border-zinc-700"
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${colorClass}`}
                    >
                      {h.entity.type}
                    </span>
                    <span className="truncate text-sm text-zinc-200">{h.entity.name}</span>
                    <span className="shrink-0 text-[10px] text-zinc-600">{h.source}</span>
                    {wasCited ? (
                      <span className="shrink-0 text-[10px] text-emerald-500">cited</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </main>
  );
}

async function SearchResults({
  q,
  hits,
}: {
  q: string;
  hits: Awaited<ReturnType<typeof hybridSearch>>;
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <form className="mb-2">
        <input type="hidden" name="mode" value="search" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-base text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
        />
      </form>

      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-sm text-zinc-500">
          {hits.length} raw {hits.length === 1 ? "result" : "results"} for{" "}
          <span className="text-zinc-300">"{q}"</span>
        </h1>
        <div className="flex items-baseline gap-3 text-xs">
          <Link
            href={`/?q=${encodeURIComponent(q)}`}
            className="text-zinc-500 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            ask instead
          </Link>
          <Link href="/" className="text-zinc-500 hover:text-zinc-200">
            ← home
          </Link>
        </div>
      </div>

      {hits.length === 0 ? (
        <p className="rounded-md border border-zinc-900 bg-zinc-950 p-6 text-sm text-zinc-500">
          Nothing matched. The brain may not know about this yet — try{" "}
          <Link href="/projects/new" className="text-emerald-400 hover:underline">
            adding the project
          </Link>{" "}
          or ingesting a markdown file.
        </p>
      ) : (
        <ul className="space-y-2">
          {hits.map((h) => {
            const colorClass = TYPE_COLORS[h.entity.type] ?? TYPE_COLORS.lesson;
            return (
              <li key={h.entity.id}>
                <Link
                  href={`/entities/${h.entity.slug}`}
                  className="flex items-start gap-3 rounded-md border border-zinc-900 bg-zinc-950 p-3 transition hover:border-zinc-700"
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${colorClass}`}
                  >
                    {h.entity.type}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <span className="truncate text-base text-zinc-100">{h.entity.name}</span>
                      <span className="shrink-0 text-[10px] text-zinc-600">{h.source}</span>
                    </div>
                    {h.entity.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                        {h.entity.description.replace(/^#[^\n]*\n+/, "").slice(0, 240)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
