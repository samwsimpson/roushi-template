import { authEnabled } from "../../../auth";
import { signInWithGitHubAction } from "./actions";

interface Props {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export const metadata = {
  title: "Sign in — Roushi",
};

export default async function SignInPage({ searchParams }: Props) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/";
  const error = params.error;

  return (
    <main className="mx-auto flex max-w-md flex-col justify-center px-6 py-24">
      <div className="space-y-6">
        <div>
          <span className="font-serif text-5xl text-zinc-50">老師</span>
          <h1 className="mt-3 text-2xl font-light text-zinc-100">Sign in to Roushi</h1>
          <p className="mt-2 text-sm text-zinc-500">Ask the master.</p>
        </div>

        {!authEnabled ? (
          <div className="rounded-md border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
            Auth is not yet configured on this server. Set <code className="rounded bg-amber-950 px-1">AUTH_GITHUB_ID</code>{" "}
            and <code className="rounded bg-amber-950 px-1">AUTH_GITHUB_SECRET</code> in <code>.env.local</code> to enable
            GitHub sign-in. Until then, the UI is open with no auth required.
          </div>
        ) : (
          <form action={signInWithGitHubAction}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-3 rounded-md border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              Continue with GitHub
            </button>
          </form>
        )}

        {error ? (
          <div className="rounded-md border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
            {error === "AccessDenied"
              ? "Access denied. Your GitHub account isn't on the allow-list (see AUTH_ALLOWED_EMAILS)."
              : `Sign-in error: ${error}`}
          </div>
        ) : null}

        <p className="text-xs text-zinc-600">
          Roushi is a single-tenant brain for the KumoKodo portfolio. Sign-in is gated by{" "}
          <code className="text-zinc-500">AUTH_ALLOWED_EMAILS</code>.
        </p>
      </div>
    </main>
  );
}
