---
slug: example-rule
type: rule
name: Example rule — replace with your own
applies_to: portfolio
priority: normal
---

## The rule

This is an example rule. Rules are durable instructions that Roushi syncs into your workspace's AI tool configuration files (CLAUDE.md memory dir, .github/copilot-instructions.md, .cursorrules, .windsurfrules) so your AI coding assistant follows them automatically.

## When to create a rule

- When you have a convention that applies across multiple projects ("always use Zod for validation")
- When a lesson learned should prevent future mistakes ("never use `strict: true` with drizzle-kit push in CI")
- When a process should fire on every shipment ("run the doc sweep before claiming a change is done")

## How to apply

1. Edit this file (or create a new one in `content/rules/`).
2. Run `pnpm roushi ingest content/rules/` to load it into the brain.
3. The rule will auto-sync into workspaces via the SessionStart hook (if configured) or the VS Code extension.

## Scoping

Rules can be scoped to apply broadly or narrowly:

- `applies_to: portfolio` — applies to every product
- `applies_to_type: product` — applies to all entities of type `product`
- `applies_to_slug: my-first-product` — applies only to one specific product
