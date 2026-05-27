"use client";

// Root-level error boundary. Catches anything thrown during render of the root
// layout or any page not covered by a closer error boundary. Renders the actual
// error so we can diagnose without dashboard access.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global error boundary] caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0a0a0a", color: "#ededed", margin: 0, padding: "32px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontSize: 22, fontWeight: 300, margin: "0 0 12px" }}>Application crashed at root</h1>
          <p style={{ fontSize: 13, color: "#a3a3a3", marginBottom: 20 }}>
            Root layout or unhandled render error. Showing the message + stack so we can fix without dashboard access.
          </p>
          <div
            style={{
              border: "1px solid #7f1d1d",
              background: "rgba(127,29,29,0.15)",
              padding: 14,
              borderRadius: 6,
              marginBottom: 14,
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
              color: "#fca5a5",
            }}
          >
            <div style={{ marginBottom: 6 }}>{error.name}: {error.message}</div>
            {error.digest ? <div style={{ fontSize: 10, opacity: 0.8 }}>digest: {error.digest}</div> : null}
          </div>
          {error.stack ? (
            <pre
              style={{
                maxHeight: 400,
                overflow: "auto",
                background: "#0a0a0a",
                border: "1px solid #262626",
                padding: 12,
                borderRadius: 6,
                fontSize: 10,
                lineHeight: 1.55,
                color: "#a3a3a3",
                margin: 0,
              }}
            >
              {error.stack}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              background: "#171717",
              border: "1px solid #404040",
              color: "#ededed",
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
