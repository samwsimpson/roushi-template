// Drizzle + Neon HTTP client.
//
// Build-vs-runtime: At Vercel build time, Next's page-data collection imports
// auth.ts → db/client.ts even before env vars are applied. If DATABASE_URL
// isn't set, or is malformed (e.g. quote-wrapped by accident on the Vercel UI),
// we fall back to a stub URL so the module constructs cleanly and Auth.js's
// DrizzleAdapter can detect the dialect via its standard checks. Any actual
// query at runtime obviously still needs a real DATABASE_URL — there's a
// loud stderr warning if we had to fall back.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const BUILD_TIME_STUB = "postgres://stub:stub@stub.local.invalid/stub";

function resolveDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return BUILD_TIME_STUB;

  // Defend against the common Vercel-paste bug where the user copies
  // `DATABASE_URL="postgres://..."` from .env.local and pastes the WHOLE
  // value (quotes included) into Vercel's UI. Strip a single layer of
  // matching surrounding quotes if present.
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
    console.warn(
      "[db/client] DATABASE_URL was wrapped in quotes — stripped. " +
        "Set the raw value (no surrounding quotes) on Vercel env-var UI.",
    );
  }

  // Sanity-check the URL parses. If not, fall back to stub so the module
  // still loads (Auth.js adapter can construct, etc.); queries will still
  // fail loudly with a useful error.
  try {
    // eslint-disable-next-line no-new
    new URL(cleaned);
    return cleaned;
  } catch {
    console.error(
      `[db/client] DATABASE_URL is set but not a valid URL — falling back to stub. ` +
        `Got: ${cleaned.slice(0, 20)}… (length ${cleaned.length})`,
    );
    return BUILD_TIME_STUB;
  }
}

const url = resolveDatabaseUrl();

if (url === BUILD_TIME_STUB && process.env.NODE_ENV === "production" && process.env.VERCEL !== "1") {
  console.error(
    "[db/client] WARNING: using stub DATABASE_URL at runtime — every query will fail. " +
      "Set DATABASE_URL on the deploy target with the raw value (no surrounding quotes).",
  );
}

const sql = neon(url);

export const db = drizzle(sql, { schema, casing: "snake_case" });

export type DbClient = typeof db;
