import { routes, type VercelConfig } from "@vercel/config/v1";

// Cron schedules invoke the routes at src/app/api/cron/*. Each route
// requires `Authorization: Bearer ${CRON_SECRET}` in production (Vercel
// adds this header automatically when CRON_SECRET is set on the project).
// Set it on Vercel: Project Settings → Environment Variables → Add
// CRON_SECRET (any random string, e.g. `openssl rand -hex 32`). Without
// it set in prod, every cron invocation returns 401.

export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "pnpm db:setup && pnpm build",
  installCommand: "pnpm install --frozen-lockfile",

  headers: [
    routes.cacheControl("/static/(.*)", {
      public: true,
      maxAge: "1 week",
      immutable: true,
    }),
  ],

  crons: [
    {
      // Decay scan — surfaces entities not validated in ≥90 days.
      // Daily at 3am UTC. Posts a system goal if ≥5 stale entities exist.
      path: "/api/cron/decay",
      schedule: "0 3 * * *",
    },
    {
      // Edge audit — flags wrong / non-canonical edge relations.
      // Weekly on Sunday at 4am UTC. Posts a system goal if ≥10 flagged.
      path: "/api/cron/audit-edges",
      schedule: "0 4 * * 0",
    },
    {
      // Dedupe scan — finds near-duplicate slugs within each entity type.
      // Monthly on the 1st at 5am UTC. Posts a system goal if ≥1 group exists.
      path: "/api/cron/dedupe",
      schedule: "0 5 1 * *",
    },
    {
      // Contradiction scan — pgvector close-pair search + LLM judge over
      // rule + decision + lesson entities. Weekly on Sunday at 6am UTC.
      // Posts a system goal if ≥1 actual contradiction is found.
      // Up to 100 LLM judge calls per run (~$0.01 worst case on gpt-4o-mini).
      path: "/api/cron/contradictions",
      schedule: "0 6 * * 0",
    },
  ],
};
