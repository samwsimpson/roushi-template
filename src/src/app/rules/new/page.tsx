import { NewRuleForm } from "../../components/NewRuleForm";

export const metadata = {
  title: "New rule — Roushi",
};

export default function NewRulePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="mb-2 text-2xl font-light text-zinc-100">New rule</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        Write a durable instruction Roushi will materialize into every applicable workspace&apos;s
        Claude memory directory. The agent in that workspace reads it on session start and obeys
        automatically. Write the body the way you&apos;d write a memo to a smart collaborator who
        has never seen this project — explain when it applies, what to do, and why.
      </p>
      <NewRuleForm />
    </main>
  );
}
