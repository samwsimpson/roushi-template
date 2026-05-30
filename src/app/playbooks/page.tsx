import Link from "next/link";
import { listPlaybooks } from "../../lib/playbooks";
import { IntroPanel } from "../components/IntroPanel";
import { Tooltip } from "../components/Tooltip";

// Queries the brain on every load — must be dynamic. Build-time prerendering
// would crash on a fresh deploy where the entities table doesn't exist yet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Playbooks — Roushi",
};

const TRIGGER_LABELS: Record<string, string> = {
  project_created: "Project created",
  project_updated: "Project updated",
  scope_changed: "Scope changed",
  tech_stack_changed: "Tech stack changed",
  significant_change: "Significant change",
  entity_added: "Entity added",
  manual: "Manual",
};

const TRIGGER_TOOLTIPS: Record<string, string> = {
  project_created: "Fires the first time a project is added via `add-project`",
  project_updated: "Fires when an existing project is refreshed",
  scope_changed: "Fires when PROJECT_SCOPE.md (or equivalent) changes",
  tech_stack_changed: "Fires when TECH_STACK.md changes",
  significant_change: "Fires on a meaningful commit (caller-defined threshold)",
  entity_added: "Fires when any new entity lands in the brain",
  manual: "Only fires when explicitly triggered",
};

export default async function PlaybooksPage() {
  const items = await listPlaybooks({ activeOnly: false });
  const active = items.filter((p) => p.active);
  const draft = items.filter((p) => !p.active);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <IntroPanel
        storageKey="roushi-intro-playbooks"
        title="Standing instructions that fire on events"
        helpAnchor="#playbooks"
      >
        Playbooks are recurring rules. A playbook says: <em>"when X happens, do Y, Z, and W."</em>{" "}
        v0.2.0 stores playbooks and surfaces them when matching events happen (e.g. adding a project)
        — the agent or you sees the actions and decides what to act on. Auto-execution lands in v0.3.
      </IntroPanel>

      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-light text-zinc-200">
          {active.length} active <span className="text-zinc-500">/ {items.length} total</span>
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href="/playbooks/runs"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            All runs →
          </Link>
          <Link
            href="/playbooks/new"
            className="rounded-md border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm text-emerald-100 transition hover:bg-emerald-900/60"
          >
            + New playbook
          </Link>
        </div>
      </div>

      <PlaybookList title="Active" items={active} />
      {draft.length > 0 ? <PlaybookList title="Drafts (inactive)" items={draft} /> : null}

      {items.length === 0 ? (
        <p className="rounded-md border border-zinc-900 bg-zinc-950 p-6 text-sm text-zinc-500">
          No playbooks yet. Click <strong>+ New playbook</strong> to write your first standing rule.
        </p>
      ) : null}
    </main>
  );
}

function PlaybookList({
  title,
  items,
}: {
  title: string;
  items: Awaited<ReturnType<typeof listPlaybooks>>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-xs uppercase tracking-wide text-zinc-500">{title}</h2>
      <ul className="divide-y divide-zinc-900 rounded-md border border-zinc-900">
        {items.map((p) => (
          <li key={p.id} className="flex items-start gap-4 px-4 py-3 transition hover:bg-zinc-950/60">
            <Tooltip text={TRIGGER_TOOLTIPS[p.trigger] ?? p.trigger}>
              <span className="mt-0.5 shrink-0 cursor-help rounded border border-cyan-900/60 bg-cyan-950/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-cyan-300">
                {TRIGGER_LABELS[p.trigger] ?? p.trigger}
              </span>
            </Tooltip>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-3">
                <Link
                  href={`/playbooks/${p.slug}`}
                  className="text-base text-zinc-100 transition hover:text-emerald-400"
                >
                  {p.name}
                </Link>
                <span className="text-xs text-zinc-600">{p.slug}</span>
                {!p.active ? (
                  <span className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">draft</span>
                ) : null}
              </div>
              {p.appliesToSlugs.length > 0 ? (
                <p className="mt-1 text-xs text-zinc-500">
                  applies to: <span className="text-zinc-300">{p.appliesToSlugs.join(", ")}</span>
                </p>
              ) : null}
              <ul className="mt-2 space-y-0.5 text-sm text-zinc-400">
                {p.actions.slice(0, 3).map((action, i) => (
                  <li key={i}>
                    <span className="text-zinc-700">→</span> {action}
                  </li>
                ))}
                {p.actions.length > 3 ? (
                  <li className="text-xs text-zinc-600">+{p.actions.length - 3} more actions</li>
                ) : null}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
