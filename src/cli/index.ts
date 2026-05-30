#!/usr/bin/env node
// Roushi CLI — `roushi <command>`.
// Pretty terminal interface over the same brain primitives the MCP server exposes.

import chalk from "chalk";
import { Command } from "commander";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { entities } from "../db/schema";
import { applyAllSuggestedFixes, applyEdgeFix, auditEdges } from "../lib/audit";
import { listStaleEntities, touchEntity, DEFAULT_STALE_DAYS } from "../lib/decay";
import { findDuplicateGroups, mergeEntities } from "../lib/dedupe";
import { addProject, discoverProjects } from "../lib/discovery";
import { embedText } from "../lib/embeddings";
import { createGoal, linkEntitiesToGoal, listGoals, updateGoalStatus, type GoalStatus } from "../lib/goals";
import { traverseFrom, type TraversalOptions } from "../lib/graph";
import { ingestPath } from "../lib/ingest";
import {
  abandonInvocation,
  INVOCATION_STATUSES,
  listInvocations,
  updateActionStatus,
  type ActionStatus,
  type InvocationStatus,
} from "../lib/invocations";
import {
  createPlaybook,
  deletePlaybook,
  getMatchingPlaybooks,
  getPlaybookBySlug,
  listPlaybooks,
  PLAYBOOK_TRIGGERS,
  type PlaybookTrigger,
} from "../lib/playbooks";
import {
  captureEvalQuery,
  loadEvalQueries,
  runAllEvals,
  runOneEval,
  saveEvalQueries,
  type EvalQuery,
} from "../lib/eval";
import { importWorkspaceMemory } from "../lib/memory-import";
import { listPortfolio, renderRegistryMarkdown } from "../lib/portfolio";
import {
  getRule,
  listRules,
  rulesForWorkspace,
  syncRulesToWorkspace,
} from "../lib/rules";
import { listScratchpad, readScratchpad, writeScratchpad } from "../lib/scratchpad";
import {
  getSkill,
  ingestSkills,
  listSkills,
  pullSkillsFromDisk,
  pushSkillsToDisk,
  resolveSkillsTarget,
  syncSkillsToWorkspace,
  syncSkillsWithDisk,
} from "../lib/skills";
import {
  runContradictionScan,
  type ContradictionType,
  DEFAULT_CONTRADICTION_TYPES,
} from "../lib/contradictions";
import { hybridSearch, hybridSearchWithExplain } from "../lib/search";
import { think } from "../lib/think";

const ENTITY_TYPES = [
  "product",
  "tech",
  "vendor",
  "decision",
  "pattern",
  "incident",
  "lesson",
  "goal",
  "person",
  "roadmap_item",
] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const program = new Command();

program
  .name("roushi")
  .description("Roushi — ask the master")
  .version("0.13.2");

program
  .command("think <query>")
  .description("Ask the master — synthesizes an answer from the brain with citations + gap analysis")
  .option("-n, --retrieval <n>", "how many hits to ground the answer on", "12")
  .option("-m, --model <id>", "override the synthesis model (default gpt-4o)")
  .action(async (query: string, opts: { retrieval: string; model?: string }) => {
    const result = await think(query, {
      retrievalLimit: Number(opts.retrieval),
      model: opts.model,
    });
    console.log("");
    console.log(chalk.bold(`Q: ${result.query}`));
    console.log(chalk.dim(`  retrieved ${result.hits.length} hit(s) · model=${result.modelUsed}`));
    console.log("");
    console.log(result.answer.answer);
    if (result.answer.citations.length > 0) {
      console.log("");
      console.log(chalk.dim("Citations:"));
      for (const c of result.answer.citations) {
        console.log(`  ${chalk.cyan(`[${c.slug}]`)} ${chalk.dim(c.why)}`);
      }
    }
    if (result.answer.gaps.length > 0) {
      console.log("");
      console.log(chalk.yellow("What the brain doesn't know yet:"));
      for (const g of result.answer.gaps) {
        console.log(`  ${chalk.yellow("·")} ${g}`);
      }
    }
    console.log("");
  });

program
  .command("search <query>")
  .description("Hybrid search across the brain (vector + keyword + RRF) — raw retrieval, no LLM by default")
  .option("-n, --limit <n>", "max results", "10")
  .option("--explain", "show per-stage attribution (vector rank, keyword rank, RRF contributions)")
  .option("--rerank", "add an LLM rerank stage after RRF (gpt-4o-mini, ~1-2s slower, ~$0.0005/query)")
  .action(async (query: string, opts: { limit: string; explain?: boolean; rerank?: boolean }) => {
    const limit = Number(opts.limit);
    const searchOpts = { limit, rerank: opts.rerank ?? false };
    const hits = opts.explain
      ? await hybridSearchWithExplain(query, searchOpts)
      : await hybridSearch(query, searchOpts);
    if (hits.length === 0) {
      console.error(chalk.dim(`No matches for: ${query}`));
      process.exit(0);
    }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (!h) continue;
      const idx = chalk.dim(`${i + 1}.`);
      const type = chalk.cyan(`[${h.entity.type}]`);
      const name = chalk.bold(h.entity.name);
      const slug = chalk.dim(`(${h.entity.slug})`);
      const meta = chalk.dim(`score=${h.score.toFixed(4)} ${h.source}`);
      console.log(`${idx} ${type} ${name} ${slug}  ${meta}`);
      if (opts.explain && h.explain) {
        const v = h.explain.vectorRank === null ? chalk.dim("—") : chalk.dim(`#${h.explain.vectorRank}`);
        const kRank =
          h.explain.keywordRank === null ? chalk.dim("—") : chalk.dim(`#${h.explain.keywordRank}`);
        const vC = chalk.dim(`+${h.explain.vectorContribution.toFixed(4)}`);
        const kC = chalk.dim(`+${h.explain.keywordContribution.toFixed(4)}`);
        console.log(
          `      ${chalk.dim("vector")} rank ${v} ${vC}   ${chalk.dim("keyword")} rank ${kRank} ${kC}   ${chalk.dim(`rrf_k=${h.explain.rrfK}`)}`,
        );
      }
      if (h.entity.description) {
        console.log(`   ${chalk.dim(truncate(h.entity.description, 200))}`);
      }
    }
  });

program
  .command("graph-query <slug>")
  .description("Walk the typed edge graph from an entity")
  .option("-h, --hops <n>", "max hops", "2")
  .option("-r, --relations <list>", "comma-separated relations to follow")
  .action(async (slug: string, opts: { hops: string; relations?: string }) => {
    const maxHops = Number(opts.hops);
    const relations = opts.relations
      ? (opts.relations.split(",").map((r) => r.trim()) as TraversalOptions["relations"])
      : undefined;
    const nodes = await traverseFrom(slug, { maxHops, relations });
    if (nodes.length === 0) {
      console.error(chalk.red(`No entity found with slug: ${slug}`));
      process.exit(1);
    }
    for (const n of nodes) {
      const indent = "  ".repeat(n.depth);
      const type = chalk.cyan(`[${n.entity.type}]`);
      const name = chalk.bold(n.entity.name);
      const slugDim = chalk.dim(`(${n.entity.slug})`);
      const lastEdge = n.pathEdges.at(-1);
      const rel = lastEdge ? chalk.yellow(` <${lastEdge.relation}>`) : "";
      console.log(`${indent}${type} ${name} ${slugDim}${rel}`);
    }
  });

program
  .command("get <slug>")
  .description("Get one entity by slug")
  .action(async (slug: string) => {
    const rows = await db
      .select()
      .from(entities)
      .where(sql`${entities.slug} = ${slug}`)
      .limit(1);
    const e = rows[0];
    if (!e) {
      console.error(chalk.red(`Not found: ${slug}`));
      process.exit(1);
    }
    console.log(chalk.bold(`# ${e.name}`));
    console.log(chalk.dim(`slug: ${e.slug}`));
    console.log(chalk.dim(`type: ${e.type}`));
    console.log(chalk.dim(`updated: ${e.updatedAt.toISOString()}`));
    if (e.sourcePath) console.log(chalk.dim(`source: ${e.sourcePath}`));
    console.log();
    console.log(e.description || chalk.dim("(no description)"));
  });

program
  .command("list")
  .description("List entities, optionally filtered by type")
  .option("-t, --type <type>", "filter by entity type")
  .option("-n, --limit <n>", "max results", "50")
  .action(async (opts: { type?: string; limit: string }) => {
    const take = Number(opts.limit);
    if (opts.type && !(ENTITY_TYPES as readonly string[]).includes(opts.type)) {
      console.error(chalk.red(`Invalid type: ${opts.type}. Valid: ${ENTITY_TYPES.join(", ")}`));
      process.exit(1);
    }
    const query = opts.type
      ? db.select().from(entities).where(sql`${entities.type} = ${opts.type as EntityType}`).limit(take)
      : db.select().from(entities).limit(take);
    const rows = await query;
    if (rows.length === 0) {
      console.error(chalk.dim(opts.type ? `No entities of type ${opts.type}` : `No entities`));
      process.exit(0);
    }
    for (const e of rows) {
      console.log(`${chalk.cyan(`[${e.type}]`)} ${chalk.bold(e.name)} ${chalk.dim(`(${e.slug})`)}`);
    }
  });

program
  .command("add")
  .description("Add (or upsert) an entity to the brain")
  .requiredOption("-s, --slug <slug>", "kebab-case slug")
  .requiredOption("-t, --type <type>", `one of: ${ENTITY_TYPES.join(", ")}`)
  .requiredOption("-n, --name <name>", "human-readable name")
  .option("-d, --description <desc>", "description body")
  .action(async (opts: { slug: string; type: string; name: string; description?: string }) => {
    if (!(ENTITY_TYPES as readonly string[]).includes(opts.type)) {
      console.error(chalk.red(`Invalid type: ${opts.type}`));
      process.exit(1);
    }
    const embeddingInput = [opts.name, opts.description ?? ""].filter(Boolean).join("\n").trim();
    const embedding = embeddingInput ? await embedText(embeddingInput) : undefined;
    const [row] = await db
      .insert(entities)
      .values({
        slug: opts.slug,
        type: opts.type as EntityType,
        name: opts.name,
        description: opts.description ?? "",
        embedding,
        lastValidatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: entities.slug,
        set: {
          type: opts.type as EntityType,
          name: opts.name,
          description: opts.description ?? "",
          embedding,
          lastValidatedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    console.log(chalk.green(`✓ upserted ${row?.slug} (${row?.id})`));
  });

program
  .command("ingest <path>")
  .description("Bulk ingest a markdown file or directory into the brain")
  .action(async (target: string) => {
    console.error(chalk.dim(`→ ingesting ${target}`));
    const stats = await ingestPath(target);
    console.log(chalk.green(`✓ scanned ${stats.filesScanned} files`));
    console.log(chalk.green(`✓ ${stats.entitiesUpserted} entities upserted`));
    console.log(chalk.green(`✓ ${stats.edgesUpserted} edges upserted`));
    if (stats.skippedFiles.length > 0) {
      console.log(chalk.yellow(`! skipped ${stats.skippedFiles.length} files`));
      for (const f of stats.skippedFiles.slice(0, 5)) console.log(chalk.dim(`    ${f}`));
      if (stats.skippedFiles.length > 5) console.log(chalk.dim(`    … and ${stats.skippedFiles.length - 5} more`));
    }
    if (stats.unresolvedLinks.length > 0) {
      console.log(chalk.yellow(`! ${stats.unresolvedLinks.length} unresolved [[wikilinks]]`));
      for (const u of stats.unresolvedLinks.slice(0, 5)) {
        console.log(chalk.dim(`    ${u.from} -[${u.relation ?? "?"}]→ ${u.to}`));
      }
      if (stats.unresolvedLinks.length > 5) console.log(chalk.dim(`    … and ${stats.unresolvedLinks.length - 5} more`));
    }
  });

// ─── scan / add-project ─────────────────────────────────────────────
program
  .command("scan <dir>")
  .description("Discover project directories one level under <dir> and report what's new vs already in the brain")
  .option("--add-all", "Add every new candidate (skips client-work tagging)")
  .action(async (dir: string, opts: { addAll?: boolean }) => {
    console.error(chalk.dim(`→ scanning ${dir} (one level deep)`));
    const projects = await discoverProjects(dir);
    if (projects.length === 0) {
      console.error(chalk.dim(`(no candidate projects found)`));
      return;
    }
    const existing = projects.filter((p) => p.alreadyInBrain);
    const newOnes = projects.filter((p) => !p.alreadyInBrain);

    console.log(chalk.bold(`\n${projects.length} candidates: ${existing.length} already in brain, ${newOnes.length} new\n`));
    for (const p of projects) {
      const marker = p.alreadyInBrain ? chalk.dim("✓") : chalk.yellow("★ NEW");
      const sigs: string[] = [];
      if (p.signals.canonicalFiles.length > 0) sigs.push(`${p.signals.canonicalFiles.length} doc(s)`);
      if (p.signals.hasPackageJson) sigs.push("pkg");
      if (p.signals.hasGitDir) sigs.push("git");
      if (p.signals.autoMemoryFileCount > 0) sigs.push(`${p.signals.autoMemoryFileCount} memory`);
      const sigStr = sigs.length > 0 ? chalk.dim(` [${sigs.join(", ")}]`) : "";
      console.log(`${marker} ${chalk.bold(p.name)} ${chalk.dim(`(${p.slug})`)}${sigStr}`);
      console.log(`     ${chalk.dim(p.path)}`);
    }

    if (newOnes.length === 0) return;

    if (opts.addAll) {
      console.log(chalk.bold(`\n→ adding ${newOnes.length} new projects (not flagged as client-work)`));
      for (const p of newOnes) {
        process.stderr.write(`  ${p.slug} … `);
        try {
          const r = await addProject({ path: p.path });
          console.error(`✓ ${r.extractedEntities} extracted, ${r.extractedEdges} edges${r.ingestedMemoryFiles > 0 ? `, ${r.ingestedMemoryFiles} memory files` : ""}`);
        } catch (err) {
          console.error(`✗ ${err instanceof Error ? err.message : err}`);
        }
      }
    } else {
      console.log(chalk.dim(`\nRun with --add-all to add everything, or per-project:`));
      for (const p of newOnes) {
        console.log(chalk.dim(`  pnpm roushi add-project "${p.path}"`));
      }
    }
  });

program
  .command("add-project [dirPath]")
  .description("Add (or refresh) a single project as a brain entity. Defaults to cwd. Auto-ingests per-project Claude memory + runs extraction.")
  .option("-n, --name <name>", "Override the brand name (default: package.json.name or dir basename)")
  .option("-s, --slug <slug>", "Override the slug (default: derived from name)")
  .option("--client-work", "Tag as KumoKodo Studio client work (frontmatter.client_work=true)")
  .option("--client <client>", "Immediate counterparty (requires --client-work)")
  .option("--end-client <name>", "End-customer (requires --client-work)")
  .option("--skip-memory", "Don't auto-ingest the per-project Claude memory dir")
  .option("--skip-extraction", "Don't run LLM extraction over the project's description")
  .action(async (
    dirPath: string | undefined,
    opts: {
      name?: string;
      slug?: string;
      clientWork?: boolean;
      client?: string;
      endClient?: string;
      skipMemory?: boolean;
      skipExtraction?: boolean;
    },
  ) => {
    const target = dirPath ?? process.cwd();
    console.error(chalk.dim(`→ adding ${target}`));
    const result = await addProject({
      path: target,
      name: opts.name,
      slug: opts.slug,
      isClientWork: opts.clientWork,
      client: opts.client,
      endClient: opts.endClient,
      skipAutoMemory: opts.skipMemory,
      skipExtraction: opts.skipExtraction,
    });
    console.log(chalk.green(`✓ ${result.entity.slug} (${result.entity.name}) ${chalk.dim(`id=${result.entity.id}`)}`));
    if (result.ingestedMemoryFiles > 0) {
      console.log(chalk.green(`  ${result.ingestedMemoryFiles} memory files → ${result.ingestedMemoryEntities} entities`));
    }
    if (result.extractedEntities > 0 || result.extractedEdges > 0) {
      console.log(chalk.green(`  extracted ${result.extractedEntities} sub-entities, ${result.extractedEdges} edges`));
    }
    if (result.matchingPlaybooks.length > 0) {
      const verb = result.wasNew ? "project_created" : "project_updated";
      console.log();
      console.log(chalk.bold(chalk.yellow(`▸ ${result.matchingPlaybooks.length} playbook(s) match this ${verb} event:`)));
      for (let i = 0; i < result.matchingPlaybooks.length; i++) {
        const pb = result.matchingPlaybooks[i]!;
        const inv = result.invocations[i];
        console.log(`  ${chalk.cyan("●")} ${chalk.bold(pb.name)} ${chalk.dim(`(${pb.slug})`)}`);
        if (inv) console.log(chalk.dim(`     run: ${inv.id}`));
        for (const action of pb.actions) {
          console.log(`     ${chalk.dim("→")} ${action}`);
        }
      }
      console.log(chalk.dim(`\n  Track in: pnpm roushi playbook runs --pending`));
    }
  });

// ─── stats ──────────────────────────────────────────────────────────
program
  .command("stats")
  .description("Show brain health: counts by type, edge counts, recent activity")
  .action(async () => {
    const typeCountsRes = await db.execute<{ type: string; n: number }>(sql`
      SELECT type::text AS type, COUNT(*)::int AS n FROM entities GROUP BY type ORDER BY n DESC
    `);
    const edgeRelRes = await db.execute<{ relation: string; n: number }>(sql`
      SELECT relation::text AS relation, COUNT(*)::int AS n FROM edges GROUP BY relation ORDER BY n DESC
    `);
    const totalEntities = typeCountsRes.rows.reduce((s, r) => s + Number(r.n), 0);
    const totalEdges = edgeRelRes.rows.reduce((s, r) => s + Number(r.n), 0);
    const goalCountsRes = await db.execute<{ status: string; n: number }>(sql`
      SELECT status::text AS status, COUNT(*)::int AS n FROM goals GROUP BY status ORDER BY n DESC
    `);
    const lastUpdatedRes = await db.execute<{ updated_at: string; slug: string; name: string }>(sql`
      SELECT updated_at::text AS updated_at, slug, name FROM entities ORDER BY updated_at DESC LIMIT 5
    `);

    console.log(chalk.bold("Roushi brain — health snapshot"));
    console.log();
    console.log(chalk.cyan(`${totalEntities} entities`) + chalk.dim(" by type:"));
    for (const r of typeCountsRes.rows) {
      console.log(`  ${chalk.bold(String(r.n).padStart(3))} ${r.type}`);
    }
    console.log();
    console.log(chalk.cyan(`${totalEdges} edges`) + chalk.dim(" by relation:"));
    for (const r of edgeRelRes.rows) {
      console.log(`  ${chalk.bold(String(r.n).padStart(3))} ${r.relation}`);
    }
    if (goalCountsRes.rows.length > 0) {
      console.log();
      console.log(chalk.cyan("goals") + chalk.dim(" by status:"));
      for (const r of goalCountsRes.rows) {
        console.log(`  ${chalk.bold(String(r.n).padStart(3))} ${r.status}`);
      }
    }
    if (lastUpdatedRes.rows.length > 0) {
      console.log();
      console.log(chalk.cyan("most recently updated:"));
      for (const r of lastUpdatedRes.rows) {
        console.log(`  ${chalk.dim(r.updated_at.slice(0, 19))}  ${chalk.bold(r.name)} ${chalk.dim(`(${r.slug})`)}`);
      }
    }
  });

// ─── goals ──────────────────────────────────────────────────────────
const goal = program.command("goal").description("Manage long-running goals");

const VALID_GOAL_STATUSES: GoalStatus[] = ["active", "completed", "abandoned", "blocked"];

goal
  .command("add")
  .description("Create a new goal")
  .requiredOption("-t, --title <title>", "Short goal title")
  .option("-d, --description <desc>", "Longer description")
  .option("--target <date>", "Target date (YYYY-MM-DD)")
  .option("--link <slugs>", "Comma-separated entity slugs to link")
  .action(async (opts: { title: string; description?: string; target?: string; link?: string }) => {
    const targetDate = opts.target ? new Date(opts.target) : undefined;
    if (opts.target && Number.isNaN(targetDate?.getTime())) {
      console.error(chalk.red(`Invalid --target date: ${opts.target}`));
      process.exit(1);
    }
    const relatedEntitySlugs = opts.link?.split(",").map((s) => s.trim()).filter(Boolean);
    const row = await createGoal({
      title: opts.title,
      description: opts.description,
      targetDate,
      relatedEntitySlugs,
    });
    console.log(chalk.green(`✓ goal created: ${row.id}`));
    console.log(`  ${chalk.bold(row.title)}`);
    if (row.targetDate) console.log(chalk.dim(`  target: ${row.targetDate.toISOString().slice(0, 10)}`));
    if (row.relatedEntityIds.length > 0) {
      console.log(chalk.dim(`  linked: ${row.relatedEntityIds.length} entities`));
    }
  });

goal
  .command("list")
  .description("List goals, optionally filtered by status")
  .option("-s, --status <status>", `one of: ${VALID_GOAL_STATUSES.join(", ")}`)
  .option("-n, --limit <n>", "max results", "50")
  .action(async (opts: { status?: string; limit: string }) => {
    if (opts.status && !VALID_GOAL_STATUSES.includes(opts.status as GoalStatus)) {
      console.error(chalk.red(`Invalid status: ${opts.status}`));
      process.exit(1);
    }
    const rows = await listGoals({
      status: opts.status as GoalStatus | undefined,
      limit: Number(opts.limit),
    });
    if (rows.length === 0) {
      console.error(chalk.dim(opts.status ? `No ${opts.status} goals` : `No goals`));
      process.exit(0);
    }
    for (const g of rows) {
      const status = colorStatus(g.status);
      const target = g.targetDate ? chalk.dim(` (target ${g.targetDate.toISOString().slice(0, 10)})`) : "";
      const linked = g.relatedEntityIds.length > 0 ? chalk.dim(` [${g.relatedEntityIds.length} linked]`) : "";
      console.log(`${status} ${chalk.bold(g.title)}${target}${linked}`);
      console.log(chalk.dim(`  ${g.id}`));
    }
  });

goal
  .command("update-status <id> <status>")
  .description(`Update a goal's status (${VALID_GOAL_STATUSES.join(" | ")})`)
  .action(async (id: string, status: string) => {
    if (!VALID_GOAL_STATUSES.includes(status as GoalStatus)) {
      console.error(chalk.red(`Invalid status: ${status}`));
      process.exit(1);
    }
    const row = await updateGoalStatus(id, status as GoalStatus);
    if (!row) {
      console.error(chalk.red(`Goal not found: ${id}`));
      process.exit(1);
    }
    console.log(chalk.green(`✓ ${row.title} → ${row.status}`));
  });

goal
  .command("link <id> <slugs>")
  .description("Link entities (comma-separated slugs) to a goal")
  .action(async (id: string, slugs: string) => {
    const slugList = slugs.split(",").map((s) => s.trim()).filter(Boolean);
    const row = await linkEntitiesToGoal(id, slugList);
    if (!row) {
      console.error(chalk.red(`No matching entities or goal not found`));
      process.exit(1);
    }
    console.log(chalk.green(`✓ now ${row.relatedEntityIds.length} entities linked to ${row.title}`));
  });

// ─── scratchpad ─────────────────────────────────────────────────────
const scratch = program.command("scratchpad").alias("scratch").description("Per-agent ephemeral memory");

scratch
  .command("write")
  .description("Write a scratchpad entry")
  .requiredOption("-a, --agent <id>", "Agent identifier")
  .requiredOption("-S, --session <id>", "Session identifier")
  .requiredOption("-k, --key <key>", "Entry key")
  .requiredOption("-v, --value <json>", "Value (JSON string)")
  .option("--ttl <seconds>", "TTL in seconds")
  .action(async (opts: { agent: string; session: string; key: string; value: string; ttl?: string }) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(opts.value);
    } catch {
      parsed = opts.value;
    }
    const row = await writeScratchpad({
      agentId: opts.agent,
      sessionId: opts.session,
      key: opts.key,
      value: parsed,
      ttlSeconds: opts.ttl ? Number(opts.ttl) : undefined,
    });
    console.log(chalk.green(`✓ ${row.agentId}/${row.sessionId}/${row.key}`));
    if (row.expiresAt) console.log(chalk.dim(`  expires ${row.expiresAt.toISOString()}`));
  });

scratch
  .command("read")
  .description("Read a scratchpad entry")
  .requiredOption("-a, --agent <id>")
  .requiredOption("-S, --session <id>")
  .requiredOption("-k, --key <key>")
  .action(async (opts: { agent: string; session: string; key: string }) => {
    const row = await readScratchpad({ agentId: opts.agent, sessionId: opts.session, key: opts.key });
    if (!row) {
      console.error(chalk.dim(`Not found (or expired)`));
      process.exit(1);
    }
    console.log(JSON.stringify(row.value, null, 2));
  });

scratch
  .command("list")
  .description("List scratchpad entries for an agent")
  .requiredOption("-a, --agent <id>")
  .option("-S, --session <id>", "Filter to one session")
  .option("-n, --limit <n>", "max results", "50")
  .action(async (opts: { agent: string; session?: string; limit: string }) => {
    const rows = await listScratchpad({
      agentId: opts.agent,
      sessionId: opts.session,
      limit: Number(opts.limit),
    });
    if (rows.length === 0) {
      console.error(chalk.dim(`No entries`));
      process.exit(0);
    }
    for (const r of rows) {
      const expires = r.expiresAt ? chalk.dim(` (expires ${r.expiresAt.toISOString()})`) : "";
      console.log(`${chalk.cyan(r.sessionId)}/${chalk.bold(r.key)}${expires}`);
    }
  });

// ─── optimize (audit + dedupe + decay) ──────────────────────────────
const optimize = program.command("optimize").description("Brain self-optimization: audit edges, find duplicates, surface stale entries");

optimize
  .command("audit")
  .description("Scan for edge-relation mismatches (e.g. tech entities receiving depends_on instead of uses)")
  .option("--apply", "Auto-apply all suggested fixes (suspect findings only — wrong findings still need manual review)")
  .action(async (opts: { apply?: boolean }) => {
    if (opts.apply) {
      const result = await applyAllSuggestedFixes();
      console.log(chalk.green(`✓ applied ${result.applied} fixes (${result.skipped} skipped)`));
      return;
    }
    const findings = await auditEdges();
    if (findings.length === 0) {
      console.log(chalk.green("✓ no edge-quality issues found"));
      return;
    }
    const wrong = findings.filter((f) => f.severity === "wrong");
    const suspect = findings.filter((f) => f.severity === "suspect");
    if (wrong.length > 0) {
      console.log(chalk.red(`${wrong.length} wrong edges:`));
      for (const f of wrong) {
        console.log(
          `  ${chalk.cyan(`[${f.from.type}]`)} ${chalk.bold(f.from.name)} ${chalk.yellow(`-[${f.edge.relation}]→`)} ${chalk.cyan(`[${f.to.type}]`)} ${chalk.bold(f.to.name)}`,
        );
        console.log(`     ${chalk.dim(f.reason)}`);
      }
    }
    if (suspect.length > 0) {
      console.log(chalk.yellow(`${suspect.length} suspect edges:`));
      for (const f of suspect) {
        console.log(
          `  ${chalk.cyan(`[${f.from.type}]`)} ${chalk.bold(f.from.name)} ${chalk.yellow(`-[${f.edge.relation}]→`)} ${chalk.cyan(`[${f.to.type}]`)} ${chalk.bold(f.to.name)}`,
        );
        console.log(`     ${chalk.dim(f.reason)}${f.suggestion ? chalk.dim(` → try "${f.suggestion}"`) : ""}`);
      }
      console.log(chalk.dim(`\nRun with --apply to auto-fix all ${suspect.length} suspect rows.`));
    }
  });

optimize
  .command("fix-edge <edgeId> <newRelation>")
  .description("Manually rewrite a single edge's relation")
  .action(async (edgeId: string, newRelation: string) => {
    const ok = await applyEdgeFix(edgeId, newRelation as never);
    console.log(ok ? chalk.green(`✓ fixed`) : chalk.red(`edge ${edgeId} not found`));
  });

optimize
  .command("dedupe")
  .description("Find near-duplicate entities (string + embedding similarity within each type)")
  .action(async () => {
    const groups = await findDuplicateGroups();
    if (groups.length === 0) {
      console.log(chalk.green("✓ no probable duplicates found"));
      return;
    }
    console.log(chalk.bold(`${groups.length} duplicate group(s):\n`));
    for (const g of groups) {
      console.log(
        `${chalk.cyan(`[${g.canonical.type}]`)} canonical: ${chalk.bold(g.canonical.name)} ${chalk.dim(`(${g.canonical.slug})`)}`,
      );
      for (const c of g.candidates) {
        const confColor = c.confidence > 0.8 ? chalk.red : chalk.yellow;
        console.log(
          `    ${chalk.dim("→")} ${chalk.bold(c.entity.name)} ${chalk.dim(`(${c.entity.slug})`)}  ${confColor(`conf=${c.confidence.toFixed(2)}`)} ${chalk.dim(`str=${c.stringSimilarity.toFixed(2)}${c.embeddingDistance !== null ? ` emb-dist=${c.embeddingDistance.toFixed(3)}` : ""}`)}`,
        );
        console.log(chalk.dim(`        merge with: pnpm roushi optimize merge ${g.canonical.id} ${c.entity.id}`));
      }
    }
  });

optimize
  .command("merge <canonicalId> <duplicateId>")
  .description("Merge a duplicate entity into a canonical one (re-points all edges, then deletes the duplicate)")
  .action(async (canonicalId: string, duplicateId: string) => {
    const result = await mergeEntities(canonicalId, duplicateId);
    console.log(chalk.green(`✓ merge complete`));
    console.log(chalk.dim(`  outgoing edges re-pointed: ${result.outgoingMerged}`));
    console.log(chalk.dim(`  incoming edges re-pointed: ${result.incomingMerged}`));
    console.log(chalk.dim(`  duplicate edges dropped:   ${result.duplicatesDropped}`));
    console.log(chalk.dim(`  duplicate entity deleted:  ${result.deleted}`));
  });

optimize
  .command("decay")
  .description("List entities that haven't been re-validated recently")
  .option("--days <n>", `Threshold in days (default ${DEFAULT_STALE_DAYS})`, String(DEFAULT_STALE_DAYS))
  .action(async (opts: { days: string }) => {
    const days = Number(opts.days);
    const stale = await listStaleEntities(days);
    if (stale.length === 0) {
      console.log(chalk.green(`✓ no entities stale (validated within ${days} days)`));
      return;
    }
    console.log(chalk.bold(`${stale.length} stale entries (>${days} days):\n`));
    for (const s of stale) {
      console.log(
        `  ${chalk.cyan(`[${s.type}]`)} ${chalk.bold(s.name)} ${chalk.dim(`(${s.slug})`)} ${chalk.yellow(`${s.daysSinceValidation}d old`)}`,
      );
      console.log(chalk.dim(`    touch: pnpm roushi optimize touch ${s.slug}`));
    }
  });

optimize
  .command("touch <slug>")
  .description("Bump an entity's lastValidatedAt to now (confirm it's still accurate)")
  .action(async (slug: string) => {
    const row = await touchEntity(slug);
    if (!row) {
      console.error(chalk.red(`Not found: ${slug}`));
      process.exit(1);
    }
    console.log(chalk.green(`✓ ${row.name} (${row.slug}) marked validated at ${row.lastValidatedAt.toISOString()}`));
  });

// ─── playbooks ──────────────────────────────────────────────────────
const playbook = program.command("playbook").description("Manage standing rules that fire on events");

playbook
  .command("add")
  .description("Create a playbook")
  .requiredOption("-s, --slug <slug>", "kebab-case slug")
  .requiredOption("-n, --name <name>", "human-readable name")
  .requiredOption("-t, --trigger <trigger>", `one of: ${PLAYBOOK_TRIGGERS.join(", ")}`)
  .requiredOption("-a, --action <action...>", "Ordered action steps (pass --action multiple times)")
  .option("-d, --description <desc>", "Longer description")
  .option("--filter <json>", "JSON filter object, e.g. '{\"clientWork\":false}'")
  .option("--applies-to <slugs>", "Comma-separated entity slugs this applies to")
  .option("--inactive", "Create as inactive (draft)")
  .action(async (opts: {
    slug: string;
    name: string;
    trigger: string;
    action: string[];
    description?: string;
    filter?: string;
    appliesTo?: string;
    inactive?: boolean;
  }) => {
    if (!(PLAYBOOK_TRIGGERS as readonly string[]).includes(opts.trigger)) {
      console.error(chalk.red(`Invalid trigger: ${opts.trigger}`));
      process.exit(1);
    }
    let filter: Record<string, unknown> = {};
    if (opts.filter) {
      try {
        filter = JSON.parse(opts.filter);
      } catch {
        console.error(chalk.red(`Invalid --filter JSON`));
        process.exit(1);
      }
    }
    const appliesToSlugs = opts.appliesTo?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
    const row = await createPlaybook({
      slug: opts.slug,
      name: opts.name,
      trigger: opts.trigger as PlaybookTrigger,
      actions: opts.action,
      description: opts.description,
      filter,
      appliesToSlugs,
      active: !opts.inactive,
    });
    console.log(chalk.green(`✓ playbook ${chalk.bold(row.slug)} — fires on ${chalk.cyan(row.trigger)} (${row.active ? "active" : "draft"})`));
    for (const a of row.actions) console.log(`  ${chalk.dim("→")} ${a}`);
  });

playbook
  .command("list")
  .description("List playbooks, optionally filtered by trigger")
  .option("-t, --trigger <trigger>", `filter by trigger`)
  .option("--all", "include inactive")
  .action(async (opts: { trigger?: string; all?: boolean }) => {
    if (opts.trigger && !(PLAYBOOK_TRIGGERS as readonly string[]).includes(opts.trigger)) {
      console.error(chalk.red(`Invalid trigger: ${opts.trigger}`));
      process.exit(1);
    }
    const rows = await listPlaybooks({
      trigger: opts.trigger as PlaybookTrigger | undefined,
      activeOnly: !opts.all,
    });
    if (rows.length === 0) {
      console.error(chalk.dim("No playbooks."));
      process.exit(0);
    }
    for (const p of rows) {
      const status = p.active ? chalk.green("●") : chalk.dim("○");
      console.log(`${status} ${chalk.cyan(`[${p.trigger}]`)} ${chalk.bold(p.name)} ${chalk.dim(`(${p.slug})`)}`);
      if (p.appliesToSlugs.length > 0) console.log(chalk.dim(`    applies to: ${p.appliesToSlugs.join(", ")}`));
      for (const a of p.actions) console.log(chalk.dim(`    → ${a}`));
    }
  });

playbook
  .command("get <slug>")
  .description("Show one playbook")
  .action(async (slug: string) => {
    const row = await getPlaybookBySlug(slug);
    if (!row) {
      console.error(chalk.red(`Not found: ${slug}`));
      process.exit(1);
    }
    console.log(chalk.bold(`# ${row.name}`));
    console.log(chalk.dim(`slug:    ${row.slug}`));
    console.log(chalk.dim(`trigger: ${row.trigger}`));
    console.log(chalk.dim(`active:  ${row.active}`));
    if (Object.keys(row.filter as object).length > 0) {
      console.log(chalk.dim(`filter:  ${JSON.stringify(row.filter)}`));
    }
    if (row.appliesToSlugs.length > 0) {
      console.log(chalk.dim(`applies: ${row.appliesToSlugs.join(", ")}`));
    }
    console.log();
    if (row.description) {
      console.log(row.description);
      console.log();
    }
    console.log(chalk.bold("Actions:"));
    for (let i = 0; i < row.actions.length; i++) {
      console.log(`  ${i + 1}. ${row.actions[i]}`);
    }
  });

playbook
  .command("check <trigger>")
  .description("Show which playbooks would fire for a given event trigger")
  .option("-s, --slug <slug>", "the entity slug the event is about")
  .option("-t, --type <type>", "the entity type")
  .action(async (trigger: string, opts: { slug?: string; type?: string }) => {
    if (!(PLAYBOOK_TRIGGERS as readonly string[]).includes(trigger)) {
      console.error(chalk.red(`Invalid trigger: ${trigger}`));
      process.exit(1);
    }
    const matches = await getMatchingPlaybooks({
      trigger: trigger as PlaybookTrigger,
      entitySlug: opts.slug,
      entityType: opts.type,
    });
    if (matches.length === 0) {
      console.error(chalk.dim(`No active playbooks match this event.`));
      process.exit(0);
    }
    for (const p of matches) {
      console.log(`${chalk.cyan("●")} ${chalk.bold(p.name)} ${chalk.dim(`(${p.slug})`)}`);
      for (const a of p.actions) console.log(chalk.dim(`    → ${a}`));
    }
  });

playbook
  .command("remove <slug>")
  .description("Delete a playbook")
  .action(async (slug: string) => {
    const ok = await deletePlaybook(slug);
    if (!ok) {
      console.error(chalk.red(`Not found: ${slug}`));
      process.exit(1);
    }
    console.log(chalk.green(`✓ removed ${slug}`));
  });

playbook
  .command("runs")
  .description("List playbook invocations (each time a playbook fired)")
  .option("-s, --status <status>", `filter by status (${INVOCATION_STATUSES.join(" | ")})`)
  .option("-p, --playbook <slug>", "filter by playbook slug")
  .option("--pending", "shortcut for --status pending,in_progress")
  .option("-n, --limit <n>", "max results", "50")
  .action(async (opts: { status?: string; playbook?: string; pending?: boolean; limit: string }) => {
    const wantStatuses: InvocationStatus[] = opts.pending
      ? ["pending", "in_progress"]
      : opts.status
        ? [opts.status as InvocationStatus]
        : INVOCATION_STATUSES;

    const all = await listInvocations({
      playbookSlug: opts.playbook,
      limit: Number(opts.limit),
    });
    const filtered = all.filter((i) => wantStatuses.includes(i.invocation.status));
    if (filtered.length === 0) {
      console.error(chalk.dim("(no invocations match)"));
      process.exit(0);
    }
    for (const r of filtered) {
      const status = colorInvocationStatus(r.invocation.status);
      const date = r.invocation.createdAt.toISOString().slice(0, 19).replace("T", " ");
      console.log(
        `${status} ${chalk.cyan(`[${r.invocation.eventTrigger}]`)} ${chalk.bold(r.playbook.name)} ${chalk.dim(`(${r.playbook.slug})`)}  ${chalk.dim(date)}`,
      );
      console.log(chalk.dim(`    id: ${r.invocation.id}`));
      if (r.entity) console.log(chalk.dim(`    entity: ${r.entity.name} (${r.entity.slug})`));
      console.log(chalk.dim(`    ${r.completedActionCount}/${r.actions.length} actions complete, ${r.pendingActionCount} pending`));
    }
  });

playbook
  .command("run <invocationId>")
  .description("Show all actions for a single invocation")
  .action(async (invocationId: string) => {
    const list = await listInvocations({});
    const r = list.find((i) => i.invocation.id === invocationId);
    if (!r) {
      console.error(chalk.red(`Not found: ${invocationId}`));
      process.exit(1);
    }
    console.log(chalk.bold(`# ${r.playbook.name}`));
    console.log(chalk.dim(`run:     ${r.invocation.id}`));
    console.log(chalk.dim(`status:  ${r.invocation.status}`));
    console.log(chalk.dim(`trigger: ${r.invocation.eventTrigger}`));
    if (r.entity) console.log(chalk.dim(`entity:  ${r.entity.name} (${r.entity.slug})`));
    console.log();
    for (const a of r.actions) {
      const marker = colorActionStatus(a.status);
      console.log(`  ${marker} ${chalk.bold(String(a.actionIndex + 1).padStart(2))}. ${a.actionText}`);
      if (a.notes) console.log(chalk.dim(`        notes: ${a.notes}`));
    }
    console.log();
    console.log(chalk.dim(`Complete an action: pnpm roushi playbook complete ${r.invocation.id} <actionIndex>`));
  });

playbook
  .command("complete <invocationId> <actionIndex>")
  .description("Mark an action complete (1-indexed)")
  .option("--notes <notes>", "Free-text notes about what was done")
  .option("--by <actor>", "Who completed it (default 'manual')")
  .action(async (invocationId: string, actionIndex: string, opts: { notes?: string; by?: string }) => {
    const idx = Number(actionIndex) - 1;
    await touchActionStatus(invocationId, idx, "completed", opts.notes, opts.by);
  });

playbook
  .command("reject <invocationId> <actionIndex>")
  .description("Mark an action as not-applicable / rejected")
  .option("--notes <notes>", "Reason")
  .action(async (invocationId: string, actionIndex: string, opts: { notes?: string }) => {
    const idx = Number(actionIndex) - 1;
    await touchActionStatus(invocationId, idx, "rejected", opts.notes);
  });

playbook
  .command("fail <invocationId> <actionIndex>")
  .description("Mark an action as attempted-but-failed (with notes about why)")
  .option("--notes <notes>", "What went wrong")
  .action(async (invocationId: string, actionIndex: string, opts: { notes?: string }) => {
    const idx = Number(actionIndex) - 1;
    await touchActionStatus(invocationId, idx, "failed", opts.notes);
  });

playbook
  .command("abandon-run <invocationId>")
  .description("Mark an entire invocation as abandoned (no further work planned)")
  .action(async (invocationId: string) => {
    const row = await abandonInvocation(invocationId);
    if (!row) {
      console.error(chalk.red(`Not found: ${invocationId}`));
      process.exit(1);
    }
    console.log(chalk.green(`✓ abandoned`));
  });

async function touchActionStatus(
  invocationId: string,
  actionIndex: number,
  status: ActionStatus,
  notes?: string,
  completedBy?: string,
): Promise<void> {
  const row = await updateActionStatus({
    invocationId,
    actionIndex,
    status,
    notes,
    completedBy: completedBy ?? "manual",
  });
  if (!row) {
    console.error(chalk.red(`Action not found: ${invocationId} #${actionIndex + 1}`));
    process.exit(1);
  }
  console.log(chalk.green(`✓ action ${actionIndex + 1} → ${status}`));
}

function colorInvocationStatus(s: string): string {
  switch (s) {
    case "pending":
      return chalk.yellow("●");
    case "in_progress":
      return chalk.cyan("◐");
    case "completed":
      return chalk.green("✓");
    case "abandoned":
      return chalk.dim("✗");
    default:
      return chalk.dim("?");
  }
}

function colorActionStatus(s: string): string {
  switch (s) {
    case "pending":
      return chalk.yellow("○");
    case "completed":
      return chalk.green("✓");
    case "rejected":
      return chalk.dim("⊘");
    case "failed":
      return chalk.red("✗");
    default:
      return chalk.dim("?");
  }
}

function colorStatus(status: string): string {
  switch (status) {
    case "active":
      return chalk.green("●");
    case "completed":
      return chalk.blue("✓");
    case "abandoned":
      return chalk.dim("✗");
    case "blocked":
      return chalk.red("⊘");
    default:
      return chalk.dim("?");
  }
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

// ─── rules ─────────────────────────────────────────────────────────
// Rules are durable instructions Roushi writes into each workspace's
// Claude memory dir so the agent obeys them automatically. See
// src/lib/rules.ts for the distribution model.

const rules = program.command("rules").description("manage and distribute portfolio rules");

rules
  .command("list")
  .description("list all rules in the brain")
  .option("--for <slug>", "show only rules that apply to this product slug")
  .action(async (opts: { for?: string }) => {
    const items = opts.for ? await rulesForWorkspace(opts.for, "product") : await listRules();
    if (items.length === 0) {
      console.log(chalk.dim(opts.for ? `no rules apply to ${opts.for}` : "no rules in the brain"));
      return;
    }
    for (const r of items) {
      const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
      const scope =
        typeof fm.applies_to_slug === "string"
          ? chalk.cyan(`slug=${fm.applies_to_slug}`)
          : typeof fm.applies_to_type === "string"
            ? chalk.magenta(`type=${fm.applies_to_type}`)
            : fm.applies_to === "portfolio"
              ? chalk.yellow("portfolio")
              : chalk.dim("(no scope)");
      console.log(`${chalk.bold(r.slug)}  ${scope}  ${chalk.dim(r.name)}`);
    }
  });

rules
  .command("get <slug>")
  .description("print one rule's full markdown")
  .action(async (slug: string) => {
    const r = await getRule(slug);
    if (!r) {
      console.error(chalk.red(`no rule with slug "${slug}"`));
      process.exit(1);
    }
    console.log(chalk.bold(r.name));
    console.log(chalk.dim(`slug: ${r.slug}`));
    console.log(chalk.dim(`updated: ${new Date(r.updatedAt).toISOString().slice(0, 10)}`));
    console.log();
    console.log(r.description ?? "(no body)");
  });

rules
  .command("sync <workspacePath>")
  .description("write applicable rules into a workspace's Claude memory dir")
  .option("-p, --product <slug>", "explicit product slug for this workspace; auto-detected if omitted")
  .action(async (workspacePath: string, opts: { product?: string }) => {
    const productSlug = opts.product ?? (await detectProductSlugForPath(workspacePath));
    if (!productSlug) {
      console.log(
        chalk.yellow(
          `→ no product entity registered for ${workspacePath}; only portfolio + type rules will sync`,
        ),
      );
    }
    const result = await syncRulesToWorkspace(workspacePath, productSlug);
    console.log(chalk.bold(`workspace: ${result.workspacePath}`));
    console.log(chalk.dim(`product slug: ${productSlug ?? "(none)"}`));
    console.log(chalk.dim(`memory dir: ${result.memoryDir}`));
    console.log(chalk.green(`wrote ${result.written.length} rule file(s):`));
    for (const f of result.written) console.log(`  + ${f}`);
    if (result.removed.length > 0) {
      console.log(chalk.yellow(`removed ${result.removed.length} orphan(s):`));
      for (const f of result.removed) console.log(`  - ${f}`);
    }
  });

async function detectProductSlugForPath(workspacePath: string): Promise<string | null> {
  const { default: pathMod } = await import("node:path");
  const absPath = pathMod.resolve(workspacePath);
  const rows = await db
    .select()
    .from(entities)
    .where(sql`${entities.type} = 'product' AND ${entities.sourcePath} = ${absPath}`)
    .limit(1);
  return rows[0]?.slug ?? null;
}

// ─── skills ────────────────────────────────────────────────────────
// Claude Code skills (~/.claude/skills/<name>/SKILL.md) as first-class
// brain entities. We index them for cross-reference + `think` citations;
// we do NOT host their bodies (Claude Code needs the files on disk for
// native /<skill> invocation).

const skill = program.command("skill").description("index and inspect Claude Code skills as brain entities");

skill
  .command("list")
  .description("list all skills indexed in the brain")
  .action(async () => {
    const items = await listSkills();
    if (items.length === 0) {
      console.log(chalk.dim("no skills indexed — run `pnpm roushi skill ingest` first"));
      return;
    }
    for (const s of items) {
      const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
      const warnings = Array.isArray(fm._warnings) ? fm._warnings.length : 0;
      const warn = warnings > 0 ? chalk.yellow(` ⚠ ${warnings}`) : "";
      console.log(`${chalk.bold(s.slug)}  ${chalk.dim(truncate(s.name, 60))}${warn}`);
    }
  });

skill
  .command("get <slug>")
  .description("show a skill's frontmatter + body + any lint warnings")
  .action(async (slug: string) => {
    const s = await getSkill(slug);
    if (!s) {
      console.error(chalk.red(`no skill with slug "${slug}"`));
      process.exit(1);
    }
    const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
    console.log(chalk.bold(s.name));
    console.log(chalk.dim(`slug: ${s.slug}`));
    if (typeof fm._source_path === "string") {
      console.log(chalk.dim(`source: ${fm._source_path}`));
    }
    console.log(chalk.dim(`indexed: ${new Date(s.updatedAt).toISOString().slice(0, 10)}`));
    if (Array.isArray(fm._warnings) && fm._warnings.length > 0) {
      console.log("");
      console.log(chalk.yellow("warnings:"));
      for (const w of fm._warnings) console.log(`  ${chalk.yellow("•")} ${w}`);
    }
    console.log("");
    console.log(s.description ?? "(no body)");
  });

skill
  .command("ingest [paths...]")
  .description("scan skills directories and upsert into the brain (default: ~/.claude/skills)")
  .action(async (paths: string[]) => {
    const result = await ingestSkills(paths && paths.length > 0 ? paths : undefined);
    console.log(chalk.green(`✓ scanned ${result.scanned} candidate(s)`));
    console.log(chalk.green(`✓ ${result.upserted} skill(s) upserted`));
    if (result.skipped.length > 0) {
      console.log(chalk.yellow(`! skipped ${result.skipped.length}:`));
      for (const s of result.skipped) {
        console.log(chalk.dim(`    ${s.dir}`));
        console.log(chalk.dim(`      ${s.reason}`));
      }
    }
  });

skill
  .command("pull")
  .description("Copy SKILL.md files from ~/.claude/skills/ into content/skills/ (git-tracked backup)")
  .option("-d, --disk <path>", "source disk dir (default ~/.claude/skills)")
  .option("-r, --repo <path>", "target repo dir (default ./content/skills)")
  .action(async (opts: { disk?: string; repo?: string }) => {
    const syncOpts: Parameters<typeof pullSkillsFromDisk>[0] = {};
    if (opts.disk) syncOpts.diskRoot = opts.disk;
    if (opts.repo) syncOpts.repoSkillsDir = opts.repo;
    const result = await pullSkillsFromDisk(syncOpts);
    console.log(chalk.green(`← pulled ${result.pulled.length} skill(s) into content/skills/`));
    for (const n of result.pulled) console.log(chalk.dim(`  + ${n}`));
    if (result.unchanged.length > 0) {
      console.log(chalk.dim(`  (${result.unchanged.length} unchanged: ${result.unchanged.join(", ")})`));
    }
  });

skill
  .command("push [target]")
  .description(
    "Copy SKILL.md files from content/skills/ to a target dir's .claude/skills/. Target defaults to ~/.claude/skills. Pass a workspace path to install into <workspace>/.claude/skills/.",
  )
  .option("-r, --repo <path>", "source repo dir (default ./content/skills)")
  .action(async (target: string | undefined, opts: { repo?: string }) => {
    const diskRoot = resolveSkillsTarget(target);
    const syncOpts: Parameters<typeof pushSkillsToDisk>[0] = { diskRoot };
    if (opts.repo) syncOpts.repoSkillsDir = opts.repo;
    const result = await pushSkillsToDisk(syncOpts);
    console.log(chalk.green(`→ pushed ${result.pushed.length} skill(s) to ${diskRoot}`));
    for (const n of result.pushed) console.log(chalk.dim(`  + ${n}`));
    if (result.unchanged.length > 0) {
      console.log(chalk.dim(`  (${result.unchanged.length} unchanged: ${result.unchanged.join(", ")})`));
    }
  });

skill
  .command("sync-workspace <workspacePath>")
  .description(
    "Push project-scoped skills (applies_to_slug/type/portfolio matches) into <workspace>/.claude/skills/. Removes Roushi-managed skills that no longer apply. Leaves user-installed skills untouched (no .roushi-skill marker).",
  )
  .option("-p, --product <slug>", "explicit product slug; auto-detected if omitted")
  .action(async (workspacePath: string, opts: { product?: string }) => {
    const productSlug = opts.product ?? (await detectProductSlugForPath(workspacePath));
    const result = await syncSkillsToWorkspace(workspacePath, productSlug);
    console.log(chalk.bold(`workspace: ${result.workspacePath}`));
    console.log(chalk.dim(`product slug: ${result.productSlug ?? "(none)"}`));
    console.log(chalk.dim(`skills dir: ${result.skillsDir}`));
    if (result.written.length > 0) {
      console.log(chalk.green(`wrote ${result.written.length} skill(s):`));
      for (const s of result.written) console.log(`  + ${s}`);
    } else {
      console.log(chalk.dim(`(no applicable skills)`));
    }
    if (result.removed.length > 0) {
      console.log(chalk.yellow(`removed ${result.removed.length} orphan(s):`));
      for (const s of result.removed) console.log(`  - ${s}`);
    }
  });

skill
  .command("sync")
  .description(
    "Two-way sync between content/skills/ and ~/.claude/skills/. Auto-copies one-sided files; flags two-sided divergence as conflicts (does NOT auto-merge).",
  )
  .option("-d, --disk <path>", "disk dir (default ~/.claude/skills)")
  .option("-r, --repo <path>", "repo dir (default ./content/skills)")
  .option("--show-diff", "print a unified diff for each conflict (requires git on PATH)")
  .action(async (opts: { disk?: string; repo?: string; showDiff?: boolean }) => {
    const syncOpts: Parameters<typeof syncSkillsWithDisk>[0] = {};
    if (opts.disk) syncOpts.diskRoot = opts.disk;
    if (opts.repo) syncOpts.repoSkillsDir = opts.repo;
    if (opts.showDiff) syncOpts.computeDiff = true;
    const result = await syncSkillsWithDisk(syncOpts);
    if (result.pulled.length > 0) {
      console.log(chalk.green(`← pulled ${result.pulled.length} from disk: ${result.pulled.join(", ")}`));
    }
    if (result.pushed.length > 0) {
      console.log(chalk.green(`→ pushed ${result.pushed.length} from repo: ${result.pushed.join(", ")}`));
    }
    if (result.unchanged.length > 0) {
      console.log(chalk.dim(`  (${result.unchanged.length} unchanged)`));
    }
    if (result.conflicts.length > 0) {
      console.log(chalk.yellow(`! ${result.conflicts.length} conflict(s) — resolve manually:`));
      for (const c of result.conflicts) {
        console.log(chalk.yellow(`  ⚠ ${c.name}`));
        console.log(chalk.dim(`    ${c.reason}`));
        if (c.diff) {
          console.log(chalk.dim("    --- diff (disk → repo) ---"));
          for (const line of c.diff.split("\n")) {
            const color = line.startsWith("+")
              ? chalk.green
              : line.startsWith("-")
                ? chalk.red
                : line.startsWith("@@")
                  ? chalk.cyan
                  : chalk.dim;
            console.log(`    ${color(line)}`);
          }
        }
      }
      process.exit(1);
    }
    if (result.pulled.length === 0 && result.pushed.length === 0 && result.conflicts.length === 0) {
      console.log(chalk.dim("✓ already in sync"));
    }
  });

// ─── contradictions ────────────────────────────────────────────────
// Find pairs of entities (within the same type) that semantically
// look close enough to potentially contradict, then have an LLM judge
// score each pair. See src/lib/contradictions.ts.

program
  .command("audit-contradictions")
  .description(
    "find entities that contradict each other (pgvector close-pair search + LLM judge)",
  )
  .option(
    "-t, --types <list>",
    `comma-separated types to audit (default: ${DEFAULT_CONTRADICTION_TYPES.join(",")})`,
  )
  .option("-d, --distance <n>", "max cosine distance for a candidate pair (default 0.25)", "0.25")
  .option("-p, --max-pairs <n>", "hard cap on candidate pairs evaluated (default 100)", "100")
  .option("--all", "show non-contradicting findings too (default: only contradictions)")
  .action(
    async (opts: {
      types?: string;
      distance: string;
      maxPairs: string;
      all?: boolean;
    }) => {
      const types = opts.types
        ? (opts.types.split(",").map((s) => s.trim()).filter(Boolean) as ContradictionType[])
        : undefined;
      const result = await runContradictionScan({
        types,
        distanceThreshold: Number(opts.distance),
        maxPairs: Number(opts.maxPairs),
      });
      console.log(
        `Evaluated ${result.candidatesEvaluated} candidate pair(s) → ${result.contradictions.length} actual contradiction(s).`,
      );
      console.log("");

      const toShow = opts.all ? result.findings : result.contradictions;
      if (toShow.length === 0) {
        console.log(chalk.dim("(none)"));
        return;
      }
      for (const f of toShow) {
        const sev =
          f.severity === "major"
            ? chalk.red("MAJOR")
            : f.severity === "minor"
              ? chalk.yellow("minor")
              : chalk.dim("none");
        const status = f.contradicts ? chalk.red("✗ contradicts") : chalk.dim("· no conflict");
        console.log(`${status}  ${sev}  [${chalk.cyan(f.pair.type)}]  cos_dist=${f.cosineDistance.toFixed(3)}`);
        console.log(`  ${chalk.bold(f.pair.aSlug)} ↔ ${chalk.bold(f.pair.bSlug)}`);
        console.log(`  ${chalk.dim(f.explanation)}`);
        console.log("");
      }
    },
  );

// ─── evals ─────────────────────────────────────────────────────────
// Retrieval regression tests. Captured queries live in evals/queries.json;
// `roushi eval replay` re-runs them and reports recall@K + precision@K +
// which expected slugs slipped out of the top K. No LLM — pure ranking
// check.

const evals = program.command("eval").description("retrieval evals: capture + replay queries");

evals
  .command("list")
  .description("show all captured eval queries")
  .option("-f, --file <path>", "queries file", "evals/queries.json")
  .action(async (opts: { file: string }) => {
    const qs = await loadEvalQueries(opts.file);
    if (qs.length === 0) {
      console.log(chalk.dim("(no queries captured yet)"));
      return;
    }
    for (const q of qs) {
      console.log(`${chalk.bold(q.name)}  ${chalk.dim(`"${q.query}"`)}`);
      console.log(`  expected: ${q.expected.map((s) => chalk.cyan(s)).join(", ")}`);
      if (q.notes) console.log(`  ${chalk.dim(q.notes)}`);
    }
    console.log(chalk.dim(`\n${qs.length} quer${qs.length === 1 ? "y" : "ies"} captured`));
  });

evals
  .command("capture <name> <query>")
  .description("run a query now and save the current top-K slugs as the expected baseline")
  .option("-k, --top <n>", "top-K to capture (default 5)", "5")
  .option("-n, --notes <text>", "free-form notes on why this query matters")
  .option("-f, --file <path>", "queries file", "evals/queries.json")
  .action(async (name: string, query: string, opts: { top: string; notes?: string; file: string }) => {
    const k = Number(opts.top);
    let existing: EvalQuery[] = [];
    try {
      existing = await loadEvalQueries(opts.file);
    } catch {
      // file doesn't exist yet — that's fine, we'll create it
    }
    if (existing.some((q) => q.name === name)) {
      console.error(chalk.red(`A query named "${name}" already exists. Pick a different name or delete it first.`));
      process.exit(1);
    }
    const captured = await captureEvalQuery(name, query, k, opts.notes);
    if (captured.expected.length === 0) {
      console.error(chalk.yellow(`Search returned nothing for "${query}" — not saving.`));
      process.exit(1);
    }
    await saveEvalQueries([...existing, captured], opts.file);
    console.log(chalk.green(`✓ saved query "${name}" with ${captured.expected.length} expected slug(s)`));
    for (const s of captured.expected) console.log(`  ${chalk.cyan(s)}`);
    console.log(chalk.dim(`\nReview the expected list and prune any slugs that don't actually belong before committing.`));
  });

evals
  .command("replay")
  .description("re-run all captured queries against the current brain; report recall@K + precision@K")
  .option("-k, --top <n>", "top-K window for recall/precision (default 5)", "5")
  .option("-f, --file <path>", "queries file", "evals/queries.json")
  .option("--only-failing", "only print queries with at least one missing expected slug")
  .option("--rerank", "run with the LLM rerank stage enabled (A/B against the baseline)")
  .action(async (opts: { top: string; file: string; onlyFailing?: boolean; rerank?: boolean }) => {
    const k = Number(opts.top);
    const summary = await runAllEvals(opts.file, k, opts.rerank ? { rerank: true } : {});
    if (opts.rerank) {
      console.log(chalk.cyan(`[rerank enabled]`));
    }
    console.log(chalk.bold(`Replayed ${summary.totalQueries} quer${summary.totalQueries === 1 ? "y" : "ies"} at top-${k}`));
    console.log(
      `  avg recall@${k}    = ${formatPct(summary.avgRecall)}    ${barFor(summary.avgRecall)}`,
    );
    console.log(
      `  avg precision@${k} = ${formatPct(summary.avgPrecision)}    ${barFor(summary.avgPrecision)}`,
    );
    console.log(
      `  failing queries   = ${summary.failingQueries.length}/${summary.totalQueries} (any expected slug missing from top-${k})`,
    );
    console.log("");

    const toShow = opts.onlyFailing ? summary.failingQueries : summary.perQuery;
    for (const r of toShow) {
      const pass = r.missingFromTopK.length === 0;
      const mark = pass ? chalk.green("✓") : chalk.red("✗");
      console.log(
        `${mark} ${chalk.bold(r.name.padEnd(30))}  recall=${formatPct(r.recallAtK)}  precision=${formatPct(r.precisionAtK)}`,
      );
      console.log(`   ${chalk.dim(`"${r.query}"`)}`);
      if (!pass) {
        for (const m of r.expectedRankedBelowK) {
          const rank = m.rank === null ? chalk.red("not in top 25") : chalk.yellow(`rank ${m.rank}`);
          console.log(`   ${chalk.red("missing")} ${chalk.cyan(m.slug)} (${rank})`);
        }
        if (r.unexpectedInTopK.length > 0) {
          console.log(
            `   ${chalk.dim(`also returned: ${r.unexpectedInTopK.map((s) => chalk.dim(s)).join(", ")}`)}`,
          );
        }
      }
    }

    // Non-zero exit if anything failed — useful for CI later.
    if (summary.failingQueries.length > 0) process.exit(1);
  });

evals
  .command("run <name>")
  .description("re-run one captured eval by name")
  .option("-k, --top <n>", "top-K window (default 5)", "5")
  .option("-f, --file <path>", "queries file", "evals/queries.json")
  .option("--rerank", "run with the LLM rerank stage enabled")
  .action(async (name: string, opts: { top: string; file: string; rerank?: boolean }) => {
    const qs = await loadEvalQueries(opts.file);
    const q = qs.find((x) => x.name === name);
    if (!q) {
      console.error(chalk.red(`No eval named "${name}". Try: roushi eval list`));
      process.exit(1);
    }
    const k = Number(opts.top);
    const r = await runOneEval(q, k, opts.rerank ? { rerank: true } : {});
    console.log(chalk.bold(`${r.name}  "${r.query}"`));
    console.log(`  recall@${k}    = ${formatPct(r.recallAtK)}`);
    console.log(`  precision@${k} = ${formatPct(r.precisionAtK)}`);
    console.log(`  expected: ${r.expected.map((s) => chalk.cyan(s)).join(", ")}`);
    console.log(`  actual:   ${r.actual.map((s) => chalk.cyan(s)).join(", ")}`);
    if (r.missingFromTopK.length > 0) {
      console.log(`  ${chalk.red("missing from top-K:")}`);
      for (const m of r.expectedRankedBelowK) {
        const rank = m.rank === null ? "not in top 25" : `rank ${m.rank}`;
        console.log(`    - ${chalk.cyan(m.slug)} (${rank})`);
      }
    }
  });

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1).padStart(5)}%`;
}

function barFor(pct: number): string {
  const width = 20;
  const filled = Math.round(pct * width);
  return chalk.dim("[") + chalk.green("█".repeat(filled)) + chalk.dim("░".repeat(width - filled) + "]");
}

// ─── portfolio ─────────────────────────────────────────────────────
// `roushi portfolio list` — show all product entities + their status.
// `roushi portfolio export-registry` — write the catalog markdown that
// used to be hand-maintained at ~/.claude/rules/projects-registry.md.

const portfolio = program.command("portfolio").description("portfolio catalog + registry generation");

portfolio
  .command("list")
  .description("list all product entities with status + domain")
  .action(async () => {
    const entries = await listPortfolio();
    for (const e of entries) {
      const status = chalk.cyan(e.status.padEnd(15));
      const domain = chalk.dim((e.domain ?? "—").padEnd(22));
      console.log(`${chalk.bold(e.slug.padEnd(25))} ${status} ${domain} ${chalk.dim(e.tagline ?? "")}`);
    }
    console.log(chalk.dim(`\n${entries.length} product(s)`));
  });

portfolio
  .command("export-registry")
  .description("generate the portfolio registry markdown from brain state")
  .option(
    "-o, --output <path>",
    "where to write the generated file",
    "C:/Users/samws/.claude/rules/projects-registry.md",
  )
  .option("--stdout", "print to stdout instead of writing to a file")
  .action(async (opts: { output: string; stdout?: boolean }) => {
    const md = await renderRegistryMarkdown();
    if (opts.stdout) {
      process.stdout.write(md);
      return;
    }
    const { promises: fs } = await import("node:fs");
    const { default: pathMod } = await import("node:path");
    const absOutput = pathMod.resolve(opts.output);
    await fs.mkdir(pathMod.dirname(absOutput), { recursive: true });
    await fs.writeFile(absOutput, md, "utf-8");
    console.log(chalk.green(`✓ wrote ${md.length} bytes to ${absOutput}`));
    console.log(
      chalk.dim(
        "Loaded into every Claude Code session via the global-rules mechanism. Re-run after adding/changing any product entity.",
      ),
    );
  });

// ─── memory ────────────────────────────────────────────────────────
// `roushi memory ingest <workspace>` — pull a workspace's Claude
// auto-memory (`feedback_*.md`) into Roushi as searchable `lesson`
// entities. The original files stay in the workspace's memory dir and
// keep firing as local memory; this just adds cross-portfolio search
// without disturbing anything.

const memory = program.command("memory").description("import Claude auto-memory into the brain");

memory
  .command("ingest <workspacePath>")
  .description("ingest a workspace's `feedback_*.md` auto-memory as Roushi lesson entities")
  .option("-p, --product <slug>", "explicit product slug; auto-detected from sourcePath if omitted")
  .option("--include-project-notes", "also ingest `type: project` notes (usually WIP, off by default)")
  .action(
    async (
      workspacePath: string,
      opts: { product?: string; includeProjectNotes?: boolean },
    ) => {
      const productSlug = opts.product ?? (await detectProductSlugForPath(workspacePath));
      const result = await importWorkspaceMemory(workspacePath, productSlug, {
        includeProjectNotes: opts.includeProjectNotes,
      });
      console.log(chalk.bold(`workspace: ${result.workspacePath}`));
      console.log(chalk.dim(`product slug: ${productSlug ?? "(none)"}`));
      console.log(
        chalk.green(`created ${result.createdCount}`),
        chalk.cyan(`updated ${result.updatedCount}`),
        chalk.dim(`skipped ${result.skippedCount}`),
      );
      for (const f of result.files) {
        const tag =
          f.action === "created"
            ? chalk.green("+")
            : f.action === "updated"
              ? chalk.cyan("~")
              : chalk.dim("·");
        const label = f.action === "skipped" ? chalk.dim(`(${f.reason})`) : chalk.dim(`→ ${f.slug}`);
        console.log(`  ${tag} ${f.filename}  ${label}`);
      }
    },
  );

rules
  .command("install-hook <workspacePath>")
  .description(
    "install a Claude Code SessionStart hook in <workspacePath> that auto-syncs rules; replaces any prior Roushi hook and runs an initial sync",
  )
  .option("--roushi-dir <path>", "absolute path to the Roushi repo", "C:/Users/samws/Roushi")
  .option("--skip-initial-sync", "don't run an initial sync after installing the hook")
  .action(async (workspacePath: string, opts: { roushiDir: string; skipInitialSync?: boolean }) => {
    const { promises: fs } = await import("node:fs");
    const { default: pathMod } = await import("node:path");
    const workspaceAbs = pathMod.resolve(workspacePath);
    const claudeDir = pathMod.join(workspaceAbs, ".claude");
    const settingsPath = pathMod.join(claudeDir, "settings.json");

    await fs.mkdir(claudeDir, { recursive: true });

    let settings: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(settingsPath, "utf-8");
      settings = JSON.parse(existing);
    } catch {
      // doesn't exist yet — start fresh
    }

    // Call tsx via its absolute path inside Roushi's node_modules. Bare
    // `tsx` isn't on PATH outside Roushi, and `pnpm --dir exec` would CHANGE
    // process.cwd() to the Roushi dir — which breaks the hook's
    // "which product am I in?" detection (it would always see Roushi).
    // The absolute-path form preserves cwd so the hook sees the actual
    // workspace it's running for.
    const hookCommand = `"${opts.roushiDir}/node_modules/.bin/tsx" --env-file="${opts.roushiDir}/.env.local" "${opts.roushiDir}/scripts/session-start-hook.ts"`;
    const hooks = (settings.hooks as Record<string, unknown> | undefined) ?? {};
    const rawSessionStart = (hooks.SessionStart as unknown[] | undefined) ?? [];

    // Drop ANY prior Roushi-installed hook entries (detect by the
    // session-start-hook.ts marker in any nested command string) so re-runs
    // don't accumulate stale or wrongly-formed commands.
    const sessionStart = rawSessionStart.filter((entry) => {
      if (typeof entry !== "object" || entry === null) return true;
      const e = entry as { hooks?: { command?: string }[] };
      if (!Array.isArray(e.hooks)) return true;
      return !e.hooks.some(
        (h) => typeof h?.command === "string" && h.command.includes("session-start-hook.ts"),
      );
    });
    const removed = rawSessionStart.length - sessionStart.length;

    // Omit `matcher` entirely — Claude Code only accepts exact SessionStart
    // event names ("startup" | "resume" | "clear" | "compact") and "*" isn't
    // a valid wildcard. Omitting the field fires the hook on every
    // SessionStart event, which is what we want.
    sessionStart.push({
      hooks: [{ type: "command", command: hookCommand }],
    });
    hooks.SessionStart = sessionStart;
    settings.hooks = hooks;

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
    console.log(chalk.green(`✓ installed SessionStart hook in ${settingsPath}`));
    if (removed > 0) console.log(chalk.dim(`  (replaced ${removed} prior Roushi hook entry/entries)`));

    if (opts.skipInitialSync) {
      console.log(chalk.dim(`  initial sync skipped — next Claude session will sync.`));
      return;
    }

    // Run an initial sync immediately so the rule files exist before the
    // next session start (and so the install is verifiable: Sam can see the
    // files materialize without launching Claude Code first).
    const productSlug = await detectProductSlugForPath(workspaceAbs);
    try {
      const result = await syncRulesToWorkspace(workspaceAbs, productSlug);
      console.log(
        chalk.green(
          `✓ initial sync wrote ${result.written.length} rule(s) for product slug ${productSlug ?? "(none)"}`,
        ),
      );
      for (const f of result.written) console.log(chalk.dim(`  + ${f}`));
      if (result.removed.length > 0) {
        for (const f of result.removed) console.log(chalk.yellow(`  - ${f} (orphan removed)`));
      }
    } catch (err) {
      console.error(
        chalk.yellow(
          `✗ initial sync failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  });

// ─── pattern ─── (apply portfolio-wide automation transforms)

const patternCmd = program
  .command("pattern")
  .description("Portfolio-wide automation patterns (analytics, branding, integrations)");

patternCmd
  .command("list")
  .description("List all available patterns")
  .action(async () => {
    const { listPatterns } = await import("../patterns/_registry");
    const patterns = listPatterns();
    console.log("");
    for (const p of patterns) {
      console.log(chalk.bold(p.slug) + chalk.dim(`  [${p.category}]`));
      console.log(`  ${p.description}`);
      console.log("");
    }
  });

patternCmd
  .command("detect [slug]")
  .description("Check whether a pattern is applied to the current project (or all patterns if no slug). Add --portfolio to scan every product in the brain.")
  .option("--portfolio", "Scan every product entity in the brain instead of just cwd")
  .action(async (slug: string | undefined, opts: { portfolio?: boolean }) => {
    const { listPatterns, getPattern } = await import("../patterns/_registry");
    const { Project } = await import("../patterns/_project");
    const patterns = slug ? [getPattern(slug)].filter(Boolean) : listPatterns();
    if (patterns.length === 0) {
      console.error(chalk.red(`No pattern with slug "${slug}"`));
      process.exit(1);
    }

    const iconFor = (status: string) =>
      status === "applied"
        ? chalk.green("✓")
        : status === "partial"
          ? chalk.yellow("~")
          : status === "not-applied"
            ? chalk.dim("○")
            : chalk.red("✗");

    if (!opts.portfolio) {
      const project = new Project({ cwd: process.cwd() });
      for (const p of patterns) {
        const result = await p!.detect(project);
        console.log(`${iconFor(result.status)} ${chalk.bold(p!.slug)}  ${chalk.dim(result.status)}`);
        if (result.detail) console.log(`  ${chalk.dim(result.detail)}`);
        if (result.missing?.length) console.log(`  ${chalk.dim(`missing: ${result.missing.join(", ")}`)}`);
      }
      return;
    }

    // Portfolio mode — enumerate products from the brain
    const { db } = await import("../db/index");
    const { entities } = await import("../db/schema");
    const { sql } = await import("drizzle-orm");
    const rows = await db.execute<{
      slug: string;
      name: string;
      source_path: string | null;
      frontmatter: Record<string, unknown>;
    }>(sql`
      SELECT slug, name, source_path, frontmatter
      FROM ${entities}
      WHERE type = 'product' AND source_path IS NOT NULL
      ORDER BY slug
    `);

    // Build a matrix
    const productSlugs = rows.rows.map((r) => r.slug);
    const matrix: Record<string, Record<string, string>> = {};
    for (const product of rows.rows) {
      matrix[product.slug] = {};
      const project = new Project({
        cwd: product.source_path!,
        productSlug: product.slug,
        domain: (product.frontmatter?.domain as string | undefined) ?? null,
      });
      for (const p of patterns) {
        try {
          const result = await p!.detect(project);
          matrix[product.slug]![p!.slug] = result.status;
        } catch (err) {
          matrix[product.slug]![p!.slug] = "error";
        }
      }
    }

    // Print as table
    const colWidth = Math.max(...patterns.map((p) => p!.slug.length), 16) + 2;
    const productWidth = Math.max(...productSlugs.map((s) => s.length), 12) + 2;
    process.stdout.write(" ".repeat(productWidth));
    for (const p of patterns) process.stdout.write(chalk.bold(p!.slug.padEnd(colWidth)));
    process.stdout.write("\n");
    for (const productSlug of productSlugs) {
      process.stdout.write(chalk.bold(productSlug.padEnd(productWidth)));
      for (const p of patterns) {
        const status = matrix[productSlug]![p!.slug] ?? "?";
        process.stdout.write(`${iconFor(status)} ${chalk.dim(status.padEnd(colWidth - 2))}`);
      }
      process.stdout.write("\n");
    }

    // Cache snapshot in the brain so the deployed /patterns UI can read it
    try {
      const { writeSnapshot } = await import("../lib/pattern-snapshot");
      const snapshotProducts = productSlugs.map((s) => {
        const productRow = rows.rows.find((r) => r.slug === s)!;
        const cells: Record<string, { status: string; detail?: string; missing?: string[] }> = {};
        for (const p of patterns) {
          cells[p!.slug] = { status: matrix[s]![p!.slug] ?? "error" };
        }
        return { slug: s, name: productRow.name, cells };
      });
      await writeSnapshot({
        patterns: patterns.map((p) => ({
          slug: p!.slug,
          name: p!.name,
          description: p!.description,
          category: p!.category,
        })),
        products: snapshotProducts,
        source: "cli",
      });
      console.log("");
      console.log(chalk.dim("✓ Snapshot cached to brain — /patterns UI will show this data."));
    } catch (err) {
      console.warn(chalk.yellow(`⚠ Couldn't cache snapshot: ${err instanceof Error ? err.message : String(err)}`));
    }
  });

patternCmd
  .command("apply <slug>")
  .description("Apply a pattern to the current project. Pass params as --key=value (e.g. --site-url=https://example.com).")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .action(async (slug: string, _opts: unknown, cmd: Command) => {
    const { getPattern } = await import("../patterns/_registry");
    const { Project } = await import("../patterns/_project");
    const pattern = getPattern(slug);
    if (!pattern) {
      console.error(chalk.red(`No pattern with slug "${slug}"`));
      process.exit(1);
    }

    // Parse --key=value pairs from unknown args
    const params: Record<string, string | number | boolean> = {};
    const raw = cmd.args.slice(1);
    for (const arg of raw) {
      const m = arg.match(/^--([a-zA-Z0-9-]+)=(.+)$/);
      if (m && m[1] && m[2] !== undefined) {
        const key = m[1].replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        params[key] = m[2];
      }
    }

    const project = new Project({ cwd: process.cwd() });
    console.log(chalk.bold(`Applying ${pattern.name} to ${project.cwd}`));
    try {
      // Pattern.apply uses a generic param map — cast to satisfy the contract.
      await pattern.apply(project, params as never);
      console.log(chalk.green(`\n✓ Pattern "${slug}" applied`));
    } catch (err) {
      console.error(chalk.red(`\n✗ Failed: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  });

// ─── drift-check ─── (scan every product for shipment-sweep drift)

program
  .command("drift-check")
  .description("Scan every product in the brain for shipment-sweep drift (version + CHANGELOG + partial patterns)")
  .option("-p, --product <slug>", "limit to one product (comma-separated for multiple)")
  .option("--skip-patterns", "skip pattern partial-state checks (faster)")
  .option("--post-goals", "upsert a [system] Drift: goal per product with errors (closes when clean)")
  .action(async (opts: { product?: string; skipPatterns?: boolean; postGoals?: boolean }) => {
    const { runDriftCheck } = await import("../lib/drift-check");
    const productSlugs = opts.product?.split(",").map((s) => s.trim()).filter(Boolean);
    const findings = await runDriftCheck({
      productSlugs,
      skipPatterns: opts.skipPatterns,
      postGoals: opts.postGoals,
    });

    if (findings.length === 0) {
      console.log(chalk.green("✓ No drift detected across the portfolio."));
      return;
    }

    // Group by product
    const byProduct = new Map<string, typeof findings>();
    for (const f of findings) {
      const arr = byProduct.get(f.productSlug) ?? [];
      arr.push(f);
      byProduct.set(f.productSlug, arr);
    }

    let errors = 0;
    let warnings = 0;
    let infos = 0;
    for (const f of findings) {
      if (f.severity === "error") errors++;
      else if (f.severity === "warning") warnings++;
      else infos++;
    }

    console.log("");
    console.log(
      `${chalk.red(`${errors} errors`)} · ${chalk.yellow(`${warnings} warnings`)} · ${chalk.dim(`${infos} info`)}`,
    );
    console.log("");

    for (const [slug, items] of byProduct) {
      const first = items[0]!;
      console.log(chalk.bold(`${first.productName}  ${chalk.dim(`(${slug})`)}`));
      for (const f of items) {
        const icon =
          f.severity === "error"
            ? chalk.red("✗")
            : f.severity === "warning"
              ? chalk.yellow("~")
              : chalk.dim("ⓘ");
        console.log(`  ${icon} [${f.category}] ${f.message}`);
        if (f.fix) console.log(`    ${chalk.dim(`fix: ${f.fix}`)}`);
      }
      console.log("");
    }

    if (errors > 0) process.exit(1);
  });

program.parseAsync().catch((err) => {
  console.error(chalk.red(`Error: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
