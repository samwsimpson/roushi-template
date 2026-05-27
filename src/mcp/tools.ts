// Roushi MCP tool definitions. Shared between the stdio entrypoint
// (`src/mcp/server.ts`) and the HTTP entrypoint (`src/mcp/http-server.ts`).
//
// Each transport creates its own McpServer instance and calls registerAllTools(mcp)
// so they expose the same surface. Adding a new tool? Add it here; both
// transports pick it up automatically.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import type { Entity, NewEntity } from "../db/schema";
import { entities } from "../db/schema";
import { applyAllSuggestedFixes, auditEdges } from "../lib/audit";
import { listStaleEntities, touchEntity, DEFAULT_STALE_DAYS } from "../lib/decay";
import { findDuplicateGroups, mergeEntities } from "../lib/dedupe";
import { addProject, discoverProjects } from "../lib/discovery";
import { embedText } from "../lib/embeddings";
import { createGoal, listGoals, updateGoalStatus, type GoalStatus } from "../lib/goals";
import { traverseFrom } from "../lib/graph";
import { ingestPath } from "../lib/ingest";
import {
  ACTION_STATUSES,
  INVOCATION_STATUSES,
  abandonInvocation,
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
  getRule,
  listRules,
  rulesForWorkspace,
  syncRulesToWorkspace,
} from "../lib/rules";
import { getSkill, ingestSkills, listSkills } from "../lib/skills";
import { think } from "../lib/think";
import { listScratchpad, readScratchpad, writeScratchpad } from "../lib/scratchpad";
import { hybridSearch } from "../lib/search";

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

const EDGE_RELATIONS = [
  "uses",
  "hosted_on",
  "applies_to",
  "supersedes",
  "led_to",
  "shares_pattern",
  "mentions",
  "defined_by",
  "blocks",
  "depends_on",
] as const;

const GOAL_STATUSES = ["active", "completed", "abandoned", "blocked"] as const;

/** All Roushi MCP tool names, exported so transports can announce them on startup. */
export const TOOL_NAMES = [
  "roushi_think",
  "roushi_search",
  "roushi_graph_query",
  "roushi_get_entity",
  "roushi_list_entities",
  "roushi_add",
  "roushi_ingest",
  "roushi_scan_projects",
  "roushi_add_project",
  "roushi_goal_add",
  "roushi_goal_list",
  "roushi_goal_update_status",
  "roushi_scratchpad_write",
  "roushi_scratchpad_read",
  "roushi_scratchpad_list",
  "roushi_playbook_add",
  "roushi_playbook_list",
  "roushi_playbook_get",
  "roushi_playbook_check_for_event",
  "roushi_playbook_remove",
  "roushi_playbook_runs",
  "roushi_playbook_run_get",
  "roushi_playbook_action_set_status",
  "roushi_playbook_abandon_run",
  "roushi_rule_list",
  "roushi_rule_get",
  "roushi_rule_sync_workspace",
  "roushi_skill_list",
  "roushi_skill_get",
  "roushi_skill_ingest",
  "roushi_audit_edges",
  "roushi_find_duplicates",
  "roushi_merge_entities",
  "roushi_list_stale",
  "roushi_touch_entity",
];

export function registerAllTools(mcp: McpServer): void {
  // ─── think ───────────────────────────────────────────────────────────
  // Synthesis layer — runs hybrid search, then asks an LLM to compose
  // an answer grounded in the retrieved entities WITH citations + gap
  // analysis ("what the brain doesn't know yet"). Use this for actual
  // answers; use roushi_search when you just want the raw hits.

  mcp.registerTool(
    "roushi_think",
    {
      title: "Roushi: ask the master (synthesized answer)",
      description:
        "Runs hybrid search and synthesizes a composed answer with inline [slug] citations + an explicit gap analysis. " +
        "Use this when you want the answer to a question, not just retrieved chunks. Slower + costs an LLM call. " +
        "Prefer roushi_search if you just need the top matching entities.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language question to answer from the brain"),
        retrievalLimit: z
          .number()
          .int()
          .min(3)
          .max(30)
          .optional()
          .describe("How many hits to ground the synthesis on. Default 12."),
      },
    },
    async ({ query, retrievalLimit }) => {
      const result = await think(query, { retrievalLimit });
      const lines = [
        result.answer.answer,
        "",
        `_Grounded on ${result.hits.length} retrieved entit${result.hits.length === 1 ? "y" : "ies"} · model ${result.modelUsed}_`,
      ];
      if (result.answer.citations.length > 0) {
        lines.push("", "**Citations:**");
        for (const c of result.answer.citations) {
          lines.push(`- \`${c.slug}\` — ${c.why}`);
        }
      }
      if (result.answer.gaps.length > 0) {
        lines.push("", "**What the brain doesn't know yet:**");
        for (const g of result.answer.gaps) {
          lines.push(`- ${g}`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // ─── search ──────────────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_search",
    {
      title: "Roushi: hybrid search",
      description:
        "Hybrid search across the Roushi brain (vector + keyword + RRF fusion). " +
        "Returns top-ranked entities with their type, name, description, and score. " +
        "Optional rerank=true adds an LLM re-ordering stage (slower + costs ~$0.0005, but improves quality on ambiguous queries).",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language search query"),
        limit: z.number().int().min(1).max(50).optional().describe("Max results (default 10)"),
        rerank: z
          .boolean()
          .optional()
          .describe(
            "Add an LLM rerank stage after RRF. Adds ~1-2s + ~$0.0005 per query. Default false. Don't enable if you're going to pass results to another LLM (e.g. roushi_think already reranks implicitly).",
          ),
      },
    },
    async ({ query, limit, rerank }) => {
      const searchOpts: { limit?: number; rerank?: boolean } = {};
      if (limit !== undefined) searchOpts.limit = limit;
      if (rerank !== undefined) searchOpts.rerank = rerank;
      const hits = await hybridSearch(query, searchOpts);
      return {
        content: [
          {
            type: "text",
            text:
              hits.length === 0
                ? `No matches for: ${query}`
                : hits
                    .map(
                      (h, i) =>
                        `${i + 1}. [${h.entity.type}] ${h.entity.name} (${h.entity.slug}) ` +
                        `— score ${h.score.toFixed(4)} (${h.source})\n   ${truncate(h.entity.description, 200)}`,
                    )
                    .join("\n"),
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "roushi_graph_query",
    {
      title: "Roushi: graph traversal",
      description: "Walk the typed edge graph from a starting entity. Returns entities reachable within N hops.",
      inputSchema: {
        slug: z.string().min(1).describe("Slug of the starting entity"),
        maxHops: z.number().int().min(1).max(5).optional().describe("Default 2"),
        relations: z.array(z.enum(EDGE_RELATIONS)).optional().describe("Restrict to these relations (omit for all)"),
      },
    },
    async ({ slug, maxHops, relations }) => {
      const nodes = await traverseFrom(slug, { maxHops, relations });
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: `No entity found with slug: ${slug}` }] };
      }
      const text = nodes
        .map((n) => {
          const indent = "  ".repeat(n.depth);
          const lastEdge = n.pathEdges.at(-1);
          const relLabel = lastEdge ? ` <${lastEdge.relation}>` : "";
          return `${indent}[${n.entity.type}] ${n.entity.name} (${n.entity.slug})${relLabel}`;
        })
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_get_entity",
    {
      title: "Roushi: get entity by slug",
      description: "Fetch a single entity's full content by its slug.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const rows = await db.select().from(entities).where(sql`${entities.slug} = ${slug}`).limit(1);
      const entity = rows[0];
      if (!entity) return { content: [{ type: "text", text: `Not found: ${slug}` }] };
      return { content: [{ type: "text", text: formatEntity(entity) }] };
    },
  );

  mcp.registerTool(
    "roushi_list_entities",
    {
      title: "Roushi: list entities",
      description: "List entities, optionally filtered by type. Limited to 100 per call.",
      inputSchema: {
        type: z.enum(ENTITY_TYPES).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ type, limit }) => {
      const take = limit ?? 50;
      const query = type
        ? db.select().from(entities).where(sql`${entities.type} = ${type}`).limit(take)
        : db.select().from(entities).limit(take);
      const rows = await query;
      if (rows.length === 0) {
        return { content: [{ type: "text", text: type ? `No entities of type ${type}` : `No entities` }] };
      }
      const text = rows.map((e) => `[${e.type}] ${e.name} (${e.slug})`).join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_add",
    {
      title: "Roushi: add or update entity",
      description: "Create (or upsert by slug) an entity in the brain.",
      inputSchema: {
        slug: z.string().min(1).max(128),
        type: z.enum(ENTITY_TYPES),
        name: z.string().min(1),
        description: z.string().optional(),
        frontmatter: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async ({ slug, type, name, description, frontmatter }) => {
      const embeddingInput = [name, description ?? ""].filter(Boolean).join("\n").trim();
      const embedding = embeddingInput ? await embedText(embeddingInput) : undefined;
      const values: NewEntity = {
        slug,
        type,
        name,
        description: description ?? "",
        frontmatter: frontmatter ?? {},
        embedding,
        lastValidatedAt: new Date(),
      };
      const [row] = await db
        .insert(entities)
        .values(values)
        .onConflictDoUpdate({
          target: entities.slug,
          set: {
            type,
            name,
            description: description ?? "",
            frontmatter: frontmatter ?? {},
            embedding,
            lastValidatedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();
      return { content: [{ type: "text", text: `Upserted: ${row?.slug} (id=${row?.id})` }] };
    },
  );

  mcp.registerTool(
    "roushi_ingest",
    {
      title: "Roushi: ingest markdown",
      description:
        "Ingest a markdown file or directory into the brain. Upserts entities and resolves [[wikilinks]] into typed edges.",
      inputSchema: { path: z.string().min(1).describe("Absolute path to file or directory") },
    },
    async ({ path: target }) => {
      const stats = await ingestPath(target);
      const lines = [
        `Scanned: ${stats.filesScanned} files`,
        `Entities upserted: ${stats.entitiesUpserted}`,
        `Edges upserted: ${stats.edgesUpserted}`,
      ];
      if (stats.skippedFiles.length > 0) lines.push(`Skipped: ${stats.skippedFiles.length}`);
      if (stats.unresolvedLinks.length > 0) lines.push(`Unresolved links: ${stats.unresolvedLinks.length}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // ─── self-bootstrap ──────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_scan_projects",
    {
      title: "Roushi: scan a directory for projects",
      description:
        "Walk one level under <dir> finding project directories (CLAUDE.md / package.json / .git). " +
        "Returns each candidate with metadata: slug, name, whether it's already in the brain, doc/memory signals.",
      inputSchema: { dir: z.string().min(1).describe("Absolute directory to scan one level under") },
    },
    async ({ dir }) => {
      const projects = await discoverProjects(dir);
      if (projects.length === 0) {
        return { content: [{ type: "text", text: `No candidate projects under ${dir}` }] };
      }
      const lines: string[] = [`${projects.length} candidates under ${dir}:`, ""];
      for (const p of projects) {
        const marker = p.alreadyInBrain ? "✓" : "★ NEW";
        const sigs: string[] = [];
        if (p.signals.canonicalFiles.length > 0) sigs.push(`${p.signals.canonicalFiles.length} doc(s)`);
        if (p.signals.hasPackageJson) sigs.push("pkg");
        if (p.signals.autoMemoryFileCount > 0) sigs.push(`${p.signals.autoMemoryFileCount} memory`);
        const sigStr = sigs.length > 0 ? ` [${sigs.join(", ")}]` : "";
        lines.push(`${marker} ${p.name} (${p.slug})${sigStr} — ${p.path}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_add_project",
    {
      title: "Roushi: add a project to the brain",
      description:
        "Upsert a project directory as a product entity, ingest its per-project Claude memory if present, " +
        "and run LLM extraction. Use when working inside a project that isn't in Roushi yet.",
      inputSchema: {
        path: z.string().min(1).describe("Absolute path to the project directory"),
        name: z.string().optional().describe("Override the brand name"),
        slug: z.string().optional().describe("Override the slug"),
        isClientWork: z.boolean().optional().describe("Tag as KumoKodo Studio client work"),
        client: z.string().optional().describe("Immediate counterparty (requires isClientWork)"),
        endClient: z.string().optional().describe("End-customer (requires isClientWork)"),
        skipAutoMemory: z.boolean().optional(),
        skipExtraction: z.boolean().optional(),
      },
    },
    async (args) => {
      const result = await addProject({
        path: args.path,
        name: args.name,
        slug: args.slug,
        isClientWork: args.isClientWork,
        client: args.client,
        endClient: args.endClient,
        skipAutoMemory: args.skipAutoMemory,
        skipExtraction: args.skipExtraction,
      });
      const lines: string[] = [`Added: ${result.entity.slug} (${result.entity.name}) id=${result.entity.id}`];
      if (result.ingestedMemoryFiles > 0) {
        lines.push(`Ingested ${result.ingestedMemoryFiles} memory files → ${result.ingestedMemoryEntities} entities`);
      }
      if (result.extractedEntities > 0 || result.extractedEdges > 0) {
        lines.push(`Extracted ${result.extractedEntities} sub-entities, ${result.extractedEdges} edges`);
      }
      if (result.matchingPlaybooks.length > 0) {
        lines.push(``, `${result.matchingPlaybooks.length} playbook(s) match this ${result.wasNew ? "project_created" : "project_updated"} event:`);
        for (const p of result.matchingPlaybooks) {
          lines.push(`  ● ${p.name} (${p.slug})`);
          for (const a of p.actions) lines.push(`     → ${a}`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // ─── goals ───────────────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_goal_add",
    {
      title: "Roushi: create a goal",
      description: "Create a durable goal. Optionally set a target date and link to related entities by slug.",
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        targetDate: z.string().optional().describe("YYYY-MM-DD"),
        relatedEntitySlugs: z.array(z.string()).optional(),
      },
    },
    async ({ title, description, targetDate, relatedEntitySlugs }) => {
      const goal = await createGoal({
        title,
        description,
        targetDate: targetDate ? new Date(targetDate) : undefined,
        relatedEntitySlugs,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created goal ${goal.id}: ${goal.title} (status=${goal.status}${goal.targetDate ? `, target=${goal.targetDate.toISOString().slice(0, 10)}` : ""})`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "roushi_goal_list",
    {
      title: "Roushi: list goals",
      description: "List goals, optionally filtered by status.",
      inputSchema: {
        status: z.enum(GOAL_STATUSES).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ status, limit }) => {
      const rows = await listGoals({ status, limit });
      if (rows.length === 0) {
        return { content: [{ type: "text", text: status ? `No ${status} goals` : `No goals` }] };
      }
      const text = rows
        .map((g) => {
          const target = g.targetDate ? ` (target ${g.targetDate.toISOString().slice(0, 10)})` : "";
          const linked = g.relatedEntityIds.length > 0 ? ` [${g.relatedEntityIds.length} linked]` : "";
          return `${g.status} | ${g.title}${target}${linked} — id=${g.id}`;
        })
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_goal_update_status",
    {
      title: "Roushi: update goal status",
      description: "Update a goal's status (active / completed / abandoned / blocked).",
      inputSchema: { id: z.string().uuid(), status: z.enum(GOAL_STATUSES) },
    },
    async ({ id, status }) => {
      const row = await updateGoalStatus(id, status as GoalStatus);
      return { content: [{ type: "text", text: row ? `${row.title} → ${row.status}` : `Goal not found: ${id}` }] };
    },
  );

  // ─── scratchpad ──────────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_scratchpad_write",
    {
      title: "Roushi: write scratchpad entry",
      description:
        "Write a per-agent ephemeral memory entry. Use agentId/sessionId to partition. Optional ttlSeconds for auto-expiry.",
      inputSchema: {
        agentId: z.string().min(1),
        sessionId: z.string().min(1),
        key: z.string().min(1).max(256),
        value: z.unknown(),
        ttlSeconds: z.number().int().positive().optional(),
      },
    },
    async ({ agentId, sessionId, key, value, ttlSeconds }) => {
      const row = await writeScratchpad({ agentId, sessionId, key, value, ttlSeconds });
      return {
        content: [
          {
            type: "text",
            text: `Wrote ${row.agentId}/${row.sessionId}/${row.key}${row.expiresAt ? ` (expires ${row.expiresAt.toISOString()})` : ""}`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "roushi_scratchpad_read",
    {
      title: "Roushi: read scratchpad entry",
      description: "Read a scratchpad entry. Returns null-equivalent text if not found or expired.",
      inputSchema: {
        agentId: z.string().min(1),
        sessionId: z.string().min(1),
        key: z.string().min(1),
      },
    },
    async ({ agentId, sessionId, key }) => {
      const row = await readScratchpad({ agentId, sessionId, key });
      if (!row) return { content: [{ type: "text", text: `(not found or expired)` }] };
      return { content: [{ type: "text", text: JSON.stringify(row.value, null, 2) }] };
    },
  );

  mcp.registerTool(
    "roushi_scratchpad_list",
    {
      title: "Roushi: list scratchpad entries",
      description: "List scratchpad entries for an agent. Optionally filter to one session.",
      inputSchema: {
        agentId: z.string().min(1),
        sessionId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ agentId, sessionId, limit }) => {
      const rows = await listScratchpad({ agentId, sessionId, limit });
      if (rows.length === 0) return { content: [{ type: "text", text: `(no entries)` }] };
      const text = rows
        .map((r) => `${r.sessionId}/${r.key}${r.expiresAt ? ` (expires ${r.expiresAt.toISOString()})` : ""}`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  // ─── playbooks ───────────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_playbook_add",
    {
      title: "Roushi: create a playbook",
      description:
        "Create a standing rule that fires on an event. Actions are free-text instructions for the agent that handles the triggering event. Optional filter (JSON object) and appliesToSlugs to scope.",
      inputSchema: {
        slug: z.string().min(1).max(128),
        name: z.string().min(1),
        trigger: z.enum(PLAYBOOK_TRIGGERS),
        actions: z.array(z.string().min(1)).min(1),
        description: z.string().optional(),
        filter: z.record(z.string(), z.unknown()).optional(),
        appliesToSlugs: z.array(z.string()).optional(),
        active: z.boolean().optional(),
      },
    },
    async (args) => {
      const row = await createPlaybook({
        slug: args.slug,
        name: args.name,
        trigger: args.trigger as PlaybookTrigger,
        actions: args.actions,
        description: args.description,
        filter: args.filter,
        appliesToSlugs: args.appliesToSlugs,
        active: args.active,
      });
      return {
        content: [
          {
            type: "text",
            text: `Created playbook ${row.slug} — fires on ${row.trigger} (${row.active ? "active" : "draft"}). ${row.actions.length} action(s).`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "roushi_playbook_list",
    {
      title: "Roushi: list playbooks",
      description: "List playbooks. Optionally filter by trigger; pass activeOnly=false to include drafts.",
      inputSchema: {
        trigger: z.enum(PLAYBOOK_TRIGGERS).optional(),
        activeOnly: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async (args) => {
      const rows = await listPlaybooks({
        trigger: args.trigger as PlaybookTrigger | undefined,
        activeOnly: args.activeOnly ?? true,
        limit: args.limit,
      });
      if (rows.length === 0) return { content: [{ type: "text", text: "(no playbooks match)" }] };
      const text = rows
        .map((p) => {
          const status = p.active ? "●" : "○";
          const apply = p.appliesToSlugs.length > 0 ? ` [${p.appliesToSlugs.join(",")}]` : "";
          return `${status} [${p.trigger}] ${p.name} (${p.slug})${apply}\n    ${p.actions.map((a) => `→ ${a}`).join("\n    ")}`;
        })
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_playbook_get",
    {
      title: "Roushi: get a playbook",
      description: "Fetch one playbook's full content by slug.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const row = await getPlaybookBySlug(slug);
      if (!row) return { content: [{ type: "text", text: `Not found: ${slug}` }] };
      const lines = [`# ${row.name}`, `slug:    ${row.slug}`, `trigger: ${row.trigger}`, `active:  ${row.active}`];
      if (Object.keys(row.filter as object).length > 0) {
        lines.push(`filter:  ${JSON.stringify(row.filter)}`);
      }
      if (row.appliesToSlugs.length > 0) lines.push(`applies: ${row.appliesToSlugs.join(", ")}`);
      if (row.description) lines.push("", row.description);
      lines.push("", "Actions:");
      row.actions.forEach((a, i) => lines.push(`  ${i + 1}. ${a}`));
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_playbook_check_for_event",
    {
      title: "Roushi: which playbooks fire for this event?",
      description:
        "Given an event trigger + optional entity context, return the playbooks that would fire. Call this from agent code after performing an action that matches a trigger (creating a project, updating scope, etc.) so you can surface the standing rules.",
      inputSchema: {
        trigger: z.enum(PLAYBOOK_TRIGGERS),
        entitySlug: z.string().optional(),
        entityType: z.string().optional(),
        meta: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const matches = await getMatchingPlaybooks({
        trigger: args.trigger as PlaybookTrigger,
        entitySlug: args.entitySlug,
        entityType: args.entityType,
        meta: args.meta,
      });
      if (matches.length === 0) return { content: [{ type: "text", text: "(no playbooks match)" }] };
      const text = matches
        .map((p) => `● ${p.name} (${p.slug})\n    ${p.actions.map((a) => `→ ${a}`).join("\n    ")}`)
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_playbook_remove",
    {
      title: "Roushi: delete a playbook",
      description: "Permanently remove a playbook by slug.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const ok = await deletePlaybook(slug);
      return { content: [{ type: "text", text: ok ? `Removed ${slug}` : `Not found: ${slug}` }] };
    },
  );

  // ─── playbook invocations (each time a playbook fired) ─────────────
  mcp.registerTool(
    "roushi_playbook_runs",
    {
      title: "Roushi: list playbook invocations",
      description:
        "List recorded playbook invocations. Each invocation is one time a playbook matched an event. Filter by status (pending|in_progress|completed|abandoned) or playbook slug.",
      inputSchema: {
        status: z.enum(INVOCATION_STATUSES as [InvocationStatus, ...InvocationStatus[]]).optional(),
        playbookSlug: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      const rows = await listInvocations({
        status: args.status,
        playbookSlug: args.playbookSlug,
        limit: args.limit,
      });
      if (rows.length === 0) return { content: [{ type: "text", text: "(no invocations match)" }] };
      const text = rows
        .map((r) => {
          const date = r.invocation.createdAt.toISOString().slice(0, 19).replace("T", " ");
          const entity = r.entity ? ` [${r.entity.name}]` : "";
          return `${r.invocation.status} | ${r.playbook.name} (${r.playbook.slug}) trigger=${r.invocation.eventTrigger}${entity} actions=${r.completedActionCount}/${r.actions.length} pending=${r.pendingActionCount} run=${r.invocation.id} when=${date}`;
        })
        .join("\n");
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_playbook_run_get",
    {
      title: "Roushi: get a single playbook invocation with all action states",
      description: "Returns all action steps + their current status for one invocation.",
      inputSchema: { invocationId: z.string().uuid() },
    },
    async ({ invocationId }) => {
      const all = await listInvocations({});
      const r = all.find((x) => x.invocation.id === invocationId);
      if (!r) return { content: [{ type: "text", text: `Not found: ${invocationId}` }] };
      const lines = [
        `Playbook: ${r.playbook.name} (${r.playbook.slug})`,
        `Run:      ${r.invocation.id}`,
        `Status:   ${r.invocation.status}`,
        `Trigger:  ${r.invocation.eventTrigger}`,
      ];
      if (r.entity) lines.push(`Entity:   ${r.entity.name} (${r.entity.slug})`);
      lines.push("", "Actions:");
      for (const a of r.actions) {
        lines.push(`  ${a.actionIndex + 1}. [${a.status}] ${a.actionText}`);
        if (a.notes) lines.push(`     notes: ${a.notes}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_playbook_action_set_status",
    {
      title: "Roushi: update one action's status on an invocation",
      description:
        "Mark an action as completed (you did it), rejected (not applicable), or failed (attempted but didn't work). actionIndex is 0-based. Pass notes for context.",
      inputSchema: {
        invocationId: z.string().uuid(),
        actionIndex: z.number().int().min(0),
        status: z.enum(ACTION_STATUSES as [ActionStatus, ...ActionStatus[]]),
        notes: z.string().optional(),
        completedBy: z.string().optional().describe("Who/what did it (e.g. 'claude-code-session-X', default 'manual')"),
      },
    },
    async (args) => {
      const row = await updateActionStatus({
        invocationId: args.invocationId,
        actionIndex: args.actionIndex,
        status: args.status,
        notes: args.notes,
        completedBy: args.completedBy,
      });
      return {
        content: [
          {
            type: "text",
            text: row ? `Action ${args.actionIndex + 1} → ${args.status}` : `Action not found`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "roushi_playbook_abandon_run",
    {
      title: "Roushi: abandon an entire invocation",
      description: "Mark a whole invocation as abandoned (won't act on remaining actions).",
      inputSchema: { invocationId: z.string().uuid() },
    },
    async ({ invocationId }) => {
      const row = await abandonInvocation(invocationId);
      return { content: [{ type: "text", text: row ? `Abandoned` : `Not found: ${invocationId}` }] };
    },
  );

  // ─── rules ───────────────────────────────────────────────────────────
  // Rules are durable instructions written into each workspace's Claude
  // memory dir. See src/lib/rules.ts.

  mcp.registerTool(
    "roushi_rule_list",
    {
      title: "Roushi: list rules",
      description:
        "List rules in the brain. Optionally pass productSlug to filter to rules that apply to that product (which combines slug-scoped, type-scoped, and portfolio-scoped rules).",
      inputSchema: { productSlug: z.string().optional() },
    },
    async ({ productSlug }) => {
      const rows = productSlug
        ? await rulesForWorkspace(productSlug, "product")
        : await listRules();
      if (rows.length === 0) return { content: [{ type: "text", text: "(no rules match)" }] };
      const lines = rows.map((r) => {
        const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
        const scope =
          typeof fm.applies_to_slug === "string"
            ? `slug=${fm.applies_to_slug}`
            : typeof fm.applies_to_type === "string"
              ? `type=${fm.applies_to_type}`
              : fm.applies_to === "portfolio"
                ? "portfolio"
                : "(no scope)";
        return `• ${r.slug} (${scope}) — ${r.name}`;
      });
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_rule_get",
    {
      title: "Roushi: get one rule's full markdown",
      description:
        "Return the rule's name, scope, and markdown body. Use this when an agent needs to read the rule itself, not just know it exists.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const r = await getRule(slug);
      if (!r) return { content: [{ type: "text", text: `No rule with slug "${slug}"` }] };
      const fm = (r.frontmatter ?? {}) as Record<string, unknown>;
      const scope = JSON.stringify({
        slug: fm.applies_to_slug,
        type: fm.applies_to_type,
        portfolio: fm.applies_to,
      });
      const text = `# ${r.name}\nslug: ${r.slug}\nscope: ${scope}\n\n${r.description ?? "(no body)"}`;
      return { content: [{ type: "text", text }] };
    },
  );

  mcp.registerTool(
    "roushi_rule_sync_workspace",
    {
      title: "Roushi: write applicable rules into a workspace's Claude memory dir",
      description:
        "Materializes all rules that apply to the given workspace (by product slug + 'product' type + 'portfolio') as markdown files under <workspace>/.claude/projects/.../memory/. Removes orphans. Idempotent.",
      inputSchema: {
        workspacePath: z.string().min(1),
        productSlug: z.string().optional(),
      },
    },
    async ({ workspacePath, productSlug }) => {
      const result = await syncRulesToWorkspace(workspacePath, productSlug ?? null);
      const lines = [
        `workspace: ${result.workspacePath}`,
        `productSlug: ${result.productSlug ?? "(none)"}`,
        `memoryDir: ${result.memoryDir}`,
        `wrote ${result.written.length} file(s):`,
        ...result.written.map((f) => `  + ${f}`),
      ];
      if (result.removed.length > 0) {
        lines.push(`removed ${result.removed.length} orphan(s):`);
        for (const f of result.removed) lines.push(`  - ${f}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // ─── skills ──────────────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_skill_list",
    {
      title: "Roushi: list indexed Claude Code skills",
      description:
        "List every skill indexed in the brain. Each entry: slug, name, trigger description, any lint warnings (misfiled, missing frontmatter, name mismatch). Skills live on disk at ~/.claude/skills/<slug>/SKILL.md — Roushi just indexes them for cross-reference and recommendation.",
      inputSchema: {},
    },
    async () => {
      const items = await listSkills();
      if (items.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No skills indexed. Run roushi_skill_ingest to scan ~/.claude/skills/.",
            },
          ],
        };
      }
      const lines = [`${items.length} skill(s) indexed:`];
      for (const s of items) {
        const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
        const warnings = Array.isArray(fm._warnings) ? (fm._warnings as string[]).length : 0;
        const warn = warnings > 0 ? `  ⚠ ${warnings} warning(s)` : "";
        const trigger = (s.description ?? "").split("\n\n---\n\n")[0] ?? "";
        lines.push(`- ${s.slug}: ${s.name}${warn}`);
        if (trigger) lines.push(`    ${trigger.slice(0, 200)}${trigger.length > 200 ? "…" : ""}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_skill_get",
    {
      title: "Roushi: get one skill's full body + frontmatter",
      description:
        "Return the trigger description, SKILL.md body, source path on disk, and any lint warnings. Use when an agent needs to know exactly what a skill does before recommending it.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const s = await getSkill(slug);
      if (!s) return { content: [{ type: "text", text: `No skill with slug "${slug}"` }] };
      const fm = (s.frontmatter ?? {}) as Record<string, unknown>;
      const sourcePath = typeof fm._source_path === "string" ? fm._source_path : s.sourcePath ?? "(unknown)";
      const warnings = Array.isArray(fm._warnings) ? (fm._warnings as string[]) : [];
      const lines = [
        `# ${s.name}`,
        `slug: ${s.slug}`,
        `source: ${sourcePath}`,
      ];
      if (warnings.length > 0) {
        lines.push("");
        lines.push("warnings:");
        for (const w of warnings) lines.push(`  • ${w}`);
      }
      lines.push("");
      lines.push(s.description ?? "(no body)");
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_skill_ingest",
    {
      title: "Roushi: scan skills directories and upsert into the brain",
      description:
        "Walk one or more skills-root directories (default ~/.claude/skills) and upsert every <name>/SKILL.md found. Returns counts + any skipped files (misfiled top-level .md, missing name in frontmatter, etc.). Idempotent — safe to re-run.",
      inputSchema: { paths: z.array(z.string()).optional() },
    },
    async ({ paths }) => {
      const result = await ingestSkills(paths && paths.length > 0 ? paths : undefined);
      const lines = [
        `Scanned ${result.scanned} candidate(s).`,
        `Upserted ${result.upserted} skill(s).`,
      ];
      if (result.skipped.length > 0) {
        lines.push(`Skipped ${result.skipped.length}:`);
        for (const s of result.skipped) lines.push(`  - ${s.dir}: ${s.reason}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  // ─── optimize ────────────────────────────────────────────────────────
  mcp.registerTool(
    "roushi_audit_edges",
    {
      title: "Roushi: audit edge quality",
      description:
        "Scan all edges for relation/type mismatches (e.g. tech entities receiving depends_on instead of uses — a known issue with LLM extraction). Returns wrong + suspect findings with suggested fixes. Pass apply=true to auto-apply all suspect fixes.",
      inputSchema: { apply: z.boolean().optional() },
    },
    async ({ apply }) => {
      if (apply) {
        const result = await applyAllSuggestedFixes();
        return {
          content: [
            { type: "text", text: `Applied ${result.applied} fixes (${result.skipped} skipped — wrong findings need manual review).` },
          ],
        };
      }
      const findings = await auditEdges();
      if (findings.length === 0) return { content: [{ type: "text", text: "No edge-quality issues found." }] };
      const lines = [`${findings.length} edges flagged:`];
      for (const f of findings) {
        lines.push(
          `${f.severity.toUpperCase()}: [${f.from.type}] ${f.from.name} -[${f.edge.relation}]→ [${f.to.type}] ${f.to.name}`,
        );
        lines.push(`    ${f.reason}${f.suggestion ? ` → suggest: "${f.suggestion}"` : ""}`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_find_duplicates",
    {
      title: "Roushi: find near-duplicate entities",
      description:
        "Detect candidate duplicate entities using string similarity + embedding cosine distance, grouped within the same type. Returns groups with confidence scores. Use mcp__roushi__merge_entities to commit a merge.",
      inputSchema: {},
    },
    async () => {
      const groups = await findDuplicateGroups();
      if (groups.length === 0) return { content: [{ type: "text", text: "No probable duplicates found." }] };
      const lines = [`${groups.length} duplicate group(s):`];
      for (const g of groups) {
        lines.push(`[${g.canonical.type}] canonical: ${g.canonical.name} (${g.canonical.slug}) — id=${g.canonical.id}`);
        for (const c of g.candidates) {
          lines.push(`    → ${c.entity.name} (${c.entity.slug}) confidence=${c.confidence.toFixed(2)} id=${c.entity.id}`);
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_merge_entities",
    {
      title: "Roushi: merge two entities",
      description:
        "Merge duplicateId into canonicalId. Re-points all incoming + outgoing edges to canonical, drops resulting duplicate edges, and deletes the duplicate entity. Destructive — confirm before calling.",
      inputSchema: { canonicalId: z.string().uuid(), duplicateId: z.string().uuid() },
    },
    async ({ canonicalId, duplicateId }) => {
      const r = await mergeEntities(canonicalId, duplicateId);
      return {
        content: [
          {
            type: "text",
            text: `Merge complete. Outgoing re-pointed: ${r.outgoingMerged}. Incoming re-pointed: ${r.incomingMerged}. Duplicate edges dropped: ${r.duplicatesDropped}. Entity deleted: ${r.deleted}.`,
          },
        ],
      };
    },
  );

  mcp.registerTool(
    "roushi_list_stale",
    {
      title: "Roushi: list stale entities",
      description: "Find entities whose lastValidatedAt is older than the threshold (default 90 days).",
      inputSchema: { staleAfterDays: z.number().int().min(1).max(3650).optional() },
    },
    async ({ staleAfterDays }) => {
      const days = staleAfterDays ?? DEFAULT_STALE_DAYS;
      const stale = await listStaleEntities(days);
      if (stale.length === 0) {
        return { content: [{ type: "text", text: `No stale entities (validated within ${days} days).` }] };
      }
      const lines = [`${stale.length} stale entries (>${days} days):`];
      for (const s of stale) {
        lines.push(`  [${s.type}] ${s.name} (${s.slug}) — ${s.daysSinceValidation} days old`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  mcp.registerTool(
    "roushi_touch_entity",
    {
      title: "Roushi: touch an entity's lastValidatedAt",
      description: "Bump an entity's lastValidatedAt to now — call after confirming it's still accurate.",
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const row = await touchEntity(slug);
      return { content: [{ type: "text", text: row ? `Touched ${row.name} (${row.slug})` : `Not found: ${slug}` }] };
    },
  );
}

// ─── shared helpers ──────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function formatEntity(e: Entity): string {
  const lines = [
    `# ${e.name}`,
    `slug: ${e.slug}`,
    `type: ${e.type}`,
    `created: ${e.createdAt.toISOString()}`,
    `updated: ${e.updatedAt.toISOString()}`,
    "",
    e.description || "(no description)",
  ];
  if (e.sourcePath) lines.push("", `source: ${e.sourcePath}`);
  return lines.join("\n");
}
