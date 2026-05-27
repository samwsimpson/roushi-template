import { PlaybookForm } from "../../components/PlaybookForm";

export const metadata = {
  title: "New playbook — Roushi",
};

export default function NewPlaybookPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-light text-zinc-100">New playbook</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Define a standing rule that fires when an event matches. The agent (or you) sees the
        actions when an event triggers and decides what to act on. Stored in the brain so future
        sessions can find it via <code>mcp__roushi__playbook_check_for_event</code>.
      </p>
      <PlaybookForm />
    </main>
  );
}
