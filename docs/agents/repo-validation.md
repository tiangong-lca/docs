---
title: next-docs Validation Guide
docType: guide
scope: repo
status: active
authoritative: true
owner: next-docs
language: en
whenToUse:
  - when validating public content, navigation, presentation, metadata, search, publishing, or governance changes
  - when selecting proof for a next-docs pull request
whenToUpdate:
  - when package scripts, output contracts, browser coverage, or CI behavior change
checkPaths:
  - AGENTS.md
  - .docpact/config.yaml
  - package.json
  - .nvmrc
  - scripts/build.mjs
  - scripts/check-env.mjs
  - scripts/*.test.mjs
  - scripts/verify-out.mjs
  - scripts/check-links.mjs
  - scripts/check-links.test.mjs
  - scripts/check-screenshots.mjs
  - app/**
  - components/**
  - lib/**
  - content/docs/**
  - public/**
  - context7.json
  - .github/workflows/**
  - .githooks/**
lastReviewedAt: 2026-09-14
lastReviewedCommit: 8b7e7f75bdd17f3c5f52eef8666f26f6d3967208
lastReviewedNote: "Reviewed for docs #203 / workspace #1154: four-language FAQ and review-queue search explanations follow exact Platform PR1054 source. Existing solver-snapshot provider semantics, status imagery, routes and runtime remain unchanged. Lint, typecheck,13 screenshot-validator tests and full static build pass; public merge awaits Database642 Main qualification."
related:
  - AGENTS.md
  - .docpact/config.yaml
  - docs/agents/repo-architecture.md
---

## Validation guide

## Canonical commands

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
DEPLOY_ENV=ci CANONICAL_ORIGIN=http://localhost:3000 NEXT_PUBLIC_SEARCH_MODE=static pnpm build
```

`pnpm build` includes fail-closed bounded Node 24 and exact package-tool/environment validation, the general Node contract/link tests, static export, `verify:out`, and `check:links`. Screenshot-validator tests intentionally remain outside `pnpm test`, `pnpm build`, pull-request CI, and release CI. Use `pnpm test:env`, `pnpm test:toolchain`, or `pnpm test:links` for regular focused diagnosis; the docs-impact mapped/replay worker owns `pnpm test:screenshots` when visual evidence is present.

## Proof by change type

- Public content: update all four locale variants; run lint and the complete build.
- Reader-first tool guides: `scripts/tool-guides.test.mjs` and `scripts/public-doc-inventory.test.mjs` cover the 19-page/four-language structure, complete JSON inputs, tool separation, published versions, duplicate URL rejection, and search inclusion. Execute published CLI OAuth/list/get/search and independent Skill installation in an isolated session; test positive/negative local CLI validation and native tidas validation/conversion/roundtrip. Record actual outputs and scope without credentials. Reader review must cover installation, client discovery, empty/error states, immediate exit checks, and the distinction between read-only, preflight, write, and readback. Preserve advanced material but remove unsupported command examples.
- CLI first-install onboarding: the first executable `auth login` example must pin verified 0.1.8, precede custom templates, and contain no required public env assignments. Every locale retains the exact CLI loopback callback, explicit headless destination/key/mode, private sessions, and revocation limits. `scripts/oauth-doc-contract.test.mjs` rejects missing/unpinned login examples; release evidence must separately prove the real published CLI and installed Skills.
- LCA authentication content: run `scripts/oauth-doc-contract.test.mjs`; prove CLI/MCP/account/OpenAPI locale families contain OAuth/PKCE/revoke/headless facts, every remote MCP locale contains direct Supabase access JWT/JWKS, client-local refresh, Claude Code, Codex, Edge `getClaims()`, and `auth.uid()` plus `client_id` RLS. Every Codex example must use top-level `mcp_oauth_callback_url` and `mcp_oauth_callback_port`, a per-server public `oauth.client_id`, and the MCP `oauth_resource` before `codex mcp login`; the documented base plus deterministic server callback ID must equal the registered Supabase redirect. Command-only setup with an unspecified callback is forbidden. Also prove no locale contains the retired broker architecture, LCA API-key assignment, demo, or manual bearer setup; reject the executable zh/en/de/fr forbidden-generation fixtures and six forbidden credential screenshots. Then run lint, links, and the complete build.
- Toolchain, package manager, environment checker, or CI actions: run a clean frozen install, `pnpm test:env`, `pnpm test:toolchain`, lint, typecheck, and the complete static build. Node must satisfy `>=24.18.0 <25`; EdgeOne must use `24.18.0` plus direct `pnpm install --frozen-lockfile`, local `.nvmrc` must select major `24`, reviewed GitHub workflows remain on `24.19.0`, pnpm stays exactly `11.24.0`, TypeScript exactly `7.0.2`, and markdownlint exactly local `0.23.2`; external actions must use reviewed executable commit SHAs.
- Links, anchors, navigation, or assets: run link unit tests and the complete build. `check:links` must report zero missing pages, fragments, or local assets, zero path-relative document links, zero source-locale mismatches, and identical normalized internal-document target sets across the four variants of each page.
- Docs-impact screenshots: the mapped/replay worker runs `pnpm test:screenshots`, then invokes `pnpm check:screenshots -- --manifest <visual-result.json> --diff-file <name-status> --base-ref <ref> --json`. Added assets must be content-addressed and referenced by all four locale siblings; replacement must use a new hash path and may delete the old asset only after all remaining MDX references are gone; reuse must not mutate the asset.
- Layout, CSS, brand, search dialog, or responsive behavior: run typecheck and build, then inspect a real browser at 390px, 1440px, 1633px, 2048px, and 2560px in light and dark themes. Confirm keyboard focus, language switching, search, mobile menu, and zero horizontal overflow.
- Landing visual and entry-point contract: assert `data-hero-signature="lca-concept-map"`, exactly one `data-primary-action`, one `data-home-technical` group with exactly two locale-aligned `data-home-technical-link` routes, one safe external action to the TianGong LCA platform, and a single semantic HTML `main`. The external action must open a new browsing context with both `noreferrer` and `noopener`; the primary action must compute to `background-image: none`, `box-shadow: none`, and `transform: none`; the Next signature must not match the TIDAS hero signature.
- LCA concept geometry: while the hero is in two-column mode, the rightmost rendered title glyph must remain inside `[data-hero-copy]` and at least 24px away from `[data-concept-map]`; `[data-concept-connector]` must retain a rendered stroke width of at least 1.2px.
- Documentation-root hub: all four `/{lang}/docs/` outputs must contain `[data-docs-portal="lca-task-hub"]` and `[data-docs-portal-map="lca-task-route"]`; each portal link must remain inside its locale, resolve successfully, remain visible at 390px, and produce no horizontal overflow at 390px, 1440px, 1633px, 2048px, or 2560px in light and dark themes.
- Quick-start route: all four `/{lang}/docs/quick-start/` outputs must contain `[data-quick-start-guide="first-session-route"]`, `[data-quick-start-map="three-stage-onboarding"]`, one solid application entry action, and the same canonical onboarding/task targets. Browser proof must show readable completion cues, visible keyboard focus, no fixed-height overlap in German or French, and no horizontal overflow at the standard five widths in both themes.
- Automatic category directories: all 48 localized directories (the nine existing category directories plus the three tool-guide roots, across four locales) must expose `[data-category-directory]` and a `data-category-count` equal to the non-index entries in their localized `meta*.json`. Every meta target must be emitted in order with a localized title and non-empty metadata or first-paragraph summary. Browser proof must cover the two-column User Guide and a nested-folder category, with no self-links, empty grid cells, overlap, or horizontal overflow.
- Source-derived publication inventory: search records and llms must equal the full indexable MDX URL set; the sitemap must equal every real source page plus locale and default landing pages. Static search must parse the advanced multilingual `docs.docs` store, require exact normalized URLs from `type: page` records, and validate their locale. Substring matches, child URLs, heading/text links, and token/ID metadata cannot prove a missing guide root. Keep the parent-missing/child-present regression and malformed-store/locale tests. Static page records must equal the full source inventory, and retired URLs must be absent from page, heading, and text records. Verify guide discovery in production locale-filtered Algolia. Ordinary additions leave the retained route and retired-path baselines unchanged.
- Explicit chapter retirement: remove every locale source, navigation entry, and public reference; remove exclusive media only after checking retained sources. Move precisely those positive route entries to the deny contract, preserving unrelated requirements and shared assets. `scripts/public-doc-inventory.test.mjs` guards the retired Knowledge Base MCP family and retained LCA/CLI/Skills/tidas routes. The deployment reconciliation checks all four retired URLs and four exclusive screenshots return HTTP 404 before production search/AI refresh. No redirects, compatibility copies, or service/infrastructure retirement are implied.
- Metadata or route changes: inspect generated HTML for canonical, `x-default`, all real locale alternatives, and Open Graph image metadata; confirm sitemap entries and negative 404 contracts.
- Production publishing or search reconciliation: run the complete build, verify deployed `/llms.txt` and `/search-records.json` expose the expected SHA, assert indexable robots/canonical metadata, then confirm locale-isolated Algolia search.
- Preview reconciliation: assert the same deployed SHA but require `Disallow: /`, page `noindex`, and production-origin canonical/sitemap URLs; confirm the production-state job is skipped.
- Governance: validate and lint Docpact after the implementation diff is final.

## Docpact

```bash
scripts/docpact validate-config --root . --strict --format json
scripts/docpact lint --root . --base origin/main --head HEAD --mode enforce --format json
```

Use an absolute root when invoked outside the repository. Save a report only when diagnostics need drill-down.

## Local pre-push gate

```bash
./scripts/install-git-hooks.sh
```

The hook runs strict configuration validation and enforced documentation-governance lint against `origin/main` by default.

Foundry guide CI checks all four localized navigation entries and requires every task-start example to equal the exact qualified public specimen. Maintainer qualification parses that specimen through the published Foundry 0.1.7 public parseFoundryTaskStartSpec export; changing the specimen requires repeating that owner-parser check. CI rejects any locale or field drift without copying the runtime validator. The full build must include the new routes in static output, links, search/llms and sitemap. Rendered preparation pages, actual F1/C1/Skills installation, official login and bounded end-to-end task evidence are recorded in #193 and workspace #980; new changes rerun affected checks.

The managed Foundry guide binds released Foundry 0.1.7 with CLI 0.1.13, Node 24.19.0, TIDAS 0.3.0 and merged Skills 0a33db1. Skills-specific login examples use CLI 0.1.13 and the independently installed current package fingerprint; the separate standalone CLI 0.1.8 and TIDAS 0.2.1 tutorials retain their existing owned baseline. Migration remains conservative for sealed/attempted/unclassified tasks, and task runtime binding can reject older readers even when workspace read compatibility is valid.

## Context7 service key and source repository identity

The Context7 refresh in `reconcile-docs.yml` posts `libraryName` to the provider refresh API. The verified migrated service key is `/tiangong-lca/docs`, matching the public library's canonical GitHub source. Production recovery for docs #201 confirmed that the old key returns HTTP 400 with an explicit repository-moved response; an old library remaining discoverable does not prove it can still be refreshed. Both the workflow default and `context7.json` registration URL use the verified new key. The public ownership key remains unchanged.

The workflow rejects values outside the two-segment `/owner/repo` form before building the request and honors `vars.CONTEXT7_LIBRARY_NAME` for another provider-verified key. Repository identity governs Git admission and Docpact independently of that override. Production refresh runs only in the `production` environment on `main`-derived reconciliation; preview runs never write. A queued refresh or rate-limit response is recorded as such and does not by itself prove ingestion of the latest source.
