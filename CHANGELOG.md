# Roushi — Changelog

All notable changes to Roushi will be tracked here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely. Versioning follows [SemVer](https://semver.org/).

---

## [0.13.0] — 2026-05-28

### feat: pattern system — portfolio-wide automation primitives

Sam asked the next obvious question after the shipment-sweep landed: *"how
easy would it be for someone else to use this... how would Vercel-style
'click button → infrastructure appears' work for things like Google
Analytics?"* The honest answer was that GA isn't a Marketplace integration
and never will be (no infrastructure to provision), but the same automation
idea — "snippet + env var + commit" — is exactly the kind of thing Roushi
should codify once and apply everywhere.

This release ships that as **patterns**: typed, detectable, applicable
transforms with auto-commit safety. Three patterns ship in v0.13.0; the
shape is meant to be reused for `aether-widget`, `kumokodo-vercel-deploy`,
and anything else in the "everyone needs this, everyone forgets" category.

**What's new:**

- **`pnpm roushi pattern list / detect [--portfolio] / apply <slug>`** —
  CLI for discovery + status + execution. `--portfolio` scans every product
  entity in the brain and prints a matrix of which patterns are applied
  where (real data from first run: only 4/19 products have the kumokodo
  footer, 1/19 has Vercel Analytics, 0/19 had GA before this release).

- **Three patterns shipped:**
  - `kumokodo-footer` — adds the SaaS or client attribution per the
    portfolio-kumokodo-footer-attribution rule. No external API.
  - `vercel-analytics` — installs `@vercel/analytics` and wires
    `<Analytics />` into the root layout. Live-tested on Roushi itself
    (commit `d3da35d`).
  - `google-analytics` — **fully automatic**. Calls the Google Analytics
    Admin API to create a GA4 property + web data stream, then installs
    `@next/third-parties`, edits the root layout, sets `NEXT_PUBLIC_GA_ID`
    on Vercel env vars, and auto-commits. Live-tested on Akiko (commit
    `3b7a261`) — created real property G-3V6GJ221JD end-to-end.

- **`/patterns` web UI** — portfolio-wide compliance matrix at
  `roushi.ai/patterns` (or local). Shows every product × every pattern with
  applied/partial/not-applied/error status. Auth-gated (proxy + page-level
  defense in depth).

- **`/api/patterns/matrix` route** — JSON version of the same data.
  Node runtime (the patterns shell out to git/grep). Auth-gated.

- **`scripts/sync-template.ts`** — first cut at solving the
  Roushi-to-roushi-template drift problem. Copies app code from private
  Roushi → public roushi-template, preserves the template's `content/`,
  `README.md`, and `CLAUDE.md`. Runs as `pnpm sync-template`. Per-product
  doc syncs will follow.

**Plumbing built this session that supports the pattern system:**

- New GCP project `roushi-prod` with the Analytics Admin API enabled
- Service account `roushi-analytics@roushi-prod.iam.gserviceaccount.com`
  with Editor on GA account 362923206
- `GOOGLE_APPLICATION_CREDENTIALS` (local) + `GOOGLE_SERVICE_ACCOUNT_JSON`
  (Vercel prod + dev) + `GOOGLE_GA_ACCOUNT_ID` env vars wired everywhere
- `cross-spawn` dependency for safe Windows `.cmd` shim execution
- `google-auth-library` dependency for GA API auth

**Architecture decisions locked in:**

- **D20: Pattern system as portfolio-wide automation primitive.** Each
  pattern is a TypeScript file in `src/patterns/<slug>.ts` exporting a
  `Pattern` with `detect()` + `apply()`. Project helper (`src/patterns/_project.ts`)
  wraps file/grep/env/git/package operations with safety semantics
  (auto-commit only on clean repos, validated inputs, `cross-spawn` for
  Windows shell-shim safety). The brain auto-indexes them so search can
  recommend patterns by intent.

**Notable bugs caught + fixed:**

- Vercel Turbopack build failed because the new files used `.js` extensions
  on relative imports — the rest of the codebase doesn't. CLAUDE.md
  was stale on this convention. Fixed and noted for the next CLAUDE.md
  sweep.
- The first GA pattern live test was run from Roushi's cwd with
  `pnpm --dir Roushi` — pnpm changed dirs but the pattern saw Roushi
  as cwd. Reverted Roushi's accidental file changes; re-ran with
  proper absolute-path invocation from Akiko's cwd. The GA property
  itself was correct on the first run; only the file edits went to the
  wrong project.
- Commander.js's `.allowUnknownOption(true)` only covers `--flag` args;
  positional excess args need `.allowExcessArguments(true)`. Fixed for
  pattern apply.

**Not done (deferred):**

- **`pattern detect --portfolio` on the deployed web UI** — currently the
  page only returns useful data when run locally (Vercel's filesystem
  can't reach the source_path entries). Fix: have the CLI push detection
  results to the brain as a `detection_run` entity, then the web UI reads
  the snapshot. v0.14.
- **Roushi's own Vercel-Analytics install** — applied in this session as
  the first end-to-end pattern test (commit `d3da35d`); shipping as part
  of this release.
- **GA property for Roushi itself.** The deployed Roushi site has no GA
  tracking yet. Easy follow-on: `cd Roushi && roushi pattern apply
  google-analytics --site-url=https://roushi.ai --property-name=Roushi`.

---

## [0.12.0] — 2026-05-27

### feat: canonical marketing-surface taxonomy + portfolio-wide shipment-sweep coverage

Sam asked the load-bearing question at the top of this session: *"why does [the doc sweep] work [in Kodori] but not in other projects?"* The honest answer was that only Kodori's CLAUDE.md said "run the sweep on every meaningful change." Every other product had the rule synced into its workspace's Claude memory dir but no CLAUDE.md instruction making it load-bearing — so the discipline sat there as passive context. This release closes that gap across every project Sam works on (KumoKodo products, client work, WordPress plugin, experimental pitch).

Then Sam pushed deeper: *"Not all projects have the same files, especially the marketing and help pages. The 5 file sweep isn't always accurate."* Kodori has 18 marketing surfaces; SiteBeacon has 2. A single hardcoded list dilutes into platitudes. The fix is a canonical taxonomy in the rule + per-project declaration in CLAUDE.md.

**Canonical surface taxonomy.**

- **[`portfolio-shipment-sweep`](https://roushi.ai/rules/portfolio-shipment-sweep)** (new) — meta rule, `applies_to_type: product`, holds the canonical vocabulary of marketing-surface categories that the discipline reaches for:
  - SaaS-style: `homepage`, `pricing`, `features`, `help`, `verticals`, `compares`, `security`, `case-studies`, `about`, `api-docs`, `changelog-public`, `blog`, `umbrella-card`, `umbrella-case-study`
  - Plugin: `wordpress-listing`, `plugin-header`, `github-readme`
  - Client work: `client-deliverable`, `client-portal`, `status-report`, `sow`
  - Fundraising: `pitch-deck`, `investor-readme`, `pitch-landing`
- The rule body explains the discipline (triage → core docs → declared surfaces → dynamic stat recheck → stale-phrase grep → one commit) but **doesn't enumerate the per-project surface list** — that lives in each project's CLAUDE.md, so the agent sees it loaded at session start.

**Per-product sweep rules trimmed (the duplicated half moved to CLAUDE.md).**

- **[`kodori-shipment-sweep`](https://roushi.ai/rules/kodori-shipment-sweep)** — kept: 5-question triage + 9 dynamic stat-count rechecks (MCP tool count / AICPA control count / sub-processor count / Office add-in count / migration connector count / pre-trained doc-type count / plan tiers / DB table count / Inngest function count) + Phase-X stale-phrase grep. Removed: the 18-surface enumeration (moved to Kodori's CLAUDE.md `## Marketing surfaces` block).
- **[`roushi-shipment-sweep`](https://roushi.ai/rules/roushi-shipment-sweep)** — same shape. Kept: 5-question triage + 7 dynamic stat-count rechecks (MCP tool count / entity-type count / edge-relation count / maintenance kinds / cron count / CLI subcommand count / indexed skill count) + "Not yet implemented" / "Planned" stale-phrase grep. Removed: explicit surface enumeration (moved to Roushi's CLAUDE.md).

**Per-project CLAUDE.md / AGENTS.md rollout (19 product repos touched).**

| Tier | Repos | Action |
|---|---|---|
| **Already-curated** | Roushi, Kodori | Added `## Marketing surfaces` block with the actual file paths migrated from the sweep rules. Updated the shipment-sweep pointer paragraph. |
| **KumoKodo products (Giga-tainted)** | AI Colosseum, Aether, Kodokyo, LisAI, SiteBeacon, kumokodo-website, Alpha Sentinel | Replaced Giga AI auto-generated boilerplate (importance scores, `$END$` sentinels, "Context improved by Giga AI" footers) with clean stub + shipment-sweep pointer + `## Marketing surfaces` declaration. |
| **KumoKodo products (delegators)** | Kuroji, Kasuri | Appended pointer + surfaces below the nextjs-agent-rules placeholder in AGENTS.md. CLAUDE.md remains `@AGENTS.md`. |
| **KumoKodo product (newly bootstrapped)** | Akiko | Created CLAUDE.md + AGENTS.md from scratch (the workspace had a working Next.js app — `SCOPE.md`, `STACK.md`, `app/`, `components/` — but no agent-doc files). |
| **Client work (no agent docs)** | CopTracking, triquest, uniformbuilder | Created CLAUDE.md + AGENTS.md with client-work surface categories (`client-deliverable`, `client-portal`, `status-report`, `sow`) and explicit "this is KumoKodo Studio developer notes, not a client deliverable" framing. |
| **Client work (delegator)** | zoningai | CLAUDE.md left as `@AGENTS.md`; pointer + surfaces appended to AGENTS.md below the nextjs-agent-rules placeholder. |
| **Client work (Giga-tainted)** | sport-trac, txpreal | Giga junk replaced. TXPReal's `TXPReal - Project Scope & Cost Analysis.md` declared as the `sow` surface (only client-work project with a real declared path so far). |
| **WordPress plugin** | Elementor Hubspot Form | CLAUDE.md + AGENTS.md created with `wordpress-listing` / `plugin-header` / `github-readme` surface categories. |

Most non-Kodori / non-Roushi `## Marketing surfaces` blocks use `TODO: confirm path` markers for paths I don't know — those get filled in as Sam visits each workspace.

**What changed in this repo.**

- **`content/rules/portfolio-shipment-sweep.md`** (new) — the meta rule with the canonical taxonomy. Re-ingested twice during the session as the framing tightened (initial scope `applies_to: portfolio`, then broadened to `applies_to_type: product` so it covers non-KumoKodo client work).
- **`content/rules/kodori-shipment-sweep.md`** — trimmed per above; re-ingested.
- **`content/rules/roushi-shipment-sweep.md`** — trimmed per above; re-ingested.
- **`CLAUDE.md`** — added `## Shipment-sweep discipline` section and `## Marketing surfaces` declaration block.
- **`PROJECT_SCOPE.md`** — bumped version + last-updated; added canonical-taxonomy note to the RULES layer in the architecture diagram; moved "Per-product shipment-sweep rules for the other ~10 products" from the v0.11.x pending list to shipped under "Autonomous loop" (with a v0.13.x line about filling in the TODO paths).
- **`TECH_STACK.md`** — bumped version + last-updated; added **D19** documenting the canonical-taxonomy + per-project-declaration pattern (D18 partially superseded — triage + stats stay per-product, surfaces move to CLAUDE.md).
- **`README.md`** — bumped status + decision-log range (D1-D18 → D1-D19).
- **`src/app/help/page.tsx`** — extended the `rule` entity-type description to mention the canonical taxonomy + per-project declaration; bumped the "35 tools as of v0.X.X" reference.

**Not done (deferred).**

- The `TODO: confirm path` markers in the 17 stub `## Marketing surfaces` blocks. Will fill in as Sam visits each workspace.
- Per-product sweep rules for products beyond Kodori and Roushi. Each product's rule is its own ship — promote when surface area stabilizes.
- A `## Marketing surfaces` audit cron job that diffs declared paths against actual files. Future enhancement.
- The `.cursor/rules/*.mdc` files scattered across product repos (4-7 per repo) — also likely Giga residue. Flagged but not touched without Sam's say-so on whether they're stale.

---

## [0.11.6] — 2026-05-26

### feat: back-to-top button + KumoKodo footer attribution (portfolio rule)

Two changes — one local, one portfolio-wide.

**Back-to-top button.**

- **`src/app/components/BackToTop.tsx`** (new) — client component. Listens to scroll; appears once the user has scrolled past one viewport height; fades + slides in. Click triggers `window.scrollTo({ top: 0, behavior: "smooth" })`. Styled as a tiny vermilion seal stamp (`↑ Top`) to match the marketing site's scholar's-seal language — same `rotate(-2deg)` settling on hover the primary CTA uses.
- Mounted in `src/app/layout.tsx` so it's available on every page, marketing AND app. Doesn't surface on short pages because the visibility threshold is one viewport height.
- `tabIndex` is `-1` when hidden so the button can't be tabbed to until it's visible (a11y nicety).

**KumoKodo footer attribution.**

Sam: *"every site or app we build we need a 'Built by KumoKodo.ai' [or] 'A KumoKodo.ai SaaS application' with the domain linking back."* Made it a portfolio rule so it's not just Roushi.

- **`src/app/layout.tsx`** — footer now carries a second row under the primary links: *"A [KumoKodo.ai](https://kumokodo.ai) SaaS application."* Subtle (`text-[11px] text-zinc-700`, link in `text-zinc-500`), opens in a new tab, centered on mobile and left-aligned on desktop.
- **`content/rules/portfolio-kumokodo-footer-attribution.md`** (new, ingested) — `applies_to: portfolio`. Specifies two variants:
  - SaaS products → `A KumoKodo.ai SaaS application.`
  - Client work → `Built by KumoKodo.ai`
- Includes the implementation template (Next.js + Tailwind) so the next agent that opens any KumoKodo workspace sees the pattern and adds the line by default. The rule auto-syncs into every KumoKodo workspace's Claude memory dir via the existing SessionStart hook.

---

## [0.11.5] — 2026-05-26

### content: marketing voice — "we" not "I", no more "one operator," dropped homepage section numbers

Three Sam-direction edits to make the marketing pages read like KumoKodo (a brand) rather than one person:

- **Homepage section numbers removed.** The `Chapter` component no longer renders the `01.`–`10.` left-gutter labels. Eyebrow text alone separates sections; less visual clutter and stops the homepage from reading as "10 things to scroll through."

- **First-person → first-person plural.** All marketing-page body copy now uses "we." The single exception is `/about`'s italic blockquote (the Sam quote), which intentionally retains "I" as the operator's personal note. Specifically:
  - `/about` paragraphs 1 + 2 — "I'd re-litigate" → "we'd re-litigate"; "I tried Notion/Obsidian/GBrain" → "We tried…"
  - Homepage section 09 ("From the operators" — was "From the operator") — full rewrite to "We built Roushi for the KumoKodo portfolio first…"
  - `/about` `metadata.description` — "Why I built Roushi" → "Why a brain"

- **"One operator" rephrased.** This phrasing made KumoKodo read as a one-person company rather than a portfolio with a brand voice. Updated:
  - `/about` — "KumoKodo is twenty-plus products with one operator" → "KumoKodo runs twenty-plus products under one roof"
  - Homepage section 09 — "twenty-plus products with one operator" → "twenty-plus products under one roof"
  - Homepage use case #1 — "Five or more products and one operator" → "Five or more products in your portfolio"
  - "back of my head" → "tribal knowledge" (sounded singularly personal)

The Sam quote on `/about` (italic, left-bordered) is preserved verbatim — that's the only "I" surface on the entire marketing site now.

---

## [0.11.4] — 2026-05-26

### fix: wrap TopNav in Suspense so static prerender succeeds

v0.11.2 added `useSearchParams()` to `TopNav` (to detect `?view=marketing`). Next.js requires a `<Suspense>` boundary above any component that calls `useSearchParams()` or it refuses to statically prerender routes whose tree includes it. The v0.11.2 and v0.11.3 deploys failed with:

> useSearchParams() should be wrapped in a suspense boundary at page "/404"
> Error occurred prerendering page "/_not-found"

**Fix:**

- **`src/app/components/TopNav.tsx`** — split `TopNav` into a `Suspense`-wrapping outer shell + a `TopNavInner` that holds the `usePathname`/`useSearchParams` calls. The Suspense `fallback` is a minimal header with just the brand (no path-aware nav, no session controls) so there's no layout shift on hydrate.

Verified locally with `pnpm build`: `/_not-found` and the other 35 routes all build cleanly as dynamic (ƒ) routes, no prerender errors.

---

## [0.11.3] — 2026-05-26

### fix: marketing-site readability pass + canonical Tailwind color classes

Sam reviewed the live v0.11.0/.1/.2 site and reported "the small grey text is hard to read." Doing a systematic readability pass across the marketing surface plus fixing the arbitrary-value vermilion classes the linter flagged.

**Readability changes (every marketing page):**

| Element | Before | After |
|---|---|---|
| Hero subtitle | `text-base sm:text-lg · text-zinc-400` | `text-lg sm:text-xl · text-zinc-300` |
| Chapter eyebrow (mono uppercase) | `text-[11px] · text-zinc-500` | `text-xs · text-zinc-400` |
| Chapter number in gutter | `text-[11px] · text-zinc-700` | `text-xs · text-zinc-500` |
| Chapter body paragraphs | `text-base · text-zinc-400` | `text-lg · text-zinc-200` |
| Code blocks (mono) | `text-[12px] · text-zinc-300` | `text-sm · text-zinc-200` |
| Inline `<code>` | `text-[0.92em]` | `text-[0.95em]` |
| Tablet/Pillar/UseCase headings | `text-lg/xl · text-zinc-100` | `text-xl/2xl · text-zinc-50` |
| Tablet/Pillar/UseCase body | `text-sm · text-zinc-400` | `text-base · text-zinc-300` |
| Section number columns | 2.25rem / 2.5rem wide | 2.5rem / 3rem wide |
| Hero "private beta · …" caption | `text-[10px] · text-zinc-600` | `text-xs · text-zinc-500` |
| /pricing tier features | `text-sm · text-zinc-400` | `text-base · text-zinc-300` |

Net effect: paragraph body text is now `text-lg` (18px) on `text-zinc-300`/`zinc-200` (high contrast on the zinc-950 background) instead of `text-base` (16px) on `text-zinc-400`. Captions and gutter numbers got a font-size bump and a one-shade-lighter color bump. The hero subtitle reads at 20px on desktop instead of 18px.

**Files touched:**

- `src/app/components/MarketingHomepage.tsx`
- `src/app/components/BetaRequestForm.tsx`
- `src/app/features/page.tsx`
- `src/app/how-it-works/page.tsx`
- `src/app/use-cases/page.tsx`
- `src/app/pricing/page.tsx`
- `src/app/about/page.tsx`
- `src/app/blog/page.tsx`

**Tailwind canonical classes (linter hint):**

Tailwind 4 auto-generates utility classes from `@theme` color tokens. Since `globals.css` declares `--color-vermilion: #c1442d` (plus `-700` and `-100` variants), the canonical classes are `bg-vermilion`, `text-vermilion`, `border-vermilion`, `bg-vermilion/40` (with opacity), etc. — no need for the `[var(--color-vermilion)]` arbitrary-value syntax. Swept all instances across `SealStamp`, `BetaRequestForm`, and `pricing` to use the canonical shorthand.

---

## [0.11.2] — 2026-05-26

### fix: signed-in users can view the marketing homepage

v0.11.1 added the path-aware nav, but signed-in users still couldn't reach the marketing homepage. The brand link in any marketing-page nav pointed at `/`, which the page-router resolved to the Ask interface (because `/ + session` renders Ask). They were stuck.

**Fix:** `?view=marketing` query escape hatch.

- **`src/app/page.tsx`** — `searchParams.view === "marketing"` forces the `MarketingHomepage` render even when a session is present.
- **`src/app/components/TopNav.tsx`** — reads `useSearchParams()`; if `view=marketing` is set, `MarketingNav` renders even on `/` for signed-in users. The MarketingNav brand link (老師 Roushi) builds with `/?view=marketing` for signed-in users so the homepage stays in marketing mode. The `← Public site` bridge in the AppNav now points to `/?view=marketing` (landing on the marketing homepage instead of `/features`).

**End state:**

- Signed-out visitor on `/` → marketing homepage + MarketingNav
- Signed-in operator on `/` → Ask interface + AppNav (default behavior preserved)
- Signed-in operator clicks `← Public site` → `/?view=marketing` → marketing homepage + MarketingNav
- Signed-in operator clicks brand from anywhere in marketing → stays in marketing
- Signed-in operator clicks `Open Roushi →` from marketing → `/` → Ask (back to product)

---

## [0.11.1] — 2026-05-26

### fix: path-aware top nav (marketing vs app) + signed-in users can browse marketing

v0.11.0 shipped the marketing site but kept the same top nav everywhere — visitors hitting `/features` saw "Browse / Graph / Goals / Rules / Skills / Optimize" links, which is wrong for a public visitor (those routes 401 for them anyway). Signed-in users also had no way to reach the marketing pages.

**Fix:** `src/app/components/TopNav.tsx` is a client component that reads `usePathname()` and picks one of two variants:

- **MarketingNav** (on `/`, `/features`, `/how-it-works`, `/use-cases`, `/pricing`, `/about`, `/blog`, `/blog/*`):
  - Brand → `Features · How it works · Use cases · Pricing · About · Blog`
  - For signed-out visitors: `Sign in` link + vermilion **Request beta** seal stamp
  - For signed-in operators: `Open Roushi →` link (jumps back to the Ask homepage)

- **AppNav** (everywhere else — entities/goals/rules/skills/optimize/graph/etc.):
  - Existing nav preserved (Browse · Graph · Goals · Rules · Skills · Optimize · + Add project · user · sign out)
  - **New** `← Public site` link before the user info, so signed-in operators can jump back into the marketing context.

**Exception:** signed-in users on `/` see the Ask interface (the product), not the marketing homepage. The nav matches what's rendered — they get the AppNav, not the MarketingNav.

**Refactor:** `src/app/layout.tsx` no longer renders the nav inline. It builds a serializable `session` payload (just `name` + `email`, no functions or class instances per the client-component checklist) and hands it to `<TopNav>`. The `signOutAction` import moved into `TopNav` where the form lives.

---

## [0.11.0] — 2026-05-26

### feat: Roushi marketing site — Tier 3 (homepage + 6 chapter pages)

Up to v0.10, `roushi.ai/` was the Ask interface gated behind GitHub OAuth — a public visitor saw the sign-in page. This ships the full marketing surface designed via the `frontend-design` skill we audited earlier today.

**Tone direction** (per the skill's Step 2 context-mapping for developer-tool / infrastructure): minimal/technical/terminal-inspired with a single distinctive accent — vermilion seal stamps as a "scholar's seal" reference to the 老師 (rōshi) master/apprentice brand. The audit confirmed this routing earlier; this ship is the first real-use validation of the patched skill in the context it was rebuilt for.

**Architecture — conditional homepage:**

- The proxy now lets `/`, `/features`, `/how-it-works`, `/use-cases`, `/pricing`, `/about`, `/blog`, and `/blog/*` through unauthenticated.
- `src/app/page.tsx` is conditional: signed-in operators see the existing Ask interface; signed-out visitors see the new `MarketingHomepage` component.
- The remaining product surfaces (`/entities`, `/goals`, `/rules`, `/skills`, `/optimize`, `/graph`, `/projects/new`, etc.) stay auth-gated.

**Files added:**

- **`src/app/globals.css`** — added `--font-display`, `--font-sans`, `--font-mono` CSS variables tied to next/font imports; new color tokens `--color-vermilion` + `--color-vermilion-700/100` + `--color-ink` + `--color-paper`; `brush-draw`, `char-rise` keyframes for the one-motion-moment-per-page rule; `.seal-underline` and `.master-watermark` utility classes.
- **`src/app/layout.tsx`** — wired Fraunces (display, with `opsz`/`SOFT` axes), Geist (body), JetBrains Mono via `next/font/google`. Self-hosted by Next; no third-party request on first paint. Added richer Open Graph + Twitter Card metadata in the root metadata export.
- **`src/proxy.ts`** — new `PUBLIC_MARKETING_PATHS` set + `isPublicPath()` helper; marketing routes bypass the session-redirect.
- **`src/app/components/MasterMark.tsx`** — the 老師 mark in three variants (`hero` with character-rise reveal, `watermark` for the fixed-position seal in the viewport corner, `inline` for body copy).
- **`src/app/components/SealStamp.tsx`** — vermilion seal-stamp component for CTAs and decorative signatures. Slight rotation (`-2°` default) settles to `0°` on hover and the background fills in vermilion.
- **`src/app/components/BetaRequestForm.tsx`** — client component using `useActionState`. Name + email + optional message. Mono labels in the gutter as chapter numbers (`01. Name` style). Seal-stamp submit button.
- **`src/app/actions/beta.ts`** — Server Action: Zod-validated input, logs to stderr (visible in Vercel logs), returns `{ok, message}`. No DB write yet — swap the storage in this one function when volume justifies it.
- **`src/app/components/MarketingHomepage.tsx`** — the 10 sections: hero, seven-second pitch, three tablets (Ask/Track/Trace), live demonstration, twelve feature pillars, six-layer architecture preview, three use cases, built-on, operator note, beta request form.

**Six new pages (each ~50-200 lines, all server-rendered):**

- `/features` — twelve feature pillars expanded into long-form paragraphs
- `/how-it-works` — six architectural layers in detail
- `/use-cases` — three operator personas
- `/pricing` — placeholder plan tiers + "private beta" seal stamp
- `/about` — operator's note on why a brain
- `/blog` — placeholder "coming soon"

**Design discipline enforced (per the audit-confirmed skill guidance):**

- No purple gradients, glassmorphism, "AI dot" backgrounds, or hero-with-glowing-button
- No Inter / Space Grotesk
- No editorial/magazine layout (anti-default for developer audiences)
- One motion moment per page (the character-rise hero reveal)
- Vermilion used ONCE per section max, as a semantic stamp
- Vertical scrolls with thin rules between chapters, mono chapter numbers in the gutter

**Not done (deferred to v0.11.x / v0.12 / v0.12+):**

- **kumokodo.ai sync** — per the `portfolio-marketing-site-sync` rule, the umbrella site's Roushi product card + case study need to be updated to match the new marketing voice. The case study draft was written in v0.10.0; the card has not been updated.
- **`/blog` first post** — placeholder until there's actual content.
- **Real beta-request storage** — currently logs to stderr. When the request volume justifies it, add a `beta_requests` table and a Resend email to Sam.
- **Visual ornaments** — the SVG brush-stroke version of the 老師 mark (currently text-based with a CSS character-rise animation). Real SVG path data would be a polish pass; today's text rendering is honest.
- **Per-page Open Graph imagery** — each chapter page could get a custom `og:image`. Today they inherit the root.

---

## [0.10.7] — 2026-05-26

### feat: per-token rate limiting on `/api/mcp`

Bearer-token auth prevents enumeration but doesn't stop a single token from issuing thousands of requests. The deployed MCP route now applies a rolling-window per-token counter and returns 429 when exceeded.

**Limits:**

- **120 requests / minute / token** (≈2 requests/second)
- Returns 429 with `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` headers
- Body: `{ error: "Rate limit exceeded", retryAfterSec, limit: "120 requests per minute per token" }`

**Implementation:**

- **`src/app/api/mcp/route.ts`** — module-scoped `Map<hashedToken, { count, windowStartMs }>`. Auth happens first; rate-limit second; body parse third (so unauthenticated traffic never costs us a counter slot, and rate-limited requests never parse a body). Token is SHA-256-hashed before being used as a Map key so the long-lived counter never holds plaintext.

**Caveat — Fluid Compute multi-instance:** each warm Vercel Function instance keeps its own in-memory counter. If Vercel spawns N instances in a region, the effective limit per token is `120 × N`. For single-tenant (Sam's brain, one token) this is rarely > 1 instance and the limit is effectively 120. Multi-tenant rollout will need Vercel Runtime Cache or Edge Config for shared state.

**Not done (deferred):**

- **Per-tool rate limit** (e.g. `roushi_think` is more expensive than `roushi_search`). Different limits per tool name would prevent a single expensive-tool flood from consuming budget that should have served cheaper calls. Add when usage data shows it matters.

---

## [0.10.6] — 2026-05-26

### feat: graph explorer — path highlighting + per-relation filtering

The `/graph` page got two interaction upgrades that make the typed graph genuinely useful for portfolio exploration instead of just looking pretty.

**Path highlighting (click → click → shortest path):**

- New "Find path" toggle in the legend bar. When ON, regular node clicks set the source then the target instead of navigating to entity pages.
- Once both endpoints are picked, Dijkstra (constant weight = 1, undirected) computes the shortest path between them. The path's nodes get a thicker white border; the path's edges get a thicker white stroke. Everything off-path dims to 15% opacity. Disconnected pair → everything dims (signaling "no path exists").
- Source/target labels show inline ("source: Kodori · click target" → "Kodori → Drizzle ORM"). A "Clear" button resets selection without leaving path mode. Toggling path mode OFF restores normal click-to-navigate behavior.

**Per-relation filtering:**

- New row of toggleable relation chips below the entity-type filters. Click `uses` to hide every `uses` edge; click again to show. Hidden-relation edges dim along with any nodes that become isolated as a result (consistent with how type filters already work).
- Useful for isolating a specific layer of the graph — toggle off `mentions` (soft references) to see only the structural edges, or toggle off everything except `defined_by` to see which products instantiate which patterns.

**Files:**

- **`src/app/components/GraphCanvas.tsx`** — added `allRelations` computed from the edge list, `hiddenRelations`/`pathMode`/`pathSource`/`pathTarget` state, `path-endpoint` / `in-path` cytoscape style classes, and the new UI row for relation chips + path-finding controls. Dijkstra via `cy.elements().dijkstra(...)`.

**Not done (deferred):**

- **Saved layouts.** Currently the cose layout re-runs on every page load with non-deterministic positioning. Saving the layout (per-user, localStorage) so the same nodes land in the same places would help mental map continuity. Add when the layout-shuffle becomes annoying.
- **Multi-hop path** (e.g. "path through X"). Current path-finding is just source→target; an intermediate-node constraint would be a few more lines but needs UI design.

---

## [0.10.5] — 2026-05-26

### feat: project-scoped skill auto-push via `applies_to_slug`

Skills now share the rules-system scope vocabulary. A skill's frontmatter can declare `applies_to_slug: kodori`, `applies_to_type: product`, or `applies_to: portfolio` — and `pnpm roushi skill sync-workspace <path>` will push every matching skill into that workspace's `.claude/skills/`. User-installed skills (no Roushi marker file) are never touched, and Roushi-managed skills that no longer apply get cleaned up automatically.

**Files:**

- **`src/lib/skills.ts`** — `SkillFrontmatter` gained the three scope fields. Two new functions:
  - `skillsForWorkspace(productSlug, productType?)` — returns the skills that should propagate. Reads content from `content/skills/<slug>/SKILL.md` (the git-tracked repo mirror, source of truth) with fallback to the original disk source path.
  - `syncSkillsToWorkspace(workspacePath, productSlug)` — writes each applicable skill to `<workspace>/.claude/skills/<slug>/SKILL.md` along with a `.roushi-skill` marker file (so we can later distinguish managed dirs from user-installed ones). Then removes any dir that has our marker but no longer applies. User-installed skills (no marker) are left alone.

- **CLI** — new `pnpm roushi skill sync-workspace <workspacePath> [--product <slug>]`. Mirrors the rules-sync UX. Auto-detects the product slug from the workspace path if omitted.

**State of the world after this ship:**

- Plumbing is in place; **feature is dormant** until you (or someone) sets `applies_to_slug` on a skill. None of the 4 existing user skills currently scope — they all stay user-global at `~/.claude/skills/`.
- To activate: edit a skill's frontmatter to add `applies_to_slug: kodori` (or similar), `pnpm roushi skill pull` to mirror to repo, `pnpm roushi skill ingest` to update the brain's index, then `pnpm roushi skill sync-workspace <kodori-workspace>` to push.

**Not done (deferred):**

- **SessionStart-hook integration.** Currently you have to run `sync-workspace` manually. Wiring it into the SessionStart hook would auto-push on every session start in each workspace, like rules already do — at the cost of ~100ms extra hook latency per session. Worth wiring once at least one scoped skill exists; not worth it before.

---

## [0.10.4] — 2026-05-26

### feat: `pnpm roushi skill sync --show-diff` prints unified diff on conflicts

When skill sync detects a conflict (disk + repo both have content, contents differ), the operator needs to pick a winner. Previously the only signal was "they differ" — no way to see what differed without manual file comparison. The `--show-diff` flag prints a clean unified diff inline.

**Files:**

- **`src/lib/skills.ts`** — added `unifiedDiff(disk, repo)` helper that shells out to `git diff --no-index` (already-installed dependency for this workflow). Output is post-processed to strip the noisy `diff --git`/`index`/`---`/`+++` header lines that contain absolute temp paths, then re-prefixed with clean `--- a (disk)` / `+++ b (repo)` labels. Falls back to a "raw contents" rendering if git isn't on PATH.
- **`SkillSyncResult.conflicts`** — entries now optionally include a `diff` field. New `SyncOptions.computeDiff` flag controls whether to compute. `null` if not requested or not available.
- **CLI** — `pnpm roushi skill sync --show-diff` sets `computeDiff: true` and renders the diff per conflict with color (green added, red removed, cyan hunk headers).

**Smoke-tested:** modified a skill in the repo, ran sync, saw the diff with the `+MODIFIED LINE FOR TEST` change clearly highlighted. Exit code 1 preserved on conflicts.

---

## [0.10.3] — 2026-05-26

### perf: Roushi-as-advisor file cache (30s TTL) — 51% faster on repeat edits

The PreToolUse advisor hook spawns a fresh tsx process per Edit/Write. An in-memory cache can't survive that, but a tiny JSON file in the OS temp dir can — and the savings turned out to be much bigger than estimated.

**Measured impact** (Windows + Neon, oxyaccounting-favor-project's `app/page.tsx`):

| Run | Wall-clock | What's happening |
|---|---|---|
| Cold (fresh process, no cache file) | **3.46s** | tsx startup + Neon connect + 3 SQL queries |
| Warm (cache hit, within 30s of last edit) | **1.68s** | tsx startup + read cache file. No DB. |
| **Savings on cache hit** | **−1.78s (−51%)** | |

The DB-connection portion was the dominant cost — much heavier than I first estimated. The cache eliminates it entirely for repeat edits.

**Files:**

- **`src/lib/context-for-file.ts`** — added `readCache` / `writeCache` helpers + cache lookup at the top of `contextForFile`. Cache key is SHA-256 of the file path; value is the full `FileContext` plus `expiresAt`. TTL: 30 seconds. Cache lives at `os.tmpdir()/roushi-advisor-cache/<hash>.json`.

**Gotcha caught during smoke test:** the first attempt used `void writeCache(...)` (fire-and-forget) which got killed by the script wrapper's `process.exit(0)` before the file landed on disk. Fixed by awaiting the write — adds ~5-10ms to the cold path but guarantees the cache survives. The cold→warm differential (3.46s → 1.68s) is the proof the fix worked.

**Stale-data window:** if a new lesson/decision lands in the brain, the cache stays stale for up to 30s. Acceptable trade-off given the magnitude of the speedup; tighter TTL would erode the win.

**What this means in real use:** repeatedly editing the same file (the common case during interactive iteration) now feels nearly instant for the advisor. Different file each time = no cache hit, full 3.5s. The hook is still slowest at session start, fastest when you're iterating.

---

## [0.10.2] — 2026-05-26

### feat: skills sync — git-track and share Claude Code skills

Claude Code skills live at `~/.claude/skills/<name>/SKILL.md` so the harness can invoke them natively. That location isn't git-tracked, which means:

- Edits to a skill (like yesterday's `frontend-design` tightening) are lost on a machine wipe or a `~/.claude/` reset.
- There's no way to share a skill with a teammate (Roy, anyone else on Sam's team) without manually copying files.
- No history of skill changes over time.

This ships a disk ↔ repo mirror so skills become first-class git-tracked artifacts on top of the existing `~/.claude/skills/` mechanism.

**Files:**

- **`src/lib/skills.ts`** — three new functions, all using SHA-256 content hashing for idempotency:
  - `pullSkillsFromDisk({diskRoot, repoSkillsDir})` — one-way copy disk → repo. Overwrites repo content. Use after editing a skill locally.
  - `pushSkillsToDisk({diskRoot, repoSkillsDir})` — one-way copy repo → disk. Overwrites disk content. Use to install repo-versioned skills onto a fresh machine or into a teammate's workspace.
  - `syncSkillsWithDisk(...)` — two-way. One-sided files copy automatically; two-sided divergence is flagged as a conflict (NOT auto-merged). The operator picks the winner via `pull` (take disk) or `push` (take repo).
  - `resolveSkillsTarget(input?)` — helper. Accepts an absolute path to `.claude/skills`, a workspace path (auto-appends `.claude/skills`), or `undefined` (defaults to `~/.claude/skills/`).

- **CLI** (3 new subcommands):
  - `pnpm roushi skill pull [-d <disk>] [-r <repo>]` — disk → repo
  - `pnpm roushi skill push [target] [-r <repo>]` — repo → disk. Target defaults to `~/.claude/skills/`. Pass a workspace path to install into `<workspace>/.claude/skills/` (per-project skill install).
  - `pnpm roushi skill sync [-d <disk>] [-r <repo>]` — two-way with conflict detection. Exits non-zero if conflicts remain so CI can fail loud.

- **`content/skills/`** — new directory in the repo. Mirror of `~/.claude/skills/`. Git-tracked. Source of truth for sharing; disk stays the source of authority for what Claude Code loads. Initial pull populated this with all 4 current user skills (`aether-integration`, `frontend-design`, `logo-exploration`, `seo-optimizer`).

**Team workflow this enables:**

```bash
# First-time setup on a new machine or for a teammate:
git clone github.com/samwsimpson/Roushi
cd Roushi && pnpm install
pnpm roushi skill push           # all repo skills land in ~/.claude/skills/

# Day-to-day after editing a skill locally:
# (edit ~/.claude/skills/frontend-design/SKILL.md or run /skill-creator)
pnpm roushi skill pull           # mirror change into repo
git add content/skills && git commit && git push

# Day-to-day pulling teammate updates:
git pull
pnpm roushi skill push           # apply repo changes to your local ~/.claude/skills/
```

**Decoupling from brain ingestion:** the `skill` entities in the brain are still populated by `pnpm roushi skill ingest` reading disk (unchanged). The repo mirror is separate — it serves backup + team sync, not brain indexing. Two separate workflows that compose cleanly: edit on disk → ingest into brain → pull into repo → commit.

**Not done (deferred):**

- **Per-project skill push convenience.** `pnpm roushi skill push <workspace>` works today (resolveSkillsTarget appends `.claude/skills/`), but there's no auto-discovery of which projects in the portfolio should get which skills. A future ship could let you tag a skill with `applies_to_slug` (like rules do) and the SessionStart hook would auto-push project-scoped skills into each workspace.
- **Diff-aware conflict resolution.** Today's `sync` flags conflicts but doesn't show what differs. A future `--show-diff` flag could surface the line-by-line diff so resolution is faster.
- **A web UI Pull button** on `/skills` for one-click round-trips.

---

## [0.10.1] — 2026-05-26

### fix: PreToolUse Roushi-as-advisor now recommends matching skills

Sam reported that on a website-rebuild project the day prior (favor work outside the portfolio — not saved to Roushi), the `frontend-design` and `seo-optimizer` skills never fired despite the prompt clearly matching ("recreate the website using next.js, typescript and tailwind"). Two contributing failures, both addressed:

**1. `frontend-design` description didn't trigger on "recreate" / "port" / "rebuild" language.**

The description (post-yesterday's tightening) leaned hard into "create distinctive, design-led pages" with a "Do NOT use for modifications to existing layouts" gate. The model read Sam's "faithfully recreate the website" as a modification/port, not new design, and skipped. Updated to explicitly include "build, rebuild, recreate, or port", plus example phrasings ("build a website", "create a landing page", "recreate / rebuild / port a marketing site", "redesign a homepage", "make a brand site"). Re-ingested via `roushi skill ingest` so the brain's embedding picks up the new trigger surface.

**2. The Roushi-as-advisor PreToolUse hook didn't backstop the missed skill.**

The advisor surfaces relevant lessons / decisions / patterns / rules when you edit a file — but it never queried for `skill` entities. So when Claude started editing `app/page.tsx` for the favor project, there was no system reminder saying *"hey, you'd want `/frontend-design` and `/seo-optimizer` for this."*

**Changes:**

- **`src/lib/context-for-file.ts`** — added `findRelevantSkills()` running in parallel with `findRelevantEntities()` (separate query because skills render as `consider invoking /<slug>` rather than "here's prior knowledge"). `FileContext` gained a `skills: RecommendedSkill[]` field; `renderFileContext` emits a "🛠️ Recommended skills for this file" section above the brain context.
- **Five new file-path classifications** for the surfaces that should trigger frontend-design / seo-optimizer:
  - `app/sitemap.ts` / `robots.ts` / `manifest.ts` → SEO surface
  - `app/(marketing)/**/*.tsx` → Marketing page (route group convention)
  - `app/(landing|marketing|home)/**/*.tsx` → Marketing/landing page (other naming conventions)
  - `app/page.tsx` → App router root page (likely a homepage / landing)
  - `app/layout.tsx` → Root layout (font, metadata defaults, top nav)
- **Skill description (`~/.claude/skills/frontend-design/SKILL.md`)** — tightened to cover the rebuild/port/recreate use case explicitly. Lives in `~/.claude/skills/`, not in the Roushi repo, so it's not in the diff — but the new trigger surface is in the brain via `roushi skill ingest`.

**Verified end-to-end:** smoke-test against `c:/.../some-favor-project/src/app/page.tsx` returns `/frontend-design` and `/seo-optimizer` as the top two recommended skills (plus one false-positive ranked third — `aether-integration` matched on "new app"). Both correct hits for what should have fired yesterday.

**Not done (deferred):**

- **False-positive ranking on the advisor.** The ILIKE keyword match is cheap but loose; `aether-integration` ranking third on a marketing-page hit is harmless but noisy. Fix would be either embedding-based ranking (adds latency) or weighted scoring by keyword specificity. Add if noise becomes annoying.
- **Skill-description audit pass.** Other skills (`logo-exploration`, `aether-integration`) may have similar "create" vs "rebuild" gaps. Run `/skill-creator` against all four when convenient.

---

## [0.10.0] — 2026-05-25

### feat: MCP over HTTP deployed at `/api/mcp` — Roushi is now remote-accessible

The standalone HTTP MCP server (`pnpm mcp:http`) has existed since v0.3.x but only ran locally. This ships the deployed equivalent as a Next.js Route Handler so external clients — Roy's machine, browser-based agents, GitHub Actions, or any future SaaS surface — can query the brain over HTTPS once Roushi is deployed.

**Files:**

- **`src/app/api/mcp/route.ts`** — Next.js Route Handler. Implements stateless JSON-RPC over POST: each request is a complete MCP message, response is the matching reply (or 204 for notifications). Uses a custom `CapturingTransport` that drives the same `McpServer` instance via in-memory message passing — no Node `IncomingMessage`/`ServerResponse` adapter needed.
- The McpServer is module-scoped and cached; Fluid Compute reuses the instance across requests so per-invocation cost is just the JSON-RPC dispatch + tool execution.
- `GET /api/mcp` is an unauthenticated health probe (returns shape info only, never brain content).
- `OPTIONS /api/mcp` handles CORS preflight — not strictly required for `claude mcp add` (server-to-server), but lets a browser-based client hit the endpoint if needed.

**Auth:**

- Every POST requires `Authorization: Bearer ${ROUSHI_MCP_HTTP_TOKEN}`.
- If the env var is unset, the route returns 401 for every POST and the health probe surfaces `authConfigured: false`. We never silently expose an unauthenticated brain endpoint.
- Generate a token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and set it on Vercel via `vercel env add ROUSHI_MCP_HTTP_TOKEN production`.

**Existing standalone HTTP server updated:**

- `src/mcp/http-server.ts` had its version hardcoded to `0.3.5`. Now reads `process.env.npm_package_version` so it stays in sync across releases.

**Usage from any Claude Code session:**

```
claude mcp add -s user roushi-remote --url https://roushi.ai/api/mcp \
  --header "Authorization: Bearer $ROUSHI_MCP_HTTP_TOKEN"
```

After that, every tool exposed by the local stdio MCP (search, think, graph-query, skill operations, rule management, goal CRUD, playbook execution, optimize) is callable over HTTP from anywhere.

**Stateless trade-off:**

The local `pnpm mcp:http` server keeps per-session state (one McpServer per `mcp-session-id` header). The deployed `/api/mcp` route is stateless — each request re-runs through the cached server instance. Tool calls work identically; the only difference is the client re-sends `initialize` on each request. The MCP SDK and `claude mcp add` handle this fine because initialize is idempotent.

**Not done (deferred):**

- **Streaming responses** for long-running tools (think, contradictions scan). Vercel Fluid Compute supports SSE, but our current client targets don't need streaming, so the simpler request/response model wins for now.
- **Per-tool rate limiting.** Bearer auth prevents enumeration but doesn't stop a single token from making 10k requests. Add via Vercel Routing Middleware once Roushi has more than one external client.
- **Multi-tenant data isolation.** Roushi is single-tenant (Sam's brain). For a public SaaS rollout we'd need a workspace/tenant_id column on every row plus RLS — a much bigger lift.

---

## [0.9.1] — 2026-05-25

### feat: visual graph explorer (`/graph`)

Force-directed view of every entity and edge in the brain. Until now the typed graph (uses, hosted_on, depends_on, defined_by, etc.) existed only behind the recursive-CTE traversal in `src/lib/graph.ts` — nothing visualized the shape of the portfolio knowledge. This ships the missing surface.

**Files:**

- **`src/lib/graph-data.ts`** — `loadGraphSnapshot()`. Reads every entity + every edge in one round trip, returns cytoscape-shaped `{nodes, edges, typeCounts}`. Server-side only.
- **`src/app/components/GraphCanvas.tsx`** — client component. Uses cytoscape (built-in `cose` layout — no extra plugin) so we don't pull in cose-bilkent or react-cytoscapejs. Color per entity type (12 distinct colors), click-to-navigate on nodes (`/entities/<slug>`), legend toggles to hide/show each type, search box highlights matching node names and dims the rest. Edges follow whatever nodes are dimmed.
- **`src/app/graph/page.tsx`** — server route. Renders header + entity/edge counts, hands the snapshot to the client component. `force-dynamic` so post-ingest refreshes pick up new structure without cache invalidation.
- **`src/app/layout.tsx`** — adds Graph between Browse and Goals in the top nav.

**Dependencies added:** `cytoscape` + `@types/cytoscape`. No plugin packages — kept lean.

**Performance:** the brain has ~100-200 entities and ~200-500 edges; cose layout settles in <2s in-browser even on the cold render. If the graph grows past ~1000 nodes we'd want to switch to a WebGL-based engine (Sigma) but that's a future-Sam problem.

**Not done (deferred):**

- Highlighting paths between two specific entities (click → click → BFS).
- Subgraph filtering by relation (only show `defined_by` edges, etc.).
- Saving graph layouts so the same layout reproduces next visit.

---

## [0.9.0] — 2026-05-25

### feat: Roushi-as-advisor (PreToolUse context hook) + maintenance run logging

Two pieces shipped together, both addressing real gaps Sam hit this week.

**1. Roushi-as-PreToolUse-advisor — the brain now prescribes while you work.**

The portfolio-security-baseline rule covers always-on principles; the security hook covers stack-specific patterns; but neither pulls from the *actual knowledge accumulated in the brain*. With 100+ entities across 20+ products, that knowledge is leveraged today only when you explicitly query (`roushi search`, `roushi think`). The PreToolUse advisor fixes that: when you edit a file in any KumoKodo workspace, Roushi:

- Detects which product the file belongs to (via the longest source_path prefix match on `product` entities)
- Classifies the file by path pattern (Vercel Cron, API route, Server Action, middleware, Auth.js config, Drizzle schema, etc. — same families as the security hook)
- Looks up 2-4 relevant lessons/decisions/patterns/rules by ILIKE keyword match
- Renders a compact markdown block and injects it as PreToolUse `additionalContext`

Result: editing a cron route in Kodokyo surfaces `[lesson] AI model retirement breaks apps silently` + `[pattern] Cron Jobs` automatically — Claude sees the relevant prior knowledge *before* generating the code.

**Files:**

- **`src/lib/context-for-file.ts`** — `contextForFile(filePath)` + `renderFileContext(ctx)`. Eight file-type classifications. Product detection via direct SQL on `entities.source_path`. Entity lookup via ILIKE OR-chain (avoids embeddings round-trip — keeps per-fire latency ~500ms wall-clock).
- **`scripts/context-for-file.ts`** — slim tsx entry-point. Reads stdin, calls the lib, emits the PreToolUse envelope. Silent failure on any error so a session is never blocked.
- **`~/.claude/settings.json`** (user-global) — second `PreToolUse` entry alongside `pre-edit-security-hook.js`. The two hooks compose: security hook covers always-applicable stack patterns; advisor hook covers product-specific brain knowledge.

**Gating: silent when there's nothing to say.** If neither classification nor brain entities matched, the hook returns no output. Otherwise every config/docs/version-bump edit would spam an empty "you're in Roushi" header — that's redundant with the SessionStart product context.

**2. `maintenance_runs` table — close the "did the cron fire?" gap.**

Sam first hit this morning when 03:00 UTC decay ran, produced zero findings (correctly), and posted no goal — leaving no visible signal that the cron had executed. The `MaintenanceSchedule` panel I shipped in v0.7.5 was a static workaround; this is the real fix.

**Schema:**

- New `maintenance_kind` enum (`decay | dedupe | audit-edges | contradictions`)
- New `maintenance_runs` table: kind, ran_at, findings_count, threshold, exceeded_threshold, goal_action, goal_id, duration_ms
- Indexes on `kind` and `ran_at`
- `pnpm db:push` ALTER TYPE + CREATE TABLE worked clean; followed with `pnpm db:indexes` to recreate HNSW + GIN

**Wiring:**

- **`src/lib/maintenance.ts`** — `runMaintenance(kind)` now wraps the scan in a `startedAt` timer, inserts a row into `maintenance_runs` after, and exports two helpers:
  - `listRecentRuns(limit)` — N most recent invocations across all kinds
  - `lastRunByKind()` — the most recent run for each kind (DISTINCT ON over `kind` ordered by `ran_at`)
- **`src/app/goals/page.tsx`** — new `MaintenanceActivity` section above the static schedule panel. Two views:
  - Per-kind grid: "Decay: 0 findings · 3h ago", "Audit edges: never run", etc.
  - Collapsible "Last N invocations" list with kind / findings / goal-action / duration / timestamp

**Repo hygiene:**

- Roushi-local `.claude/settings.json` PreToolUse entry removed (now redundant with the global one; was causing duplicate security-checklist fires).
- Local settings.json keeps only the PostToolUse hook (Biome format + schema/content nudges) — those are Roushi-specific and stay per-project.

**Not done (deferred):**

- **Hybrid-search fallback for file types we haven't classified.** Right now an unclassified file (e.g. an arbitrary lib file) gets no advisor context. A vector search using "file path + brief context" as the query would catch more, but adds ~200ms latency. Add if the deterministic classifier misses too often.
- **Cache layer on context-for-file.** Per-file results don't change between rapid sequential edits; caching by file path (with a 30s TTL) would knock the per-fire cost to single-digit ms on repeat hits. Add if the ~500ms latency becomes annoying.
- **Visual graph explorer** (#3 from the brainstorm). Sam said "intriguing" — separate ship.

---

## [0.8.1] — 2026-05-25

### feat: security guidance that fires BEFORE the code is written

Sam's question: *"Ideally the security skill is always invoked and makes sure the code is written secure rather than checking after the fact. Is that possible?"* Yes — PreToolUse hooks fire before the Edit/Write tool runs, which means Claude reads the security guidance *before* generating the code.

Three layers shipped together so coverage is end-to-end:

1. **`portfolio-security-baseline` rule** (`content/rules/portfolio-security-baseline.md`) — `applies_to: portfolio, priority: high`. Cross-cutting Always/Never list + stack-specific gotchas (Auth.js v5 `trustHost`, Server Action redirect-in-try-catch, Drizzle `ANY(jsArray)`, middleware matcher exclusions). Syncs into every KumoKodo workspace's Claude memory dir automatically via the existing SessionStart hook. **Always-on baseline.**

2. **`scripts/pre-edit-security-hook.js`** + `.claude/settings.json` — PreToolUse hook on Edit|Write. Matches the target `file_path` against eight pattern families and injects a 3–5 bullet checklist tailored to that file type:
   - Vercel Cron route → `CRON_SECRET` Bearer auth, no body logging
   - API route → Zod params, auth-before-mutation, no body logging
   - Server Action → Zod formData, no `throw`, `revalidatePath('/specific')`
   - Middleware/Proxy → `trustHost`, edge-runtime imports, matcher exclusions
   - Auth.js config → `trustHost`, split node/edge config, no token logging
   - DB schema → encrypted columns, `db:indexes` reminder, `ANY` trap
   - `.env*` → no real secrets, mirror to Vercel, `.gitignore` check
   - Client component → no server imports, serializable props only
   
   Plain CJS Node, no deps, <50ms cold start. Quiet by default — only emits when a pattern matches. **Just-in-time, file-specific.**

3. **Existing `sql-pattern-reviewer` subagent + Anthropic's `/security-review`** stay as the post-hoc safety net for what slips through. The composition: rule sets the baseline, PreToolUse hook prompts at write-time, post-hoc audit catches the rest.

**Existing settings.json updated** — PreToolUse + PostToolUse now coexist, both matching `Edit|Write`.

**Verified end-to-end:** `pnpm roushi rules list` shows `portfolio-security-baseline` as a `priority: high portfolio` rule. The hook script smoke-tests cleanly via JSON-on-stdin matching the documented PreToolUse contract.

**Not done (deferred):**

- **Promote the PreToolUse hook to user-global** (`~/.claude/settings.json`) so it works in every KumoKodo product, not just Roushi. Worth doing once the hook proves itself for a few sessions in this repo — don't propagate untested config.
- **NEXT_PUBLIC_ env var detection on edited content** — the hook can already see `tool_input.content` but the matcher isn't wired yet. Add when a real NEXT_PUBLIC_ leak appears or as part of the per-product promotion.

---

## [0.8.0] — 2026-05-25

### feat: index Claude Code skills as first-class brain entities

Sam asked: *"should skills be in Roushi or stay as skills?"* The honest answer turned out to be **both**. Claude Code's native `/<skill>` invocation requires the SKILL.md files on disk, so we don't host them. But indexing them in Roushi adds cross-portfolio value: `think`/`search` can recommend a skill in an answer, the graph can link skills to products/tech, and weakly-described or misfiled skills surface as lint warnings.

Running `/claude-automation-recommender` and `/skill-creator` in parallel before building this ship turned out to be load-bearing — they revealed that the planned auto-creator + linter already existed natively, which trimmed v0.8 from "rebuild what Anthropic already shipped" down to just "index + cross-reference."

**Schema:**

- **`entity_type` enum** — added `skill` as the twelfth type. `pnpm db:push` ALTER TYPE worked cleanly; followed with `pnpm db:indexes` to recreate HNSW + GIN after the push (the documented gotcha — bit us during the bump, mitigated by today's nudge hook going forward).

**New `src/lib/skills.ts`:**

- `discoverSkills(roots[])` walks each skills-root directory one level deep, parses YAML frontmatter via `gray-matter`, returns `{dirName, skillMdPath, frontmatter, body, modifiedAt, warnings}` for every well-formed `<name>/SKILL.md`. Flags misfiled top-level `.md` files (Claude Code doesn't load them either), malformed YAML, missing `name`/`description`, and `frontmatter.name ≠ directory name` mismatches.
- `ingestSkills(roots?)` runs discovery then upserts each as a `skill` entity. Slug = sanitized directory name. Embedding is made from `name + description` (the trigger surface — what determines `/<skill>` invocation), not the body, so semantic search recommends skills that *should* fire on a given query. Body is stored in `entity.description` for retrieval context. Source path lives in `frontmatter._source_path` so the UI can show where on disk to find it.
- Default search path: `~/.claude/skills/`. Per-product `.claude/skills/` not auto-discovered yet — deferred until any product actually creates project-scoped skills.

**CLI** (`pnpm roushi skill …`):

- `skill list` — every indexed skill with warning count
- `skill get <slug>` — full body + frontmatter + warnings + source path
- `skill ingest [paths…]` — re-scan and upsert. Idempotent.

**MCP tools** — three new entries in `TOOL_NAMES`:

- `roushi_skill_list` — list with trigger description previews
- `roushi_skill_get` — full body for an agent that's about to recommend a skill
- `roushi_skill_ingest` — re-index from any path (default `~/.claude/skills/`)

**Web UI** — new `/skills` page added to the top nav between Rules and Optimize. Lists every indexed skill with name, slug, trigger description, source path, and any lint warnings (shown inline as amber bullets). The page is `force-dynamic` because skills change via disk edits + re-ingest, not via the web UI.

**Verified end-to-end:** `roushi search "create a logo" --limit 5` returns `logo-exploration` as the #1 hit with the trigger-description-derived embedding driving it. The Ask flow (`think`) will now naturally cite skills in answers since they participate in the same hybrid-search top-K used for grounding.

**Not done (deferred):**

- Per-product skill discovery (walking `<workspace>/.claude/skills/` alongside `~/.claude/skills/`). Trivial to add when needed.
- Gap analyzer that clusters lessons → "you should have a skill for this." Defers to `/skill-creator` for authoring; just needs the clustering pass. Next ship if it earns its keep.
- Linter cron (misfiled skills, stale skills, weak descriptions). `/skill-creator` already does this on demand; a cron only matters if Sam stops running it manually.

---

## [0.7.5] — 2026-05-25

### feat: goal timestamps + maintenance schedule panel

Sam came back the next morning, checked `/goals` for overnight cron activity, and reported: *"I don't know if anything new was added, nothing has dates."* The DB had `created_at`/`updated_at` on every goal but the UI only rendered the optional `target_date` — there was no way to tell a fresh goal from an old one.

Separately, the absence of any new `[system] Maintenance:` goals was confusing because Sam couldn't distinguish "the cron didn't fire" from "the cron fired and found nothing." Vercel logs confirmed `/api/cron/decay` ran at 03:00 UTC and returned 200 — it just correctly posted no goal because the portfolio is too freshly seeded to have anything 90+ days stale. Meanwhile audit-edges + contradictions (weekly Sunday slots) missed their window because v0.6.0 didn't land until Sunday evening UTC — next firing is Sunday May 31. Without surfacing the schedule, that's invisible.

**Changes:**

- **`src/lib/format-time.ts`** (new) — tiny `relativeTime(when)` helper. Returns "just now" / "Nm ago" / "Nh ago" / "Nd ago" / "Mon DD". Skips date-fns to stay lean. Also exports `isRecent(when, hours)` for highlighting fresh rows.
- **`src/app/goals/page.tsx`** — every row now shows `created Xh ago · updated Yh ago` (the "updated" half is suppressed when it matches creation within 60s). Hover tooltip shows full ISO timestamps for both. Goals updated in the last 24h get a small emerald dot next to their title (tooltip: "Updated in the last 24 hours"). Rows now sort by `updated_at DESC` so the freshest activity bubbles to the top. Target-date label clarified with a "due" prefix so it can't be confused with the activity timestamp.
- **`MaintenanceSchedule` block** at the bottom of `/goals` — static table of the four cron kinds with their schedules and posting thresholds. Lets Sam see at a glance that audit-edges + contradictions are weekly (next slot Sunday) without having to remember or look at `vercel.ts`. Hard-coded from `vercel.ts` — mirror schedule changes there.
- **`export const dynamic = "force-dynamic"`** on `/goals` — without it, status-button mutations sometimes showed stale data on a fresh load because Next cached the prior render.

**Not done (deferred):**

- A real `maintenance_runs` table that logs every scan invocation with timestamp + findings count. Would let us show "Decay: last ran 6h ago, 0 findings" even when no goal exists. Requires a schema migration and `upsertSystemGoal` instrumentation. The static schedule block is a workable substitute for now.

---

## [0.7.4] — 2026-05-24

### feat: goal lifecycle UI — status buttons + hide-closed toggle + system-goal auto-resolve

After v0.7.3 shipped, Sam asked "what do I do on /goals, do they auto-remove when met?" — surfaced a real gap: the Goals page was view-only. `updateGoalStatus()` existed in lib, was wired to a Server Action (`updateGoalStatusAction`), but no UI surfaced it. So manual goals piled up forever and you had to drop to CLI / MCP to close one.

**What changed:**

- **`src/app/components/GoalStatusButtons.tsx`** (new) — per-row status-transition buttons. Active goals get `✓ done`, `block`, `abandon`. Blocked goals get `✓ done`, `unblock`, `abandon`. Completed/abandoned goals get `reopen`. Abandon prompts for confirmation; the rest are one-click since they're reversible. All actions submit to `updateGoalStatusAction`, which `revalidatePath`s `/goals` + `/` so the homepage badge refreshes too.
- **System-managed goals are protected** — any goal with title prefix `[system] Maintenance:` shows `cron-managed` in place of buttons. These are owned by the maintenance cron and shouldn't be hand-edited (it'd just re-open them on the next scan). Tooltip explains the rule.
- **`src/app/goals/page.tsx`** — default view now hides completed + abandoned to keep the page focused on pending work. A header button toggles `?show=all` to surface them (and flips its label to "Hide closed" with the closed-count in parens). Description bodies render with `whitespace-pre-wrap` so the cron-posted multi-line findings format correctly.

**Auto-resolution (already working, called out for clarity):**

System-managed goals (decay, dedupe, audit-edges, contradictions) already auto-resolve via `upsertSystemGoal` in `src/lib/maintenance.ts` (lines 96-106). When the cron's next scan finds zero issues for a given kind, any active `[system] Maintenance: <kind>` goals get flipped to `completed` automatically. Existed since v0.7.0; just wasn't visible because the page didn't separate system vs manual goals.

**Manual goals stay manual** — "ship v1", "migrate Kodori to Kodokyo" are judgment calls Roushi can't auto-detect. Buttons give you a one-click close instead of a CLI invocation.

---

## [0.7.3] — 2026-05-24

### fix: Ask UX (submit button, thinking indicator, markdown rendering, /optimize copy clarity)

After v0.7.2 shipped the LLM reranker, Sam tested the Ask flow on prod and reported four UX issues:

1. **Pressing Enter felt dead.** The URL changed but nothing visible happened for 5–15 seconds while the brain searched + LLM synthesized. Hard to tell if it was working.
2. **`**bold**` and `## heading` rendered as literal asterisks.** The LLM produces markdown but we were sending the answer body straight to a `<pre>` after a hand-rolled `[slug]` link splitter, so all the markdown punctuation leaked through.
3. **`/optimize` says "93 fixes" and that's confusing.** Are those optimizing the project's source code or Roushi itself? Sam wasn't sure if it was safe to click "apply all".

**Fixes:**

- **`src/app/components/AskForm.tsx`** (new) — client component with a visible "Ask" submit button + `useTransition` so we can show a "Thinking…" state. While pending: input disables, button text flips, and a centered helper line with an animated emerald dot says *"Searching the brain and composing an answer with citations — usually 5–15 seconds."* Hero variant for the homepage, inline variant for results pages.
- **`src/app/components/AnswerBody.tsx`** (new) — renders the answer body through `react-markdown` (added `^10.1.0` to deps). Citations are pre-transformed: `[slug]` → `[slug](/entities/slug "roushi-citation")` so react-markdown parses them as real links, then a custom `a` renderer detects the marker title and renders them as monospace emerald `[slug]` chips. Custom renderers for `p`, `strong`, `em`, `h1-h3`, `ul/ol/li`, `blockquote`, `pre`, inline `code`, and `a` — styled to match the rest of the dark UI without pulling in `@tailwindcss/typography`.
- **`src/app/page.tsx`** — `AskHero` and `AskResults` now use `<AskForm>` and `<AnswerBody>`. Removed the inline `renderAnswerWithLinks` splitter and the `AnswerSegment` type — both lived in the page and are now subsumed by `AnswerBody`.
- **`src/app/optimize/page.tsx`** — header rewritten to make the scope unambiguous: *"Health checks against the **Roushi brain itself** — its entities, edges, and rule library. Nothing here touches any project's source code; these fixes update metadata **inside Roushi** (relabeling an edge, merging two near-duplicate slugs, marking an entity as recently validated, surfacing two rules that contradict each other). The brain is what gets cleaner — your repos are untouched."* A second paragraph explains the four checks (Audit / Dedupe / Decay / Contradictions) and points to `/goals` for the cron-posted findings.

**Deferred:**

- **Back-button history.** Browser back from `/?q=...` goes to `/` and clears the query — Sam wanted a way back to the results list when drilling into a cited entity. The browser-default behavior is technically correct (the homepage IS the previous page if you typed a question and arrived from there). A "recent questions" affordance or a query-aware back link is a separate ship — not in 0.7.3.

---

## [0.3.5] — 2026-05-24

### fix: extract inline Server Actions for signIn / signOut

v0.3.4's defensive guards fixed the layout-level crash (/ now 307s correctly), but `/auth/signin` still 500'd on every request even though build succeeded. Inline Server Actions (`<form action={async () => { "use server"; await signIn(...) }}>`) in Server Components have known compatibility friction with Next 16 + Auth.js v5 — they serialize through a path that can throw at request time without surfacing in build logs.

**Fix:** extracted both `signIn` and `signOut` calls into dedicated `"use server"` files and reference them as top-level Server Actions via `.bind()`.

- `src/app/auth/signin/actions.ts` — `signInWithGitHubAction(callbackUrl)`
- `src/app/auth-actions.ts` — `signOutAction()`
- `src/app/auth/signin/page.tsx` — uses `signInWithGitHubAction.bind(null, callbackUrl)`
- `src/app/layout.tsx` — uses `signOutAction` directly (no args)

Both Server Actions are now stable, top-level functions that Next + Auth.js can serialize reliably.

---

## [0.3.4] — 2026-05-24

### fix: defensive auth() guards + trustHost so prod doesn't 500 on every URL

After v0.3.3 fixed builds, v0.3.4 fixes runtime: with `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` set on Vercel, `authEnabled` flipped to `true`, and `await auth()` was getting called in both the root layout AND the proxy on every request. Something in that call threw on Vercel (likely host-mismatch — Auth.js v5 behind a reverse proxy needs `trustHost: true` for its X-Forwarded-Host validation), and the unhandled throw 500'd every page including static ones like `/help` and even `/favicon.ico`.

**Fix:**
- **`src/auth.ts`**: added `trustHost: true` to the NextAuth config. Required for any deploy behind a reverse proxy (Vercel, Cloudflare, etc.). Without it Auth.js can refuse the request.
- **`src/proxy.ts`**: wrapped `await auth()` in try/catch. If auth throws, log to stderr and let the request through with no session — better failure mode than 500 on every URL.
- **`src/app/layout.tsx`**: same try/catch around `auth()`. Layout renders for every page; if auth throws here, all pages crash.

The defensive guards mean a future auth misconfig won't take the whole site down — it'll degrade to "no session" silently while erroring to stderr for visibility.

### Validated

- `pnpm typecheck` clean.
- On commit: roushi.ai should redeploy and return 200 even if there's still an auth env var issue (the guards swallow the throw and serve the page with no session).

---

## [0.3.3] — 2026-05-24

### fix: Vercel builds were failing on missing DATABASE_URL

The last 8 Vercel deployments failed at `Collecting page data using N workers` with `Error: DATABASE_URL is required`. Next's build-time page-data collection imports the auth route → `src/auth.ts` → `src/db/client.ts`, which had a module-level `throw new Error("DATABASE_URL is required")`. Vercel hadn't been given env vars yet, so every push since the auth wiring landed failed silently in the cloud while local builds passed.

**Fix:** `src/db/client.ts` now uses a stub URL fallback at construction time. `neon()` doesn't open a connection, so a stub URL constructs cleanly; Auth.js's DrizzleAdapter sees a real Drizzle instance and the build passes. Any actual query at runtime obviously still needs a real `DATABASE_URL` — there's a one-line stderr warning if `DATABASE_URL` is unset when `NODE_ENV=production` AND we're not inside a Vercel build.

I'd already tried a Proxy-based lazy-init first; that failed differently — Auth.js's adapter does an `instanceof`-style dialect detection that a bare Proxy can't satisfy. The stub-URL approach keeps the real Drizzle instance constructed.

### Verified

- `pnpm build` passes with `DATABASE_URL` explicitly unset (simulating Vercel's first build).
- All 14 routes compile, all worker steps pass.
- `pnpm typecheck` clean.

### Still need on your end

Vercel project env vars (so the **runtime** works, not just the build):
- `DATABASE_URL` (Neon connection string)
- `OPENAI_API_KEY`
- `AUTH_SECRET` (random 32-byte base64)
- `AUTH_URL=https://roushi.ai`
- `AUTH_GITHUB_ID` + `AUTH_GITHUB_SECRET` (prod GitHub OAuth app, callback `https://roushi.ai/api/auth/callback/github`)
- `AUTH_ALLOWED_EMAILS="sam.w.simpson@gmail.com"`

Until those land, the prod site will build but every page 500s on the first query.

---

## [0.3.2] — 2026-05-24

### Playbook invocation tracking — tracked execution with approval

When a playbook fires, Roushi now records a **`PlaybookInvocation`** + one **`InvocationAction`** row per action (all initially `pending`). The agent (or human) walks the checklist, marking each action complete / rejected / failed. The invocation auto-rolls-up to `completed` when no `pending` actions remain.

This is **not** auto-execute — Roushi still doesn't interpret free-text actions and run them. What this layer adds: **visibility** (which playbooks fired?), **tracking** (did anyone handle them?), and a **review queue** for things that shouldn't slip through. True auto-execute requires structured action language and lands later.

- **Schema**: `playbook_invocations` + `invocation_actions` tables, plus `invocation_status` (`pending | in_progress | completed | abandoned`) and `invocation_action_status` (`pending | completed | rejected | failed`) enums. Post-migration trigger keeps `updated_at` fresh.
- **`src/lib/invocations.ts`** — `recordInvocation`, `listInvocations` (with playbook + entity context joined), `getInvocation`, `updateActionStatus` (with automatic invocation-status roll-up), `abandonInvocation`.
- **`discovery.addProject()` writes invocations** automatically for every matching playbook. The result type now includes `invocations: PlaybookInvocation[]` alongside `matchingPlaybooks`.
- **CLI**: `pnpm roushi playbook runs [--pending] [--playbook <slug>]` lists invocations. `playbook run <id>` shows the checklist. `playbook complete|reject|fail <id> <actionIndex> [--notes "…"]` updates one action. `playbook abandon-run <id>` shuts down a whole invocation.
- **MCP**: 4 new tools — `roushi_playbook_runs`, `roushi_playbook_run_get`, `roushi_playbook_action_set_status`, `roushi_playbook_abandon_run`. Total MCP surface **28 tools**.
- **Web UI**: `/playbooks/runs` lists invocations grouped by Active / Completed / Abandoned. `/playbooks/runs/[id]` shows the numbered checklist with per-action "✓ done / skip / ✗ failed" buttons + Abandon. The `/projects/new` success state now links straight to each created run.

### Verified end-to-end

- `pnpm typecheck` + `pnpm build` clean. 13 routes.
- Added a throwaway project → 1 invocation recorded for `scaffold-project-docs` (`project_created` trigger) with 5 pending actions.
- Marked action #1 complete with notes → invocation rolled `pending` → `in_progress`, action shows ✓ with the note attached.
- `playbook abandon-run` cleanly closed it out.

### Auto-deploy verified

roushi.ai returns HTTP 200. `pnpm build` was added to the validation step as protection: every push now triggers a Vercel build, so a broken build = broken roushi.ai. We're on Next 16 + Fluid Compute (Node 24 runtime), 13 routes, app routes are dynamic, examples + help + playbooks (list, new) are static.

### Deferred to v0.4+

- **True auto-execute** — agent reads the action text, classifies it, runs it. Needs structured action types or an LLM action interpreter. Right approach probably: typed action templates (e.g. `{ kind: "create_file", path: "STACK.md", template: "..." }`) for the common patterns + free-text fallback.
- **GitHub webhook → `significant_change` events** — need to write a `POST /api/webhooks/github` route that verifies HMAC signature, parses push events, decides what counts as "significant", and fires invocations. Sam-blocked on creating the webhook + secret.
- **Scheduled decay-cron** — `vercel.ts` already has the schedule declared; needs a cron route handler.

---

## [0.3.1] — 2026-05-24

### HTTP transport for the MCP server

Roushi can now be reached over HTTP, not just stdio. Useful for browser-based agents, deployed workers (Vercel functions, GitHub Actions), and any client that doesn't want to spawn a subprocess.

- **`src/mcp/tools.ts`** — new shared module exporting `registerAllTools(mcp)` + `TOOL_NAMES`. All 24 tool definitions extracted from the old `server.ts`. Both transports create their own `McpServer` and call into the shared registration so the surface stays in lockstep.
- **`src/mcp/server.ts`** — slimmed to ~25 lines. Still the stdio entrypoint, still wired into Claude Code globally via `pnpm mcp`.
- **`src/mcp/http-server.ts`** — new HTTP entrypoint. Uses `StreamableHTTPServerTransport` from the SDK. Stateful sessions (each client gets a UUID via `Mcp-Session-Id` header on initialize, includes it on subsequent requests). One `McpServer` per session, transports auto-clean-up on close. Health check at `GET /health` (unauthenticated, returns `{ok, tools}`).
- **Bearer-token auth** required on every `/mcp` request. Server refuses to start if `ROUSHI_MCP_HTTP_TOKEN` is unset — no accidental unauthenticated exposure. Token validated case-insensitively in the `Authorization: Bearer …` header; 401 on mismatch.
- **`pnpm mcp:http`** new script. Binds to `ROUSHI_MCP_HTTP_PORT` (default 3737).
- **`.env.example`** documents `ROUSHI_MCP_HTTP_TOKEN` with cross-platform generation snippets.

### Validated

- `pnpm typecheck` clean.
- Three live smoke tests against `localhost:3737`:
  - `GET /health` → 200 + `{ok:true, tools:24}`
  - `POST /mcp` without token → 401
  - `POST /mcp` with token + JSON-RPC initialize → 200 + `Mcp-Session-Id` header + correct `serverInfo` response
- Stdio entrypoint still works: `echo '{...initialize...}' | pnpm mcp` returns the same `serverInfo` — refactor didn't regress the existing global registration.

### Still deferred

- **Auto-execute playbooks** — v0.3.2, needs approval-flow design before it's safe.
- **Deploy to roushi.ai + GitHub webhook → significant_change** — Sam-blocked (Vercel link, DNS, webhook secret).

---

## [0.3.0] — 2026-05-24

### Brain self-optimization — audit, dedupe, decay

Three checks against brain quality, each surfaced via CLI + MCP + a dedicated `/optimize` web page. None of them auto-execute destructive actions without explicit confirmation.

- **`src/lib/audit.ts`** — edge-quality audit. Defines a canonical relation per source-type × target-type pair (e.g. `product → tech = uses`, `product → pattern = defined_by`). Scans every edge and flags `wrong` rows (incompatible source-type) plus `suspect` rows (relation doesn't match canonical). Suggests fixes for the suspect ones. `applyAllSuggestedFixes()` rewrites all suspect edges with their suggestion in one shot; idempotent — drops duplicates if a re-pointed edge collides with an existing one. **First run on the current brain caught 91 suspect rows**, almost all from LisAI's extraction (which mapped every tech via `depends_on` instead of `uses`).
- **`src/lib/dedupe.ts`** — fuzzy-merge near-duplicate entities. Uses normalized Levenshtein (slug + name) AND pgvector cosine distance, combined into a confidence score 0–1. Groups via union-find within the same type, so `kumokodo` vs `kumikodo` lands as one group while different-type collisions don't false-positive. `mergeEntities(canonicalId, duplicateId)` re-points all incoming + outgoing edges to canonical, drops duplicate edges that would violate the unique constraint, then deletes the duplicate.
- **`src/lib/decay.ts`** — surface entities not validated in &gt;90 days (configurable). `touchEntity(slug)` bumps `lastValidatedAt` to now after a human confirms accuracy. No auto-deletion — this is a review queue.

### Three surfaces

- **CLI**: `pnpm roushi optimize audit [--apply]`, `optimize fix-edge`, `optimize dedupe`, `optimize merge`, `optimize decay`, `optimize touch`. Apply commands prompt; bulk apply is a single flag.
- **MCP**: `roushi_audit_edges`, `roushi_find_duplicates`, `roushi_merge_entities`, `roushi_list_stale`, `roushi_touch_entity`. Total MCP surface now **24 tools**.
- **Web**: `/optimize` page renders all three sections side-by-side, with per-row Fix / Merge / Mark-validated buttons + a single "Apply all N fixes" button for the suspect-row bulk path. Linked from header nav.

### Caught while implementing

- `db:push` for the new playbooks table (v0.2.0) wiped the HNSW + GIN indexes — drizzle-kit doesn't know about post-migration SQL. Fixed by always re-running `pnpm db:indexes` after a push. Added the playbooks `updated_at` trigger to the post-migration SQL so the file stays the canonical source.

### Validated

- `pnpm typecheck` clean.
- 5 routes return HTTP 200: `/`, `/optimize`, `/playbooks`, `/changelog`, `/help`.
- `pnpm roushi optimize audit` correctly identifies 91 suspect rows in the real brain, suggests fixes for all of them.
- `dedupe` and `decay` return clean — brain has no near-duplicates or stale entries yet (everything's days old).

### Deferred to v0.3.1+

- **HTTP MCP transport** — coming next commit.
- **Playbook auto-execute** — needs approval-queue + per-action-confirm design before it's safe to ship. Probably v0.3.2.
- **Deploy to roushi.ai + GitHub webhook → significant_change events** — requires hands-on (Vercel project link, DNS, webhook secret). Sam-blocked.

---

## [0.2.0] — 2026-05-23

### Playbooks — standing rules that fire on events

The autonomous coordination plane piece of Roushi's mission lands. Sam asked for "when you create a project always create STACK.md, PROJECT_SCOPE.md, CHANGELOG.md" and "every significant change needs a case study review" — both are now first-class playbooks in the brain.

A playbook is `{ trigger, filter, actions[], appliesToSlugs[] }`. When an event fires, Roushi surfaces matching playbooks; the agent (or human) decides what to act on. **v0.2.0 ships visibility — auto-execute is deferred to v0.3** because the blast radius of wrong-action-against-wrong-project is high until there's a review/approval flow.

- **Schema**: new `playbooks` table + `playbook_trigger` enum (`project_created`, `project_updated`, `scope_changed`, `tech_stack_changed`, `significant_change`, `entity_added`, `manual`). Dedicated table rather than reusing `entities` because playbooks have structured shape (trigger + ordered actions) that doesn't fit description fields. Schema migration via `pnpm db:push` + trigger added to `post-migration-indexes.sql`.
- **`src/lib/playbooks.ts`** — `createPlaybook`, `updatePlaybook`, `deletePlaybook`, `getPlaybookBySlug`, `listPlaybooks`, `getMatchingPlaybooks(context)`. The matching logic enforces: active + trigger match + applies-to-slugs (empty = all) + structured filter (keys checked against `entityType` / `entitySlug` / `meta`).
- **`discovery.addProject` returns `matchingPlaybooks` + `wasNew`** — every project add (CLI / MCP / web) now surfaces relevant rules. `wasNew` distinguishes `project_created` from `project_updated` events.
- **CLI**: `pnpm roushi playbook add|list|get|check|remove`. The `add-project` command also prints matching playbooks after success.
- **MCP**: 5 new tools — `roushi_playbook_add`, `roushi_playbook_list`, `roushi_playbook_get`, `roushi_playbook_check_for_event`, `roushi_playbook_remove`. Total MCP surface now **19 tools**.
- **Web UI**:
  - `/playbooks` — list grouped by active vs draft, with trigger badges + first 3 actions inline
  - `/playbooks/new` — form (slug, name, trigger picker, multi-line actions, JSON filter, applies-to slugs, active checkbox)
  - `/playbooks/[slug]` — detail view with numbered actions + metadata + remove
  - `/projects/new` success state now renders matching playbooks inline after a project is added, with full action list

### `/changelog` page renders the markdown publicly

Per Sam's "we will also always have a changelog page for the site so users can see it" — `/changelog` reads `CHANGELOG.md` from the repo root and renders it. Uses a small purpose-built markdown renderer (`src/app/lib/markdown.tsx`, ~150 lines, no new deps) handling headings, lists, code, bold, links, and rules. Header nav adds `Changelog` link.

### 3 starter playbooks seeded

- **`scaffold-project-docs`** (`project_created` trigger): create STACK.md / PROJECT_SCOPE.md / CHANGELOG.md, ensure public /changelog exists, re-run `add-project` after to re-index real content.
- **`update-case-study`** (`significant_change` trigger, filtered to `clientWork: false`): open kumokodo.ai/case-studies/<slug>, compare against the change, draft an update OR note in the commit why no update was needed.
- **`sweep-marketing-on-scope-change`** (`scope_changed` trigger, filtered to `clientWork: false`): 7-step checklist sweeping products page, case study, compare pages, help articles, homepage positioning, security/legal pages, and CHANGELOG.

### Header nav now: `Browse | Playbooks | Examples | Changelog | Help | + Add project`

### Validated

- `pnpm typecheck` clean.
- 7 routes return HTTP 200: `/`, `/playbooks`, `/playbooks/new`, `/playbooks/scaffold-project-docs`, `/changelog`, `/help`, `/examples`.
- 3 playbooks seeded and visible at /playbooks.

### Deferred to v0.3

- **Auto-execute** — playbook actions run automatically when event fires. Needs an approval queue + per-action confirmation OR a "trusted playbook" allow-list. High blast-radius without guardrails.
- **More event triggers** — git webhook → `significant_change`, file-watcher → `scope_changed`, decay cron → `entity_stale`. Currently only `project_created` and `project_updated` actually fire from code; the others exist as types but require integrations to emit them.

---

## [0.1.1] — 2026-05-23

### UI docs + examples gallery — making the brain self-explanatory

Up to v0.1.0 the UI exposed entities, edges, extractions, RRF scores, and client-work tags with zero in-page explanation. v0.1.1 layers that on.

- **`/help` page** — canonical reference. Sections on what Roushi is, the entity types (with the same color-coded badges used elsewhere + a sentence each), the edge relations, how LLM extraction works, how hybrid search + RRF works, complete CLI command table, complete MCP tool list. Anchored sections so other pages can deep-link.
- **`/examples` page** — eight live-running example queries. Each card runs against the actual brain at page-load time (Server Component → `hybridSearch` or `traverseFrom`) and renders top 3 results inline with type badges, scores, and source labels. "see all →" link opens the full search. Tagged as `search` or `graph` examples.
- **Dismissible intro panels** (`components/IntroPanel.tsx`) — appear at the top of `/`, `/projects/new`, `/entities/[slug]`. Each panel explains what the page does in 2-3 sentences and links to the relevant `/help` anchor. "✕" dismisses; choice persisted in localStorage so it doesn't nag on every visit.
- **Inline tooltips** (`components/Tooltip.tsx` + `InfoChip`) — pure CSS, no JS, no third-party lib. Wraps entity-type badges (e.g. hovering "product" → "A repo or shipping product"), edge-relation chips (hovering "uses" → "Product imports / depends on tech"), and example-card type badges. Helps anyone learning the vocabulary without leaving the page they're on.
- **Header nav** gets `Examples` and `Help` links alongside `Browse` and `+ Add project`.

### Validated

- `pnpm typecheck` clean.
- All 6 routes return HTTP 200: `/`, `/projects/new`, `/auth/signin`, `/entities/roushi`, `/help`, `/examples`.
- Marker spot-checks: `/help` renders the 8 sections + tool/CLI tables; `/examples` renders all 8 example cards with live results.

---

## [0.1.0] — 2026-05-23

### Auth wiring (Auth.js v5 + GitHub OAuth)

First minor bump because this is the first feature that meaningfully changes how the app boots.

- **`src/auth.ts`** — Auth.js v5 root config. `DrizzleAdapter` over our existing `users` / `accounts` / `sessions` / `verification_tokens` schema, `GitHub` provider, **JWT session strategy** (cheap middleware — no DB roundtrip per request), single-user `signIn` callback that checks `AUTH_ALLOWED_EMAILS`.
- **`src/proxy.ts`** — replaces the deprecated `middleware.ts` convention (Next 16 renamed it). Conditional gate: every request through `auth()` when enabled, redirects to `/auth/signin?callbackUrl=…` when no session. Matcher excludes `/api/auth/*`, `/auth/*`, Next internals, and static assets.
- **`src/app/api/auth/[...nextauth]/route.ts`** — exports the NextAuth handlers for the OAuth dance.
- **`src/app/auth/signin/page.tsx`** — sign-in page with the GitHub button. When auth isn't configured, shows a "not yet configured" notice instead. Surfaces `?error=AccessDenied` when an allow-list rejection happens.
- **`src/app/layout.tsx`** — header now shows the signed-in user's name + a sign-out button, OR a "Sign in" link, OR (when unconfigured) an amber "no auth" pill with a tooltip explaining how to enable.
- **`AUTH.md`** — setup walkthrough: creating the GitHub OAuth app, generating `AUTH_SECRET`, the allow-list pattern, the prod-vs-local separation, and the architectural notes on why JWT.
- **`.env.example`** — updated AUTH_* docs + new `AUTH_ALLOWED_EMAILS` var.

### Conditional gate

If `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET` aren't both set, `authEnabled = false` and:
- Proxy passes every request through with no session check
- Header shows the "no auth" pill
- Sign-in page shows a config notice instead of the GitHub button

This means the dev server is usable the moment you `pnpm dev`, before you've created the OAuth app. The auth flow turns on automatically when you fill in the env vars + restart.

### Caught while implementing

- **Next 16 deprecated `middleware.ts`** in favor of `proxy.ts`. The dev server logged the warning AND a misleading "file not found" 500 because it kept a stale reference to the old path after the rename. Solved by wiping `.next/` and restarting.

### Validated

- `pnpm typecheck` clean.
- All four routes return HTTP 200 with auth disabled: `/`, `/projects/new`, `/auth/signin`, `/entities/roushi`.
- Markers confirmed: home shows "no auth", sign-in page shows "not yet configured", "Continue with GitHub" hidden.

### To turn auth on locally

See [AUTH.md](AUTH.md). One GitHub OAuth app, three env vars, one restart.

---

## [0.0.9] — 2026-05-23

### Folder picker on add-project page

The add-project form's path input now has a **Browse 📁** button beside it. Click opens an inline navigable directory tree (server-side; works because Roushi is local-only — browsers can't give absolute paths). Each subdirectory is tagged with a `[project]` chip if it has `CLAUDE.md`, `package.json`, or `.git/`, and project-signal dirs sort to the top. Navigate by clicking folder names, select with the per-row "select" button or the header "Select this folder" button. The picker opens to the parent of whatever's typed (or `c:/Users/samws/` by default).

- **`actions.ts: listDirectoryAction(path)`** — Server Action that returns the directory listing with project-signal detection.
- **`components/FolderPicker.tsx`** — client component, ~95 lines. Navigation, signal chips, two select paths (header button = current dir, per-row = subdirectory).
- **`components/AddProjectForm.tsx`** — text input becomes controlled state so the picker can set it; Browse button toggles the picker.

### Tiny fixes along the way

- AddProjectForm originally imported `node:path` in a client component (would have crashed in the browser). Replaced with a browser-safe `safeParentDir` helper.

---

## [0.0.8] — 2026-05-23

### Web UI: browse the brain, add/remove projects

Roushi now has a real interface at `pnpm dev` → `http://localhost:3000`.

**Pages:**
- **`/`** — entity list with type filter chips (Products / Tech / Vendor / Pattern / Decision / Lesson / …), Portfolio vs Client-work filter, full-text search across name+slug+description, color-coded type badges, per-row remove button with confirm.
- **`/projects/new`** — add-project form. Path is the only required field; brand name + slug default sensibly. Optional client-work tagging surfaces conditional Client / End-customer fields. Advanced options for skipping LLM extraction and auto-memory ingest. Server Action calls `discovery.addProject()` and redirects on success.
- **`/entities/[slug]`** — detail view: full description, metadata (source path, timestamps, edge counts, LLM-extracted flag), grouped outgoing + incoming edges with type-colored links to other entities. Per-product entities get a "Refresh" button that re-runs `addProject` (re-embeds, re-extracts).

**Architecture:**
- Server Components for all reads (RSC calls `db.select` directly — no API routes).
- Server Actions for mutations (`addProjectAction`, `removeEntityAction`, `refreshProjectAction`). Two small client components (`AddProjectForm`, `RemoveEntityForm`) for the interactive bits — everything else is server-rendered.
- `src/app/lib/queries.ts` is the only place app/ talks to the DB directly — keeps view-shape changes off the brain libs.
- Tailwind v4 dark theme. No client-side state libs, no shadcn, no extra deps.

### Cleanup: stripped `.js` import extensions across src/

Turbopack (Next 16's default bundler) doesn't rewrite `.js` → `.tsx` the way tsc does with `moduleResolution: "bundler"`, so any cross-tree import pulled into a Server Component failed at build time. Solved by bulk-stripping `.js` extensions from all relative imports across `src/` and `scripts/`. The CLI and MCP server continue to work because `tsx` accepts both extensionless and `.js` imports.

### Verified

- `pnpm typecheck` clean.
- `pnpm dev` boots, all three routes return HTTP 200 with expected markup (entity list, add-project form, Kodori detail page rendering Outgoing + Incoming edges).

### Still pending (was v0.0.8 scoping, deferred to v0.0.9+)

- Auth.js v5 wiring (currently no auth — local-only)
- Edge-quality audit (LisAI-style `depends_on`→`uses` extraction fixes)
- Fuzzy-merge pass for near-duplicate slugs
- Decay cron for stale entries
- HTTP transport for the MCP server
- Deploy to roushi.ai

---

## [0.0.7] — 2026-05-23

### Self-bootstrap: scan + add-project

Roushi can now discover projects under a directory and add them to the brain on its own — no more hand-editing `scripts/seed-portfolio.ts` when a new repo shows up.

- **`src/lib/discovery.ts`** — shared lib:
  - `discoverProjects(dir)`: walks one level under `<dir>`, finds candidates (any dir with CLAUDE.md, package.json, or `.git/`), reports each with its canonical-file count, package presence, auto-memory file count, and whether it's already in the brain. Existing entities display their **stored** slug/name (so Kodori shows as Kodori, not "kumokodo-dms"; Kasuri as Kasuri, not "logo-creator").
  - `addProject(input)`: takes a path, upserts as a `product` entity, ingests the per-project Claude auto-memory dir if present (encoded path lookup), and runs LLM extraction against the description — all in one call. Optional `--client-work` tagging with `client` / `endClient` frontmatter for KumoKodo Studio engagements.
- **CLI**: `pnpm roushi scan <dir>` (with `--add-all`) and `pnpm roushi add-project [path]` (defaults to cwd; flags for `--name`, `--slug`, `--client-work`, `--client`, `--end-client`, `--skip-memory`, `--skip-extraction`).
- **MCP**: `roushi_scan_projects` and `roushi_add_project` — meaning from any Claude Code session in any directory, you can ask Claude to add the current project to Roushi and it just works.
- Total MCP surface now **14 tools**.

### Smoke test (against `c:/users/samws`)

- Scan returned 24 candidates: 14 already in brain, 10 new (alpha-sentinel, Elementor Hubspot Form, full-spectrum, hotrods, mtkclient, oldaether, phab.fitness, RustyTaintChain, ...).
- Existing entities (Kodori, Kasuri, LisAI, kumokodo.ai umbrella site) display with their canonical stored slug/name rather than directory-derived guesses.

### Notes for future Claude sessions

- Default slug for a new project = kebab-cased directory basename. `package.json.name` is intentionally NOT used as the default because it's often generic ("scope", "app") or a workspace sub-name. Pass `--name` / `--slug` to override.
- `addProject` is **idempotent** — re-running upserts the entity, refreshes the embedding, and re-runs extraction. Edges with unique `(from, to, relation)` constraint don't duplicate.
- The auto-memory directory lookup encodes the path as Claude Code does: lowercase the leading drive letter, replace `:`, `/`, `\`, ` ` with `-`. So `C:/Users/samws/logo creator` → `~/.claude/projects/c--Users-samws-logo-creator/memory/`.

### Still pending (was the original v0.0.7 scoping, deferred to v0.0.8)

- Web UI on the existing Next.js scaffold
- Edge-quality audit (fix LisAI-style `depends_on`→`uses` mismatches)
- Fuzzy-merge pass for near-duplicate slugs (`kumikodo` vs `kumokodo`)
- Decay cron for entries unvalidated > 90 days
- HTTP transport for the MCP server

The 4 active goals carrying "v0.0.7:" titles can keep that prefix or be renamed — they're now logically v0.0.8.

---

## [0.0.6] — 2026-05-23

### Ambient brain: SessionStart hook + stats command

- **`scripts/session-start-hook.ts`** — Claude Code `SessionStart` hook. When a session starts in a KumoKodo workspace directory, queries Roushi for the product entity whose `source_path` matches the cwd, plus its directly-connected edges. Output gets injected as session context (system reminder), so Claude opens already knowing what Roushi knows about the project. Outside the workspace tree: silent.
- **Hook wired in `~/.claude/settings.json`** via `tsx.cmd --env-file=...` absolute paths. Timeout 8s. Fails silent on any DB/network error so brain issues never block a session.
- **`pnpm roushi stats`** — health snapshot: entity counts by type, edge counts by relation, goal counts by status, 5 most recently updated entities. Quick "is the brain working" check.

### Validated

- Hook smoke-tested from `c:/Users/samws/Roushi`: returns the Roushi product entity + 9 outgoing edges grouped by relation.
- `pnpm roushi stats`: confirms current state — 87 entities (26 tech, 24 pattern, 13 lesson, 11 vendor, 10 product, 3 decision), 114 edges (44 uses, 30 defined_by, 13 hosted_on, 10 mentions, 9 depends_on, 7 led_to, 1 applies_to), 1 active goal.
- `pnpm typecheck` passes.

### How to verify the hook is live

After restarting Claude Code, the first message in the session will be preceded by a system reminder titled "Roushi context: <product>" listing what the brain knows about the current working directory.

---

## [0.0.5] — 2026-05-23

### LLM extraction: product blobs → typed sub-entity graph

- **`src/lib/extract.ts`** — structured-output extraction via Vercel AI SDK `generateObject` against OpenAI `gpt-4o-mini`. Zod schema: extracts `tech` / `vendor` / `decision` / `pattern` / `lesson` entities plus edges from the source product to each. System prompt enforces kebab-case ascii slugs, reuse of an "existing slugs" hint list (slug-canonicalization across products), and conservative extraction (no inference beyond the source text).
- **`scripts/extract-portfolio.ts`** — runs extraction across all product entities sequentially. Each call gets the running set of brain slugs as the hint, so by the 5th product the LLM is reusing `drizzle-orm`, `vercel`, `neon-postgres` instead of coining variants. Idempotent — re-runs only refresh extracted entities (skips human-curated rows by checking `frontmatter.extracted`).
- **`scripts/extract-one.ts`** — dry-run helper that prints raw LLM output for a single product without touching the DB. Useful for iterating on the system prompt.

### Brain grew from 15 → 87 entities

- 10 products + 5 rules + **72 new typed sub-entities** (tech, vendor, decision, pattern, lesson)
- **98 new edges** connecting products to their tech/vendors/patterns

### Validated

- `pnpm roushi search "Drizzle ORM"` → `[tech] Drizzle ORM` ranks #1 with `source=both`, score 2× neighbors. Kodori (which uses Drizzle) ranks #2.
- `pnpm roushi graph-query drizzle-orm` → walks the graph: Drizzle is `used` by Kodori, plus the full transitive set of LisAI's stack via its `depends_on` edges. Multi-hop traversal returns ~25 entities reachable in 2 hops.
- `pnpm roushi search "Stripe billing integration"` → Stripe entity itself ranks #2 (Roushi #1 because its scope doc mentions billing context).
- `pnpm typecheck` passes.

### Known v0.0.6 candidates

- **Edge-relation accuracy varies by extraction call.** LisAI's run mapped most of its tech via `depends_on` instead of `uses`. Prompt needs stricter relation/type matrix in the system message — e.g. "tech entities ALWAYS get `uses` edges, never `depends_on`."
- **Description blobs are truncated at 8000 chars** in the seed (Kodokyo's Drizzle dependency falls outside that window and didn't get extracted). Consider chunked extraction over the full doc for products with long source files.
- **Some hallucinated edges between products** (e.g. LisAI extracted Akiko as a `uses`-related entity). Need to filter edges where toSlug is itself a product, or add an explicit "do not link to other products" rule.
- **Canonical entity registry** — even with slug-hint reuse, the LLM occasionally creates near-duplicates (e.g. `kumokodo` vs `kumikodo`). A manual cleanup pass or fuzzy-match consolidation is overdue.

### Decisions made (D14)

- **D14:** Extraction goes via OpenAI `gpt-4o-mini` direct (not AI Gateway → Claude Haiku) until the `AI_GATEWAY_API_KEY` lands. `gpt-4o-mini` is plenty for structured extraction with a Zod schema; cost is ~$0.01 per product run (10 products = ~$0.10 for a full re-extract). Swappable in one line in `extract.ts` once the gateway key is available. The env var `ROUSHI_EXTRACTION_MODEL=anthropic/claude-haiku-4-5` still represents the intent for when gateway is wired.

---

## [0.0.4] — 2026-05-23

### Goals + scratchpad primitives, portfolio seeded, MCP registered globally

- **`src/lib/goals.ts`** — durable goals API: `createGoal`, `updateGoalStatus`, `listGoals`, `linkEntitiesToGoal`. Goals carry a slug-resolved `relatedEntityIds` array so a "ship X" goal can be tied to the product, decisions, and patterns that bear on it.
- **`src/lib/scratchpad.ts`** — per-agent ephemeral memory: `writeScratchpad`, `readScratchpad`, `listScratchpad`, `deleteScratchpad`, `purgeExpired`. Partitioned by `agentId` + `sessionId`; optional `ttlSeconds` for auto-expiry; reads filter out expired rows.
- **CLI**: new `roushi goal add|list|update-status|link` and `roushi scratchpad write|read|list` command groups.
- **MCP**: 6 new tools — `roushi_goal_add`, `roushi_goal_list`, `roushi_goal_update_status`, `roushi_scratchpad_write`, `roushi_scratchpad_read`, `roushi_scratchpad_list`. Total now 12 tools.
- **`scripts/seed-portfolio.ts`** — one-shot portfolio seeder. Concatenates each repo's canonical knowledge files (CLAUDE.md, TECH_STACK.md, PROJECT_SCOPE.md, CHANGELOG.md, README.md) into a single description per product entity. 10 products seeded (Kodokyo, Aether AI Support, AI Colosseum, SiteBeacon, LisAI, Akiko, Kodori, Kuroji, kumokodo-website, Roushi). Idempotent — re-running just refreshes content + embeddings.
- **MCP server registered globally** in Claude Code (`claude mcp add -s user roushi pnpm -- --silent --dir <path> mcp`). Now available as `mcp__roushi__*` tools in any future Claude Code session.

### Validated

- `pnpm roushi search "which product handles document management for law firms"` → Kodori ranks #1
- `pnpm roushi search "audit trail hash chain immutable"` → Kuroji #1 with `source=both`, score 2× neighbors (RRF fusion firing)
- `pnpm roushi search "Neon Postgres pgvector hybrid search RRF"` → Roushi #1 with `source=both` (self-recognition)
- `pnpm roushi goal add --link roushi,kodori --target 2026-06-15 …` + `goal list` → created with 2 entities linked
- `pnpm roushi scratchpad write` → `scratchpad read` roundtrip with TTL working

### Decisions made (D13)

- **D13:** Portfolio seed creates **one entity per repo** (the product itself) rather than one entity per file. Reason: the brain stores *concepts*, not files. Per-file ingest would collide on slugs (every `CLAUDE.md` derives slug `claude`) and would dilute the embedding signal for the actual product. v0.5+ can split each product into sub-entities (tech, decisions, patterns) via an LLM extraction pass — by then we'll have the LLM budget and clear axes to split on.

---

## [0.0.3] — 2026-05-23

### Brain core operational

- **Neon Postgres provisioned** (database `neondb`, US East). Extensions installed (`vector`, `pg_trgm`, `uuid-ossp`), 9 tables created via `pnpm db:push`, HNSW + GIN indexes + auto-update triggers all in place.
- **`src/lib/embeddings.ts`** — OpenAI `text-embedding-3-small` (1536 dims), single + batch. Routes direct to OpenAI (not the AI Gateway) — embeddings are a tight loop and `OPENAI_API_KEY` was already separated in `.env.example`.
- **`src/lib/search.ts`** — `hybridSearch` implementing HNSW cosine + tsvector keyword + Reciprocal Rank Fusion (k=60, candidate pool of 50 per ranker). Each hit reports whether it came from `vector`, `keyword`, or `both`.
- **`src/lib/graph.ts`** — `traverseFrom` via recursive Postgres CTE. Bidirectional walk, cycle protection in the recursion frame, optional relation filter. Returns shortest path per reachable entity.
- **`src/lib/ingest.ts`** — two-phase markdown ingest: pass 1 upserts every entity (so all slugs exist before edges resolve), pass 2 turns `[[wikilinks]]` into typed edges. Tolerant of missing frontmatter — derives slug from filename, type from parent directory, name from first H1.
- **`src/mcp/server.ts`** — 6 MCP tools registered: `roushi_search`, `roushi_graph_query`, `roushi_get_entity`, `roushi_list_entities`, `roushi_add`, `roushi_ingest`.
- **`src/cli/index.ts`** — matching CLI commands (`search`, `graph-query`, `get`, `list`, `add`, `ingest`) with chalk output.
- **`scripts/run-sql.ts`** — multi-statement SQL runner (uses `postgres.js`'s `unsafe()` since Drizzle can't run files with PL/pgSQL function bodies). Wired into `pnpm db:extensions`, `pnpm db:indexes`, and the combined `pnpm db:setup`.
- **`.env.local`** created from `.env.example` (gitignored; holds `DATABASE_URL` + `OPENAI_API_KEY`). `drizzle.config.ts` auto-loads it via `dotenv`; `roushi` + `mcp` scripts use `tsx --env-file=.env.local`.
- **Seed data ingested**: 5 entities from `~/.claude/rules/` (projects-registry, context7, domain-check-on-new-projects, gcloud-cli-available-globally, npm-trusted-publishing). Zero edges yet because the rules files don't use `[[wikilink]]` syntax.

### First cross-product queries validated

- `pnpm roushi search "what is our default database for new projects"` → top hit: projects-registry (vector match; projects-registry explicitly states "Default DB: Neon Postgres" — query and answer share no keywords, but the embedding caught the semantic match).
- `pnpm roushi search "publishing npm packages"` → top hit: npm-trusted-publishing with `source=both` and score 2× the vector-only neighbors, confirming RRF fusion fires when both rankers match.
- `pnpm roushi graph-query projects-registry` → returns the start entity only (no edges yet, as expected).

### Decisions made (D11-D12)

- **D11:** Embeddings route direct to OpenAI, not through Vercel AI Gateway. `OPENAI_API_KEY` was already separated from `AI_GATEWAY_API_KEY` in `.env.example` signaling the intent. Gateway is for LLM calls (synthesis, classification, planning); embeddings stay direct.
- **D12:** Dropped `strict: true` from `drizzle.config.ts`. It forces interactive confirmation in non-TTY environments (CI, agent invocations). Default `strict: false` keeps `db:push` non-interactive while still surfacing the planned SQL via `verbose: true`.

### Gotcha resolved

- Drizzle's `sql` template tag spreads a JS array into N separate params when interpolated as `${arr}::type[]`, producing invalid SQL like `ANY(($1, $2, $3)::uuid[])`. Fix: format the array as a Postgres array literal string (`{${arr.join(",")}}`) before interpolating — Postgres parses it server-side as one array parameter. Applied in `src/lib/search.ts` and `src/lib/graph.ts`. Saved to session memory as a reusable pattern.

---

## [0.0.2] — 2026-05-23

### Scaffolding initialized

- **Renamed** workspace from `c:\Users\samws\IDE Brain` to `c:\Users\samws\Roushi` (matches portfolio convention). The old `IDE Brain` directory remains as an empty stub because the harness held it as CWD during this session — safe to delete from any future Claude Code session that doesn't start there.
- **`git init`** on `main` branch (no commits yet — leaving for Sam's first commit).
- **`package.json`** with all v0 deps (Next 16, React 19, Drizzle, Neon serverless, Auth.js v5, AI SDK v6, MCP SDK, Tailwind 4, Biome, Vitest).
- **TypeScript + Biome + PostCSS** configured (`tsconfig.json`, `biome.json`, `postcss.config.mjs`).
- **`vercel.ts`** with cron schedules for auto-detector (daily 3am UTC) and decay-check (weekly Sun 4am UTC).
- **`next.config.ts`** with React strict mode + server-external packages for `postgres` and `@neondatabase/serverless`.
- **`.env.example`** documenting all required env vars (Neon, AI Gateway, OpenAI embeddings, Auth.js GitHub OAuth, Roushi internal config).
- **Directory structure** created: `src/{app,db,lib,mcp,cli,components}/`, `content/{products,decisions,patterns,lessons,incidents,entities,goals}/`, `drizzle/`.
- **Drizzle schema** (`src/db/schema.ts`) — 6 brain tables (`entities`, `edges`, `goals`, `scratchpad`, `events`) + 4 Auth.js tables (`users`, `accounts`, `sessions`, `verification_tokens`). Custom `vector(1536)` + `tsvector` types. 10 entity types, 10 edge relations, 4 goal statuses, 10 event types.
- **`drizzle.config.ts`** for migration generation.
- **Manual SQL files** for what Drizzle can't express:
  - `drizzle/0000_setup_extensions.sql` — `CREATE EXTENSION vector, pg_trgm, uuid-ossp` (run once on fresh DB)
  - `drizzle/post-migration-indexes.sql` — HNSW vector index, GIN tsvector index, search-vector trigger, updated-at triggers (run after each schema migration)
- **App stubs** — minimal `layout.tsx` + `page.tsx` (renders 老師 + Roushi name + tagline) so `pnpm dev` boots cleanly.
- **Lib stubs** — `markdown.ts` (wikilink + frontmatter parser, real implementation), `search.ts` and `graph.ts` (typed stubs that throw "not yet implemented").
- **MCP server stub** — `src/mcp/server.ts` (connects via stdio, no tools registered yet).
- **CLI stub** — `src/cli/index.ts` (commander-based, all commands stubbed).

### Decisions made (D7-D10)

- **D7:** Single Next.js repo for v0 (not Turborepo). Will split into monorepo when CLI/SDK have real shape.
- **D8:** Node 24 + `tsx` for CLI runtime (not Bun). One runtime for whole stack; matches portfolio.
- **D9:** GitHub OAuth via Auth.js v5 (not magic links). Faster, matches portfolio.
- **D10:** Type-based nested markdown directories with frontmatter validation (`content/decisions/`, `content/patterns/`, etc.) — clear filesystem browsing + clean URLs.

### Open questions resolved

- ~~Repo location~~ → `c:\Users\samws\Roushi`
- ~~Monorepo or single?~~ → single for v0
- ~~CLI runtime?~~ → Node + tsx
- ~~Auth flow?~~ → GitHub OAuth
- ~~Markdown structure?~~ → nested by type

---

## [0.0.1] — 2026-05-23

### Project initiated

- **Name chosen:** Roushi (老師 — "old master / sage"). Selected over Shitsuji (English landmine), Sokkin, Kakehashi, Houko, and ~30 other candidates across 5 naming rounds.
- **Domain purchased:** `roushi.ai` ($80/yr via Vercel, registered 2026-05-23).
- **Architecture defined:** 5-layer model — Event Triggers → Agents → Skills → 3-partition Brain (long-term / goals / scratchpad) → Auto-detector + Decay.
- **Initial scoping docs written:** `PROJECT_SCOPE.md`, `TECH_STACK.md`, this changelog, `README.md`.
- **Repo location:** `c:\Users\samws\Roushi`.

### Decisions made (see TECH_STACK.md D1-D6)

- Neon Postgres + pgvector for storage (multi-machine from day 1)
- Drizzle ORM (matches portfolio default)
- Vercel AI Gateway → Claude Haiku 4.5 (extraction) / Opus 4.7 (synthesis)
- MCP server as primary agent interface
- Vercel Workflow for durable background jobs
- Source-available SaaS, MIT for CLI/SDK
