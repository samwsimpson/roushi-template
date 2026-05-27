---
slug: my-first-product
type: product
name: My First Product
---

This is an example product entity. Replace it with your own.

Roushi ingests markdown files from the `content/` directory into a searchable knowledge graph backed by Postgres + pgvector. Each file becomes an entity in the brain.

## What to put here

Describe your product: what it does, who it's for, what stack it uses, where it's deployed. The more context you write, the better Roushi's search and synthesis answers.

## Wikilinks

Reference other entities with `[[slug]]` syntax — Roushi automatically creates typed edges in the graph:

- `[[uses:some-tech]]` — this product uses some-tech
- `[[hosted_on:vercel]]` — this product is hosted on Vercel
- `[[depends_on:some-lesson]]` — this product depends on a lesson learned

## Next steps

1. Edit this file to describe your actual product (or delete it and create your own).
2. Run `pnpm roushi ingest content/` to load it into the brain.
3. Search for it: `pnpm roushi search "my first product"`.
