#!/usr/bin/env tsx
// Run a multi-statement SQL file against Neon.
// Uses postgres.js in simple-query mode so PL/pgSQL function bodies (with
// internal semicolons) and CREATE EXTENSION statements work in one shot.
//
// Usage: pnpm tsx scripts/run-sql.ts <path-to-sql-file>

import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("usage: tsx scripts/run-sql.ts <path-to-sql-file>");
  process.exit(1);
}

function requireDatabaseUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v) {
    console.error("DATABASE_URL is required (run with `pnpm tsx --env-file=.env.local`)");
    process.exit(1);
  }
  return v;
}

const databaseUrl = requireDatabaseUrl();
const absPath = path.resolve(sqlPath);
const sqlContent = readFileSync(absPath, "utf-8");

async function main(): Promise<void> {
  const sql = postgres(databaseUrl, {
    ssl: "require",
    onnotice: (n) => console.error(`  notice: ${n.message}`),
  });

  try {
    console.error(`→ running ${path.basename(absPath)}`);
    await sql.unsafe(sqlContent);
    console.error(`✓ done`);
  } catch (err) {
    console.error(`✗ failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
