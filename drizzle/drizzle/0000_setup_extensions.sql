-- Run this BEFORE the first `drizzle-kit migrate` on a fresh Neon database.
-- It installs the extensions Roushi depends on. Idempotent.
--
-- After generating the first schema migration via `pnpm db:generate`, add an
-- additional post-migration SQL file (e.g. 0002_indexes_and_triggers.sql)
-- that creates the HNSW vector index and the tsvector update trigger,
-- since those can't be expressed in the Drizzle schema directly.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
