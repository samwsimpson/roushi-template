-- Run this AFTER `drizzle-kit migrate` produces the schema tables.
-- These structures can't be expressed in the Drizzle schema, so they
-- live here and are applied manually (or via the `pnpm db:post-migrate` script
-- once we wire that up).
--
-- Idempotent — safe to re-run.

-- ─── HNSW index for fast vector similarity search ─────────────────
-- m=16 (default) and ef_construction=64 (default) — tune later if needed
CREATE INDEX IF NOT EXISTS entities_embedding_hnsw_idx
  ON entities
  USING hnsw (embedding vector_cosine_ops);

-- ─── GIN index on the tsvector for full-text search ───────────────
CREATE INDEX IF NOT EXISTS entities_search_vector_gin_idx
  ON entities
  USING gin (search_vector);

-- ─── Trigger: keep search_vector in sync with name + description ──
-- Weights: A = name (most important), B = description body
CREATE OR REPLACE FUNCTION entities_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_search_vector_trigger ON entities;
CREATE TRIGGER entities_search_vector_trigger
  BEFORE INSERT OR UPDATE OF name, description
  ON entities
  FOR EACH ROW
  EXECUTE FUNCTION entities_search_vector_update();

-- Backfill search_vector for any existing rows
UPDATE entities SET name = name WHERE search_vector IS NULL;

-- ─── Trigger: auto-update updated_at on entities + goals + scratchpad ──
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_updated_at_trigger ON entities;
CREATE TRIGGER entities_updated_at_trigger
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS goals_updated_at_trigger ON goals;
CREATE TRIGGER goals_updated_at_trigger
  BEFORE UPDATE ON goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS scratchpad_updated_at_trigger ON scratchpad;
CREATE TRIGGER scratchpad_updated_at_trigger
  BEFORE UPDATE ON scratchpad
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS playbooks_updated_at_trigger ON playbooks;
CREATE TRIGGER playbooks_updated_at_trigger
  BEFORE UPDATE ON playbooks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS playbook_invocations_updated_at_trigger ON playbook_invocations;
CREATE TRIGGER playbook_invocations_updated_at_trigger
  BEFORE UPDATE ON playbook_invocations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
