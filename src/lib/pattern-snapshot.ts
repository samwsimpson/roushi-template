// Pattern snapshot — cached portfolio-wide detection results stored in the
// brain so the deployed /patterns web UI can show useful data without
// running fresh detection against local file paths Vercel can't reach.
//
// The CLI writes a snapshot via `pnpm roushi pattern detect --portfolio`
// (or via the upcoming cron job). The web UI reads the latest snapshot.
//
// Stored in scratchpad with a fixed key so updates overwrite rather than
// accumulate. No TTL — snapshots stay valid until the next scan replaces them.

import { readScratchpad, writeScratchpad } from "./scratchpad";

const AGENT_ID = "roushi-system";
const SESSION_ID = "pattern-detection";
const KEY = "portfolio-matrix";

export interface SnapshotCell {
  status: string;
  detail?: string;
  missing?: string[];
}

export interface SnapshotProduct {
  slug: string;
  name: string;
  cells: Record<string, SnapshotCell>;
}

export interface SnapshotPattern {
  slug: string;
  name: string;
  description: string;
  category: string;
}

export interface PortfolioSnapshot {
  patterns: SnapshotPattern[];
  products: SnapshotProduct[];
  generatedAt: string;
  source: "cli" | "cron";
}

export async function readSnapshot(): Promise<PortfolioSnapshot | null> {
  const entry = await readScratchpad({
    agentId: AGENT_ID,
    sessionId: SESSION_ID,
    key: KEY,
  });
  if (!entry) return null;
  return entry.value as PortfolioSnapshot;
}

export async function writeSnapshot(
  snapshot: Omit<PortfolioSnapshot, "generatedAt">,
): Promise<void> {
  const full: PortfolioSnapshot = {
    ...snapshot,
    generatedAt: new Date().toISOString(),
  };
  await writeScratchpad({
    agentId: AGENT_ID,
    sessionId: SESSION_ID,
    key: KEY,
    value: full,
  });
}
