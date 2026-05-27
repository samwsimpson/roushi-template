import { AddProjectForm } from "../../components/AddProjectForm";

export const metadata = {
  title: "Add project — Roushi",
};

export default function NewProjectPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-light text-zinc-100">Add a project to the brain</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Roushi reads your project's docs (CLAUDE.md, PROJECT_SCOPE.md, README, etc.) from the
          path you provide, ingests its per-project Claude memory if present, runs LLM extraction
          (~$0.01) to split docs into typed sub-entities (tech, vendor, decision, pattern, lesson),
          and writes applicable rules into the workspace's Claude memory directory. Idempotent —
          re-running on the same path just refreshes. Use <strong>Browse</strong> to pick a folder.
        </p>
      </header>

      <AddProjectForm />
    </main>
  );
}
