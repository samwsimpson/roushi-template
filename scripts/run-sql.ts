#!/usr/bin/env tsx
// Run a multi-statement SQL file against Neon.
// Uses postgres.js in simple-query mode so PL/pgSQL function bodies (with
// internal semicolons) and CREATE EXTENSION statements work in one shot.
//
// Usage: pnpm tsx scripts/run-sql.ts <path-to-sql-file>
//
// Env-loading: opportunistically loads `.env.local` if it exists. Works in
// both contexts without changes to package.json scripts:
//   - Local dev: .env.local exists, dotenv loads it
//   - Vercel build: no .env.local, but Vercel injects env vars into
//     process.env directly — dotenv is a no-op, process.env has what we need

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import postgres from "postgres";

if (existsSync(".env.local")) {
  loadDotenv({ path: ".env.local" });
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("usage: tsx scripts/run-sql.ts <path-to-sql-file>");
  process.exit(1);
}

function requireDatabaseUrl(): string {
  const v = process.env.DATABASE_URL;
  if (!v) {
    console.error(
      "DATABASE_URL is required. Local dev: ensure .env.local exists with DATABASE_URL set. Vercel build: ensure the Neon Marketplace integration is connected to this project.",
    );
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
