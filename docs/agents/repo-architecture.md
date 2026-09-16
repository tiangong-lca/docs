---
title: next-docs Repository Architecture
docType: reference
scope: repo
status: active
authoritative: true
owner: next-docs
language: en
whenToUse:
  - when changing routing, locale behavior, content loading, search, metadata, or the documentation presentation
  - when checking boundaries between public documentation and shipped product behavior
whenToUpdate:
  - when public-site structure, locale policy, publishing, or output contracts change
checkPaths:
  - AGENTS.md
  - .docpact/config.yaml
  - app/**
  - components/**
  - lib/**
  - content/docs/**
  - public/**
  - manifests/p0b/categories.json
  - manifests/p0b/site-routes.json
  - manifests/p0b/greenfield-deny.json
  - scripts/build.mjs
  - scripts/check-env.mjs
  - scripts/*.test.mjs
  - scripts/verify-out.mjs
  - scripts/check-links.mjs
  - scripts/check-screenshots.mjs
  - package.json
  - next.config.ts
  - edgeone.json
  - context7.json
  - .github/workflows/**
lastReviewedAt: 2026-09-16
lastReviewedCommit: 2168af06c6c9e21b97d94093f008bbdfa1c37e5e
lastReviewedNote: "Reviewed for Docs #210 SEO Plan v2 (final): `/` is the canonical Chinese home and `/zh/` is only a permanent provider redirect, so it appears in no canonical, hreflang or sitemap target; the sitemap lists each canonical URL once and omits `lastmod`. Page descriptions use the authored frontmatter first, else the page's own structured prose (Unicode-safe truncation); a page with neither publishes no page-specific description and is reported as editorial content debt instead of counted as coverage. Provider ownership verification is environment-driven: `BAIDU_SITE_VERIFICATION` (never committed) publishes the exact Baidu marker and an unset value must publish none, both gated by `verify:out`. The required-check job now runs the pinned shared workspace SEO checker over the built `out/` and uploads its report with `if: always()`. EdgeOne-layer redirect proof and production samples remain pending."
related:
  - AGENTS.md
  - .docpact/config.yaml
  - docs/agents/repo-validation.md
---

## Architecture

## Runtime and routes

The site uses Next.js App Router with Fumadocs and exports static files to `out/`.

- `app/(entry)/**` owns `/`, the `x-default` entry that renders the complete Chinese home. Chinese is the canonical home, so `/zh/` is only a permanent provider redirect (see `edgeone.json`) and never a canonical, hreflang, sitemap or Open Graph target.
- `app/(locale)/[lang]/**` owns `/{lang}/` and `/{lang}/docs/**` for `zh`, `en`, `de`, and `fr`. The `zh` locale keeps its documentation routes; only its redundant home alias redirects.
- `lib/source.ts` loads dot-locale MDX from `content/docs/**` with no locale fallback.
- `app/llms.txt`, `app/search-records.json`, `app/api/search`, `app/robots.ts`, `app/sitemap.ts`, and `app/og/**` are generated public endpoints.
- Canonical URLs, language alternatives, `x-default`, and Open Graph images are produced by the layouts, document metadata, and `lib/seo-policy.mjs` (re-exported for application code by `lib/metadata.ts`).
- `app/sitemap.ts` lists each canonical page URL once with reciprocal alternates and the default-language counterpart as `x-default`. It deliberately omits `lastmod`: the static build exposes one source epoch, so per-URL timestamps would claim unrelated pages changed at the same time.
- Provider ownership verification is optional and environment-driven: `BAIDU_SITE_VERIFICATION` (supplied by the deployment, never committed) publishes `<meta name="baidu-site-verification">` from both the entry and locale layouts. An unset or blank value publishes no marker at all, and `verify:out` fails a build that emits one it was not configured with.
- The required-check CI job runs the shared workspace SEO checker (`tiangong-lca/workspace/.github/actions/seo-check`, pinned to a commit) over the already-built `out/` with `artifact-indexing: disabled`, and uploads its JSON report with `if: always()` so a failing check still leaves evidence.
- Page descriptions prefer the authored frontmatter `description`, which is also how an author overrides the derived text. Without one, the page's own structured content supplies the first block that reads as prose; code, JSX, tables, list runs and navigation labels are rejected rather than trimmed into a sentence, and derived text is cut on Unicode character boundaries. A page with neither is **unresolved**: it publishes no page-specific description, inherits the layout's site-level description from Next, and is listed as editorial content debt by `verify:out`. That inherited default is a site default, never a page summary, so it is reported rather than counted as coverage, and it never changes a page's indexability.

Retired paths are intentionally absent and keep their 404s. The only redirect in the hosting configuration is the `/zh` → `/` home alias; no other redirect, rewrite, or compatibility copy may be introduced, and the deny contract is never relaxed to accommodate it.

## Presentation

`components/SiteBrand`, `components/DocsHome`, and `components/DocsPortal` are the shared shell and entry-point components. `lib/layout.shared.tsx` supplies the same brand, search, theme, language, documentation, and repository controls to `HomeLayout` and `DocsLayout`. Home-only navigation actions are appended by `DocsHome`; they do not belong in `baseOptions`, because `DocsLayout` renders shared links in the documentation sidebar. Landing and documentation hubs reuse Fumadocs `buttonVariants`, `Card`, and `Cards`; they do not maintain parallel button or card primitives.

`app/global.css` owns the shared contract:

- an explicit centered 72rem shell and responsive gutters;
- neutral Carbon-style layers with the original TianGong plum retained as a solid interaction color;
- light/dark behavior and visible keyboard focus;
- logo plus `TianGong LCA / Documentation` brand lockup;
- low-radius, border-defined controls without gradients, glow, shadow, or lift animation;
- mobile-safe document pagination.

`components/lca-concept-map.tsx` owns the TianGong LCA hero signature. Its abstract reference-data → process-relations → product-system → LCIA-results topology is intentionally different from the TIDAS data-system/schema signature. The `data-hero-signature="lca-concept-map"` marker makes that distinction testable while shell widths, control placement, brand treatment, and accessibility behavior remain aligned between the sites.

The four `content/docs/index*.mdx` sources render `components/docs-portal.tsx` inside the normal Fumadocs document layout. The portal deliberately keeps the document title and sidebar, then provides recommended task entry points, a five-step task route, and technical references. This keeps `/{lang}/docs/` useful without copying the marketing hero. The LCA portal exposes `data-docs-portal="lca-task-hub"` and `data-docs-portal-map="lca-task-route"`; the TIDAS site uses the same information hierarchy with a distinct system-module matrix.

The four `content/docs/quick-start/index*.mdx` sources render `components/quick-start-guide.tsx` as a category-level first-session route. It keeps the ordinary document shell, then sequences account access and an operation walkthrough before branching into a first data, authoring, or LCIA task. Completion cues make each stage testable, while account, FAQ, and support links remain a low-emphasis fallback. The `data-quick-start-guide="first-session-route"` and `data-quick-start-map="three-stage-onboarding"` markers distinguish this local onboarding path from the broader five-stage docs-root map.

The `overview`, `user-guide`, `data-collection`, `integration`, `openapi`, `deploy-and-dev`, `faq`, and `changelog` roots, plus the nested `data-collection/case-introduction` root, render `components/category-directory.tsx`. Each MDX variant supplies only its locale and category slug. The server component locates the category folder in `source.getPageTree(lang)`, preserves current `meta*.json` order, includes direct pages and folder index pages, and normalizes emitted links to locale-absolute trailing-slash URLs. Titles and descriptions are read from the child page; when description metadata is absent, a bounded first sentence is derived from `structuredData`. Future child-page additions, removals, renames, ordering changes, and copy updates therefore require no category-index edit.

## Content and locales

Chinese is the canonical authoring source. The same logical page uses:

```text
page.mdx
page.en.mdx
page.de.mdx
page.fr.mdx
```

All four variants must change together when structure, links, examples, or user-visible facts change. Locale metadata files follow the same suffix convention.

Authentication content is cross-page but not a second runtime. `integration/cli/**`, `integration/skills/**`, `integration/mcp-lca-remote*`, `user-guide/account-profile*`, and `openapi/tidas-package-import*` must describe the same browser OAuth, PKCE, registered-client, connected-app revoke, token-lifetime, headless, and service-identity facts. Remote LCA MCP pages additionally require client-local refresh, direct Supabase access JWT/JWKS verification, independent Edge `getClaims()`, and `auth.uid()` plus `client_id` RLS. With DCR disabled and Supabase not advertising authorization-response issuer support, every Codex locale must configure the top-level `mcp_oauth_callback_url` base and matching `mcp_oauth_callback_port` plus per-server `oauth.client_id`; Codex's deterministic callback ID must produce the byte-exact Supabase redirect registration. An unspecified ephemeral callback is not supported. The pages must not describe opaque broker tokens, encrypted server-side Supabase sessions, Redis OAuth state, or local authorization-server endpoints. `scripts/oauth-doc-contract.test.mjs` inventories those exact families and rejects both the broker architecture and LCA user API-key, demo, manual-token, or callback-omission setup. Server-side GLAD authentication remains independently owned.

Screenshot evidence is stored once under `public/assets/docs/<sha256-prefix>/<semantic-name>.png` and referenced through `/assets/docs/**` by the complete locale family. `scripts/check-screenshots.mjs` validates manifest bindings, references, image metadata, privacy evidence, and add/replace/reuse diff semantics. Replacement creates a new hash path and removes the previous asset only when no current MDX source still references it.

The CLI integration pages pin `@tiangong-lca/cli@0.1.8` and place a public-config-free browser login before any custom environment template. Production URL/key/client/callback/region values belong to the CLI, not to a duplicated docs or Skills configuration. Complete custom project settings and explicitly targeted headless tokens remain separate paths. The guard exercises executable examples and fixed callbacks without changing the remote MCP client-registration contract or site runtime.

## Reader-first tool guides

`integration/cli/index*.mdx` preserves the existing CLI entry URL and leads to installation, a real read-only query, result interpretation, and local validation before advanced authentication, automation, publishing, and maintenance. `integration/skills/` explains task instructions versus CLI execution, one independently installed search skill, a real task, catalogue prerequisites, safe operation, and troubleshooting. `integration/tidas/` owns native local installation, complete sample validation/conversion/roundtrip, and command/report reference; native package work is not a platform login workflow.

All 19 logical guide pages have complete zh/en/de/fr siblings and ordered locale metadata. Guide indexes have substantive reader content and remain in search/llms; only the existing generic category roots are excluded by `lib/ia.ts`. `DocsPortal` provides direct links to all three guides. Shared tutorial JSON lives under `public/assets/docs/tool-guides-v1/`; synthetic data is explicitly non-production and contains fictional references.

`lib/public-doc-inventory.mjs` derives route and index expectations from MDX filenames plus runtime i18n/category policy, rejects duplicate flat/folder-index URLs, and supplies explicit guide coverage. The build checks the retained minimum route/deny contracts as well as all current source routes, complete search/llms/sitemap sets, static search inclusion, and nested guide directories. Publication counts are not manually maintained.

`lib/layout.shared.tsx` supplies explicit German/French search, sidebar, language, copy, and theme labels where the upstream language package has no preset. Reader-facing navigation and search controls must not silently revert to English while the page content is localized.

## Build and publication

`scripts/build.mjs` performs this fail-closed sequence:

1. validate bounded Node 24, exact pnpm and TypeScript, deployment environment, and source identity;
2. run every Node environment/toolchain/link contract test;
3. run `next build` static export;
4. validate deterministic routes, endpoints, search records, AI index, SEO files, and greenfield deny paths;
5. validate source-locale link topology and every generated local page, fragment, and asset reference with browser URL semantics.

The package graph contains exact local markdownlint rather than dynamic npx installation. GitHub workflows retain reviewed Node `24.19.0`, exact pnpm `11.24.0`, and immutable executable action commits; local Node major `24`, EdgeOne `24.18.0`, and CI `24.19.0` all satisfy the same `>=24.18.0 <25` runtime contract.

The three retained `manifests/p0b/*.json` files are regression baselines for information architecture, expected routes, and retired-path denial, not regenerated page inventories. Ordinary additions leave them unchanged. An explicitly requested retirement replaces only the affected positive route entries with negative entries for every locale and adds exclusive media to the deny contract; it never relaxes unrelated checks or introduces redirects. Source-derived inventories remain authoritative for all current pages. One-time rewrite inventories and executors were removed after cutover; Git history remains the audit source.

EdgeOne Makers builds and deploys from Git. The managed Node runtime supplies pnpm, so `edgeone.json` invokes the frozen pnpm install directly without running `corepack enable`; Corepack setup remains a local contributor concern. GitHub workflows validate pull requests and first reconcile any allowlisted deployment against its source SHA and environment-specific indexing policy. Preview stays `noindex` and canonicalizes to production. Only the production origin can start the separate production-environment job that replaces Algolia data and refreshes Context7; preview reconciliation is validation-only.

## Ownership boundaries

- `tiangong-lca-next` owns product behavior, route truth, API semantics, and user-interface behavior.
- `tiangong-lca-next-docs` owns the public explanation and site implementation.
- `lca-workspace` owns the integrated child commit and completion state.

The four `integration/skills/foundry*.mdx` pages add a separate Foundry task-preparation route while preserving the original search tutorial. They describe the shipped-skill bootstrap boundary and public task inputs/status/recovery. Actual installation, catalogue provenance, official OAuth and released-runtime qualification are recorded under #193 and workspace #980. The final reviewed installation is checked by its skill fingerprint; a local preparation stopping point does not prove complete import. Exact source integration and external deployment/search refresh remain separate states.

The managed Foundry guide binds released Foundry 0.1.7 with CLI 0.1.13, Node 24.19.0, TIDAS 0.3.0 and merged Skills 0a33db1. Skills-specific login examples use CLI 0.1.13 and the independently installed current package fingerprint; the separate standalone CLI 0.1.8 and TIDAS 0.2.1 tutorials retain their existing owned baseline. Migration remains conservative for sealed/attempted/unclassified tasks, and task runtime binding can reject older readers even when workspace read compatibility is valid.

The shared navigation includes the independently owned PCR documentation library.
Chinese uses its default Chinese entry; English, German and French use the actual
English PCR entry, with the language identified for German/French readers. This
cross-site link does not create translated PCR routes or change this site's own
four-language content contract. PCR source and production remain owned by `pcr`.
