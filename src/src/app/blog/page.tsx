import Link from "next/link";
import { MasterMark } from "../components/MasterMark";
import { SealStamp } from "../components/SealStamp";

export const metadata = {
  title: "Blog",
  description: "Notes from building a portfolio brain.",
};

export default function BlogPage() {
  return (
    <>
      <MasterMark variant="watermark" />
      <main className="mx-auto max-w-3xl px-6 pb-32 pt-12 sm:pt-20">
        <header className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-zinc-400">
            Blog
          </p>
          <div className="mt-6 flex justify-center">
            <SealStamp variant="static" rotate={-2}>
              Coming soon
            </SealStamp>
          </div>
          <h1 className="mt-8 font-serif italic text-zinc-50" style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)" }}>
            Notes coming.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-zinc-300">
            Essays on building a portfolio brain — the architecture choices, the operator
            mindset, the failures worth remembering. First piece is being drafted. Until then,
            the public commit log is the closest thing to a changelog of how the thinking
            evolved.
          </p>
        </header>

        <hr className="my-20 border-0 border-t border-zinc-900" />

        <section className="text-center">
          <p className="text-lg text-zinc-300">
            Subscribe will live here when there&apos;s something to subscribe to.
          </p>
          <div className="mt-8 flex justify-center gap-6 text-sm">
            <Link href="/changelog" className="seal-underline text-zinc-300">
              Public changelog →
            </Link>
            <a
              href="https://github.com/samwsimpson/Roushi/commits/main"
              target="_blank"
              rel="noreferrer noopener"
              className="seal-underline text-zinc-300"
            >
              Commit log →
            </a>
          </div>
        </section>
      </main>
    </>
  );
}
