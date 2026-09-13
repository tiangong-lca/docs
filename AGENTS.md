---
title: next-docs AI Working Guide
docType: contract
scope: repo
status: active
authoritative: true
owner: next-docs
language: en
whenToUse:
  - when changing public TianGong LCA documentation, navigation, search, screenshots, or site presentation
  - when deciding whether work belongs in next-docs, tiangong-lca-next, or lca-workspace
  - when routing from the workspace root into tiangong-lca-next-docs
whenToUpdate:
  - when public-site architecture, locale policy, validation, or ownership changes
  - when repo-local Docpact governance or publication behavior changes
checkPaths:
  - AGENTS.md
  - README.md
  - TODO.docs-system-gaps.md
  - .docpact/config.yaml
  - docs/agents/**
  - app/**
  - components/**
  - lib/**
  - content/docs/**
  - public/**
  - manifests/p0b/categories.json
  - manifests/p0b/site-routes.json
  - manifests/p0b/greenfield-deny.json
  - scripts/**
  - package.json
  - .nvmrc
  - next.config.ts
  - edgeone.json
  - crowdin.yml
  - context7.json
  - .github/workflows/**
  - .githooks/**
lastReviewedAt: 2026-09-13
lastReviewedCommit: c3eb31049b1d91dc9bb218d47bf133968003e74d
lastReviewedNote: "Reviewed for docs #199: canonical repository identity moves to tiangong-lca/docs; active Skills install/issue/clone links move to tiangong-lca/agent-skills and tiangong-lca/cli across all four locales; the reconcile Context7 refresh binds the registered service key /linancn/tiangong-lca-next-docs (overridable via vars.CONTEXT7_LIBRARY_NAME) instead of deriving from GITHUB_REPOSITORY. Pinned 0a33db1 references, historical release/tutorial versions, EdgeOne source links and the Context7 registration file are unchanged."
related:
  - .docpact/config.yaml
  - docs/agents/repo-architecture.md
  - docs/agents/repo-validation.md
  - README.md
  - TODO.docs-system-gaps.md
---

## Repository contract

`tiangong-lca-next-docs` owns the public TianGong LCA documentation site. It is a Next.js 16 App Router application using Fumadocs UI/MDX, TypeScript 7, pnpm, and fully static export. EdgeOne Makers owns build and deployment from Git.

## Load order

1. Read this contract.
2. Read `.docpact/config.yaml`.
3. Route intended paths with `scripts/docpact route --root <absolute-repo-root> --paths <paths> --format json`.
4. Read `docs/agents/repo-architecture.md` and `docs/agents/repo-validation.md` when site structure or validation is involved.
5. Read `README.md` for maintainer commands.
6. Read `TODO.docs-system-gaps.md` when product/documentation drift is involved.
7. Read every locale variant of a changed public page.

## Ownership

This repository owns:

- `content/docs/**` as public content using dot-locale files: Chinese `page.mdx`, then `page.en.mdx`, `page.de.mdx`, and `page.fr.mdx`;
- `app/**`, `components/**`, `lib/**`, and `app/global.css` for routing, metadata, the shared documentation presentation, search, and MDX rendering;
- `public/**` for public media and brand assets;
- `scripts/build.mjs`, `scripts/verify-out.mjs`, `scripts/check-links.mjs`, and `scripts/check-screenshots.mjs` for static output, link, and screenshot-evidence contracts;
- `TODO.docs-system-gaps.md` for durable product/documentation drift.

This repository does not own shipped product behavior, route truth, API semantics, or root integration state. Verify ambiguous behavior in `../tiangong-lca-next`; integrate the resulting child commit in `lca-workspace` separately.

## Runtime facts

- Supported locales are `zh`, `en`, `de`, and `fr`; every public page currently exists in all four.
- `/` renders the complete Chinese home as the `x-default` entry without redirecting. Locale homes remain `/{lang}/`; documents remain `/{lang}/docs/**`.
- Retired paths have no redirect or rewrite compatibility and must remain 404. `manifests/p0b/greenfield-deny.json` is a negative build contract, not a mapping table.
- Public document links use locale-absolute `/{lang}/docs/**/` routes. The link gate checks browser-resolved output, canonical trailing slashes, source-locale ownership, and the normalized internal-link topology across all four variants of a page.
- Docs-impact screenshots use one shared `public/assets/docs/<sha256-prefix>/<semantic-name>.png` asset and explicit zh/en/de/fr document bindings. Added and replaced screenshots must pass the repository validator; replacement never overwrites an existing content-addressed path.
- `SiteBrand`, `DocsHome`, and the Fumadocs Neutral theme define the shared documentation shell. Keep both documentation sites aligned on the 72rem shell, brand-lockup structure, solid plum interaction color, neutral layers, focus treatment, dark mode, low-radius controls, and responsive behavior.
- Product identity belongs in a semantic hero signature rather than a shared decorative motif. This site uses `data-hero-signature="lca-concept-map"` for the reference-data → process-relations → product-system → LCIA-results concept map; TIDAS must retain a distinct data-system/schema signature.
- `/{lang}/docs/` is a task-navigation hub rendered by `DocsPortal`, not a second marketing landing or a directory placeholder. Its governed markers are `data-docs-portal="lca-task-hub"` and `data-docs-portal-map="lca-task-route"`; all links must remain locale-absolute and structurally aligned across four languages.
- `/{lang}/docs/quick-start/` is a focused first-session route rendered by `QuickStartGuide`. It uses `data-quick-start-guide="first-session-route"` and `data-quick-start-map="three-stage-onboarding"` to connect account access, the operation walkthrough, and one real first task without duplicating the broader docs hub.
- The remaining top-level category roots render `CategoryDirectory` from only `lang` and `category`. Directory order and membership come from the localized Fumadocs page tree / `meta*.json`; titles and descriptions come from child-page metadata, with a bounded first-paragraph fallback. Never hand-maintain category entry lists in index MDX.
- Reader-facing tool documentation is split into `integration/cli/`, `integration/skills/`, and `integration/tidas/`. Their substantive index pages remain searchable and use `CategoryDirectory` for ordered chapters; they are not generic category-index exclusions. The docs hub links to all three. Tutorials provide complete inputs, prerequisites, expected results, and stopping points separately from advanced publishing and maintenance references.
- Reuse exported Fumadocs primitives such as `buttonVariants`, `Card`, and `Cards`. Custom presentation is limited to theme tokens, the shared shell, and product-specific concept or navigation figures; do not add gradients, glow, shadow, or lift animation to public actions.
- `next.config.ts` sets `agentRules: false` because this governed file, not generated development-server text, is authoritative.
- The runtime contract accepts Node `>=24.18.0 <25` while pnpm `11.24.0` and TypeScript `7.0.2` remain exact. `.nvmrc` selects Node major `24`, EdgeOne pins its preinstalled `24.18.0`, and reviewed GitHub workflows use Node `24.19.0`; every selector must satisfy the bounded contract before static generation.
- EdgeOne's managed Node runtime already supplies pnpm. Its install command runs `pnpm install --frozen-lockfile` directly; do not run `corepack enable` in the managed build because that mutates shims beside the platform-owned Node executable. Local contributor setup may still enable Corepack.
- Markdown lint uses the exact local `markdownlint-cli2` dependency through `pnpm exec`. Active repository automation has no npm/npx fallback, and every external GitHub Action is pinned to a reviewed executable commit rather than a tag object or moving tag.
- Public AI retrieval is derived at build time through `/llms.txt` and `/search-records.json`; internal governance files remain excluded by `context7.json`.
- `lib/public-doc-inventory.mjs` derives complete HTML, search, sitemap, and AI expectations from four-language MDX using the runtime locale/category policies. Ordinary additions do not change the retained route/deny baselines or hard-coded page counts. An explicitly requested retirement must remove only the retired positive routes, add every locale URL and exclusive asset to the deny contract, and prove their absence from sources, search, static output, and the deployed site. All unrelated baseline requirements remain intact.
- The four CLI, remote LCA MCP, account-profile, and TIDAS-import locale families share one OAuth contract: human browser authorization, exact registered clients/callbacks, PKCE, client-local refresh rotation, direct Supabase access JWTs, downstream `auth.uid()` plus `client_id` authorization, local/connected-app revoke distinction, explicit headless limits, and no broker/Redis session, password/code/token/API-key handoff to AI. Codex uses the top-level callback base and listener port plus its deterministic MCP-server callback ID; its resulting redirect must equal the Supabase registration.
- Native TIDAS guides use official v0.2.1 with Linux glibc x64/arm64, macOS Apple Silicon arm64 and Windows x64 archives. macOS Intel, Linux musl and Windows arm64 are unsupported; active instructions never recommend a historical Intel release.
- Official Production CLI onboarding starts with pinned published CLI 0.1.8 and no public environment setup. The CLI owns the public URL/key/client/callback profile; docs and Skills must not copy its values. Only complete custom environments may override it; a headless token always requires an explicit destination/key. CLI defaults do not change remote MCP registrations or local publish approval gates.
- Reconciliation has two trust boundaries: production validates indexability and then enters the GitHub production environment for Algolia/Context7 mutation; preview validates `noindex`/robots plus production-canonical policy in a separate job path that cannot access those mutation steps.

## Required commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm check:links
DEPLOY_ENV=ci CANONICAL_ORIGIN=http://localhost:3000 NEXT_PUBLIC_SEARCH_MODE=static pnpm build
```

`pnpm build` runs bounded Node 24 plus exact package-tool environment validation, the general Node contract/link tests, static export, output-contract verification, and source/generated link validation. Screenshot-validator tests intentionally remain outside `pnpm test`, `pnpm build`, pull-request CI, and release CI; only the docs-impact mapped/replay worker runs `pnpm test:screenshots` before validating a visual manifest. For visual changes, also inspect light and dark themes at 390px, 1440px, the 1633px large-desktop regression width, and an ultra-wide viewport using a real browser.

## Hard boundaries

- Keep all four locale variants aligned in the same change.
- Do not add redirects, rewrites, or compatibility copies for retired routes.
- Do not expose internal agent, plan, incident, TODO, or governance documents through public AI indexes.
- Do not add LCA user API-key generation in any locale, OAuth demo/code-copy, manual MCP bearer-paste, or password-to-AI instructions. The executable guard must retain negative fixtures for English, Chinese, German, and French generation phrases. Server-side GLAD keys remain a separately owned surface.
- Do not introduce npm/npx execution, a second lockfile, movable external action references, or a second compiler generation.
- Do not treat a successful child merge as workspace delivery completion while the root gitlink remains stale.
- Record partial product/documentation drift in `TODO.docs-system-gaps.md` during the same session.
- Run strict Docpact validation and lint for governance changes.

## Workspace integration

A merged PR here is repository-complete only. Delivery completes after the exact eligible child commit is deliberately pinned and validated in the workspace root.

## Local Docpact push gate

Install the versioned hook once per checkout:

```bash
./scripts/install-git-hooks.sh
```

The pre-push hook delegates to `scripts/docpact-gate.sh`, validates configuration strictly, and lints against `origin/main` unless an explicit base is supplied.

The managed Foundry guide binds released Foundry 0.1.7 with CLI 0.1.13, Node 24.19.0, TIDAS 0.3.0 and merged Skills 0a33db1. Skills-specific login examples use CLI 0.1.13 and the independently installed current package fingerprint; the separate standalone CLI 0.1.8 and TIDAS 0.2.1 tutorials retain their existing owned baseline. Migration remains conservative for sealed/attempted/unclassified tasks, and task runtime binding can reject older readers even when workspace read compatibility is valid.
