"use client";

// App Router error boundary for /auth/signin. Catches any render-time throw
// from page.tsx (or modules it imports) and shows the actual error instead
// of bouncing the user to Next's generic 500 page. This is the diagnostic
// equivalent of a try/catch in a Server Component — we render the error
// itself so we can see what's failing on Vercel without dashboard access.

import { useEffect } from "react";

export default function SignInError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[/auth/signin error boundary] caught:", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-4 text-2xl font-light text-zinc-100">Sign-in page crashed</h1>
      <p className="mb-6 text-sm text-zinc-400">
        The /auth/signin page threw at render. This is the error so we can see what's wrong:
      </p>
      <div className="space-y-3">
        <div className="rounded-md border border-red-900 bg-red-950/30 p-4 text-sm">
          <div className="mb-2 font-mono text-xs text-red-300">
            {error.name}: {error.message}
          </div>
          {error.digest ? (
            <div className="font-mono text-[10px] text-red-400">digest: {error.digest}</div>
          ) : null}
        </div>
        {error.stack ? (
          <pre className="max-h-96 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] leading-relaxed text-zinc-400">
            {error.stack}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
