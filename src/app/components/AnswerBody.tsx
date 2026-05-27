"use client";

// Renders a `think` answer body with two layered concerns:
//   1. The body is markdown (the LLM uses **bold**, ## headings, lists, etc.)
//   2. Embedded [slug] citations should become clickable links to the
//      entity detail page.
//
// We can't just use react-markdown alone because [slug] isn't markdown
// link syntax — it's plain bracketed text. So we pre-transform every
// `[slug]` into a markdown link `[slug](/entities/slug)` that
// react-markdown understands natively, then style citation links via a
// custom `a` renderer.

import Link from "next/link";
import ReactMarkdown from "react-markdown";

interface Props {
  body: string;
}

const CITE_RE = /\[([a-z0-9][a-z0-9-]*)\]/g;

export function AnswerBody({ body }: Props) {
  // Pre-transform [slug] → [slug](/entities/slug) so react-markdown
  // treats it as a link. We use a marker pathname so the custom `a`
  // renderer can detect citation links and style them differently from
  // any other markdown link the LLM might produce.
  const preprocessed = body.replace(CITE_RE, (_match, slug: string) => `[${slug}](/entities/${slug} "roushi-citation")`);

  return (
    <div className="leading-relaxed text-zinc-100">
      <ReactMarkdown
        components={{
          // Paragraphs need vertical breathing room.
          p({ children }) {
            return <p className="mb-3 last:mb-0">{children}</p>;
          },
          strong({ children }) {
            return <strong className="font-semibold text-zinc-50">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic text-zinc-200">{children}</em>;
          },
          // The LLM occasionally drops in ## headings — render them in-step with body weight.
          h1({ children }) {
            return <h2 className="mb-2 mt-5 text-lg font-semibold text-zinc-50">{children}</h2>;
          },
          h2({ children }) {
            return <h2 className="mb-2 mt-5 text-base font-semibold text-zinc-50">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-wide text-zinc-400">{children}</h3>;
          },
          ul({ children }) {
            return <ul className="mb-3 list-disc space-y-1 pl-5 text-zinc-200 last:mb-0">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="mb-3 list-decimal space-y-1 pl-5 text-zinc-200 last:mb-0">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-3 border-l-2 border-zinc-800 pl-4 italic text-zinc-300">
                {children}
              </blockquote>
            );
          },
          pre({ children }) {
            return (
              <pre className="my-3 overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-sm">
                {children}
              </pre>
            );
          },
          // Inline code: muted background that reads cleanly in dark mode.
          code({ children, className, ...rest }) {
            return (
              <code
                className={`rounded bg-zinc-900 px-1 py-0.5 font-mono text-[0.9em] text-zinc-200 ${className ?? ""}`}
                {...rest}
              >
                {children}
              </code>
            );
          },
          a({ href, title, children, ...rest }) {
            const isCitation = title === "roushi-citation";
            if (isCitation && typeof href === "string") {
              return (
                <Link href={href} className="font-mono text-sm text-emerald-400 no-underline hover:underline">
                  [{children}]
                </Link>
              );
            }
            const isExternal = typeof href === "string" && /^https?:\/\//.test(href);
            return (
              <a
                href={href}
                {...(isExternal ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                {...rest}
                className="text-emerald-400 underline-offset-2 hover:underline"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {preprocessed}
      </ReactMarkdown>
    </div>
  );
}
