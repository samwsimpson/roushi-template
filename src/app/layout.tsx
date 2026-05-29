import type { Metadata } from "next";
import { Fraunces, Geist, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Session } from "next-auth";
import { auth, authEnabled } from "../auth";
import { BackToTop } from "./components/BackToTop";
import { TopNav } from "./components/TopNav";
import "./globals.css";

import { Analytics } from "@vercel/analytics/react";
import { GoogleAnalytics } from "@next/third-parties/google";
// Three typefaces wired via CSS variables so Tailwind 4's @theme can read
// them. Loaded once at the root layout — Next inlines and self-hosts so
// there's no third-party request on first paint.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
  axes: ["opsz", "SOFT"],
});
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://roushi.ai"),
  title: {
    default: "Roushi — Ask the master",
    template: "%s — Roushi",
  },
  description:
    "The brain that runs while you build. Roushi indexes every decision, pattern, and lesson across your portfolio — and feeds it back to your IDE and AI agents before you write each next file.",
  openGraph: {
    title: "Roushi — Ask the master",
    description: "The brain that runs while you build.",
    url: "https://roushi.ai",
    siteName: "Roushi",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Roushi — Ask the master",
    description: "The brain that runs while you build.",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Defensive: never let an auth misconfiguration crash every page render.
  // If auth() throws (missing env, JWT verify failure, etc.) we treat as no
  // session and surface the error in stderr so it shows up in Vercel logs
  // without taking the whole UI down.
  let session: Session | null = null;
  if (authEnabled) {
    try {
      session = (await auth()) as Session | null;
    } catch (err) {
      console.error("[layout] auth() failed:", err);
    }
  }

  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${geist.variable} ${jetbrainsMono.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100 antialiased">
        <TopNav
          session={
            session?.user
              ? {
                  user: {
                    name: session.user.name ?? null,
                    email: session.user.email ?? null,
                  },
                }
              : null
          }
          authEnabled={authEnabled}
        />

        <div className="flex-1">{children}</div>

        <footer className="mt-16 border-t border-zinc-900 py-6 text-xs text-zinc-600">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
            <span>老師 · Roushi</span>
            <div className="flex items-center gap-4">
              <Link href="/help" className="transition hover:text-zinc-300">
                Help
              </Link>
              <Link href="/examples" className="transition hover:text-zinc-300">
                Examples
              </Link>
              <Link href="/changelog" className="transition hover:text-zinc-300">
                Changelog
              </Link>
              <a
                href="https://github.com/samwsimpson/roushi-template"
                target="_blank"
                rel="noreferrer noopener"
                className="transition hover:text-zinc-300"
              >
                GitHub
              </a>
            </div>
          </div>
          <div className="mx-auto mt-4 max-w-6xl px-6 text-center text-[11px] text-zinc-700 sm:text-left">
            A{" "}
            <a
              href="https://kumokodo.ai"
              target="_blank"
              rel="noreferrer noopener"
              className="text-zinc-500 transition hover:text-zinc-300"
            >
              KumoKodo.ai
            </a>{" "}
            SaaS application.
          </div>
        </footer>
        <BackToTop />
        <Analytics />
        <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID!} />
      </body>
    </html>
  );
}
