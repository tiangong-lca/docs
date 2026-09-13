---
title: TianGong LCA Docs README
docType: guide
scope: repo
status: active
authoritative: true
owner: next-docs
language: en
whenToUse:
  - when setting up or maintaining the public Next.js and Fumadocs documentation site
  - when choosing local validation commands for static output, links, search records, or AI indexes
whenToUpdate:
  - when setup, validation, locale, publication, or search reconciliation changes
checkPaths:
  - AGENTS.md
  - .docpact/config.yaml
  - docs/agents/**
  - package.json
  - .nvmrc
  - next.config.ts
  - edgeone.json
  - app/**
  - components/**
  - lib/**
  - content/docs/**
  - public/**
  - scripts/**
  - context7.json
  - crowdin.yml
  - .github/workflows/**
lastReviewedAt: 2026-09-13
lastReviewedCommit: c3eb31049b1d91dc9bb218d47bf133968003e74d
lastReviewedNote: "Reviewed for docs #199: canonical repository identity moves to tiangong-lca/docs; active Skills install/issue/clone links move to tiangong-lca/agent-skills and tiangong-lca/cli across all four locales; the reconcile Context7 refresh binds the registered service key /linancn/tiangong-lca-next-docs (overridable via vars.CONTEXT7_LIBRARY_NAME) instead of deriving from GITHUB_REPOSITORY. Pinned 0a33db1 references, historical release/tutorial versions, EdgeOne source links and the Context7 registration file are unchanged."
related:
  - AGENTS.md
  - .docpact/config.yaml
  - docs/agents/repo-architecture.md
  - docs/agents/repo-validation.md
---

## TianGong LCA Docs

Public documentation for the [TianGong LCA](https://lca.tiangong.earth) platform, built with Next.js 16, Fumadocs 16, React 19, and TypeScript 7. The site exports completely static output and EdgeOne Makers builds and deploys it from Git.

## Locales and routes

- `zh` — canonical authoring source
- `en`, `de`, and `fr` — maintained full-page translations
- `/` — complete Chinese `x-default` home, rendered directly without redirect
- `/{lang}/` — locale home
- `/{lang}/docs/**` — locale documentation

Source files use dot-locale names: `page.mdx`, `page.en.mdx`, `page.de.mdx`, and `page.fr.mdx`. Missing translations do not fall back to another language.

## Public tool guides

- [CLI user guide](https://docs.tiangong.earth/en/docs/integration/cli/): install, sign in, query, and understand results before advanced operations.
- [Agent Skills guide](https://docs.tiangong.earth/en/docs/integration/skills/): install one standalone skill, execute a read-only task, and check prerequisites and permissions.
- [Local tidas tools](https://docs.tiangong.earth/en/docs/integration/tidas/): native installation, local validation, conversion, and reports without platform sign-in.

These are four-language guides with separate tutorials and references. `lib/public-doc-inventory.mjs` derives complete publication coverage from sources, so new chapters must appear in navigation, static/production search, llms, sitemap, and HTML without editing frozen page totals. Maintainer validation is separate from reader-facing CLI installation.

## Development

Requires Node.js `>=24.18.0 <25` and pnpm `11.24.0`. `.nvmrc` selects the current
local Node 24 release, EdgeOne pins its preinstalled `24.18.0`, and reviewed
GitHub workflows use Node `24.19.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

The development server normally listens on `http://localhost:3000`.

## Validation

```bash
pnpm lint
pnpm typecheck
pnpm test

DEPLOY_ENV=ci \
CANONICAL_ORIGIN=http://localhost:3000 \
NEXT_PUBLIC_SEARCH_MODE=static \
pnpm build
```

The build wrapper performs environment validation, `next build`, deterministic output verification, and generated HTML link/fragment/asset checking. A successful build currently validates all locale routes, public endpoints, search and AI records, SEO files, Open Graph images, negative retired paths, and internal-content exclusion.

Docs-impact visual manifests are validated with `pnpm check:screenshots -- --manifest <visual-result.json> --diff-file <name-status> --base-ref <ref> --json`. The validator requires one content-addressed public PNG, explicit zh/en/de/fr MDX bindings, valid references and explanatory prose, verified image/privacy metadata, and safe add/replace/reuse diff semantics.

`pnpm test:screenshots` is a dedicated validator test suite used only by the docs-impact mapped/replay worker when visual evidence is present. It is intentionally not included in `pnpm test`, the `pnpm build` wrapper, pull-request CI, or release CI.

## Build environment

| Variable | Contract |
| --- | --- |
| `SOURCE_COMMIT` | 40-character source SHA; derived from Git when omitted locally |
| `SOURCE_DATE_EPOCH` | Source commit time; derived from Git when omitted locally |
| `DEPLOY_ENV` | `ci`, `preview`, or `production` |
| `CANONICAL_ORIGIN` | Production must use `https://docs.tiangong.earth` |
| `NEXT_PUBLIC_SEARCH_MODE` | `static` for CI/preview or `algolia` for production |

## Publishing and reconciliation

EdgeOne Makers owns build and deployment. GitHub Actions validates pull requests, waits for the deployed source SHA after a main update, validates public endpoints, replaces the Algolia index from the deployed `search-records.json`, and requests Context7 refresh.

Writing credentials stay in the GitHub production environment and never enter the static bundle. The browser receives only the restricted search configuration required by production search.

The manual preview reconciliation choice is validation-only: it requires preview `Disallow: /`, page `noindex`, and production-origin canonical/sitemap URLs so preview never becomes a competing canonical site. Its production-state job is skipped, so preview records cannot replace production Algolia data or request a Context7 refresh.

## Repository layout

```text
app/             routes, metadata, public endpoints, and shared neutral theme tokens
components/      shared brand/home, LCA concept map, search, MDX, and media components
content/docs/    four-locale dot-suffix MDX sources
lib/             locale, source, metadata, information architecture, layout options
public/          brand and documentation media
manifests/p0b/   retained deterministic route, category, and negative-path contracts
scripts/         build, output, link, search, and Docpact validation
docs/agents/     internal architecture, validation, and operations references
```
