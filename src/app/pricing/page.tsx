import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "Pricing",
  description: "Pricing during private beta, and what the plans will probably look like at GA.",
};

const TIERS = [
  {
    name: "Free",
    target: "Single user · single workspace · experimentation",
    price: "—",
    note: "(TBD)",
    features: [
      "Up to 10,000 entities",
      "Hybrid search + graph traversal",
      "Local stdio MCP",
      "Web UI + CLI",
    ],
  },
  {
    name: "Pro",
    target: "Single operator · full toolkit",
    price: "—",
    note: "(TBD — ~$29/mo target)",
    features: [
      "Unlimited entities",
      "Cron-driven self-maintenance",
      "Deployed HTTPS MCP",
      "Event triggers (cron + webhook)",
    ],
    highlight: true,
  },
  {
    name: "Team",
    target: "Small portfolio operators · shared brain",
    price: "—",
    note: "(TBD — ~$99/mo + per-seat target)",
    features: [
      "Multi-user workspaces",
      "Shared rule + skill distribution",
      "Agent coordination via scratchpad",
      "SSO (when available)",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            Pricing
          </p>
          <div className="mt-6 flex justify-center">
            <SealStamp variant="static" rotate={-3}>
              Private beta
            </SealStamp>
          </div>
          <h1 className="mt-8 font-serif italic text-zinc-50" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            Free during beta.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-zinc-300">
            Roushi is single-tenant during the private beta. When it opens, the plan shape
            will likely look like this — numbers are placeholders until I see how operators
            actually use it.
          </p>
        </header>

        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {TIERS.map((t) => (
            <article
              key={t.name}
              className={`relative border bg-zinc-950 p-6 ${
                t.highlight
                  ? "border-vermilion/40"
                  : "border-zinc-900"
              }`}
            >
              <h2 className="font-serif italic text-2xl text-zinc-50">{t.name}</h2>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-zinc-400">
                {t.target}
              </p>
              <p className="mt-6 font-serif text-3xl text-zinc-50">{t.price}</p>
              <p className="mt-1 font-mono text-xs text-zinc-500">{t.note}</p>
              <ul className="mt-6 space-y-2.5 text-base">
                {t.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-zinc-300">
                    <span className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            The honest version: I'm not optimizing pricing yet. I want operators using it.
          </p>
          <div className="mt-8 flex justify-center">
            <SealStamp href="/#request-beta">Request beta access</SealStamp>
          </div>
        </section>
      </main>
    </>
  );
}
