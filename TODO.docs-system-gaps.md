---
title: Docs/System Gap TODO
docType: backlog
scope: repo
status: active
authoritative: false
owner: next-docs
language: en
whenToUse:
  - when durable drift is found between public documentation and shipped TianGong LCA behavior
  - when validation reveals a user-facing documentation gap that cannot be completed in the current change
whenToUpdate:
  - when a gap is discovered, reprioritized, verified, completed, or moved to a tracked issue
checkPaths:
  - TODO.docs-system-gaps.md
  - content/docs/**
  - app/**
  - components/**
  - lib/**
lastReviewedAt: 2026-09-16
lastReviewedCommit: 2168af06c6c9e21b97d94093f008bbdfa1c37e5e
lastReviewedNote: "Reviewed for docs #210: the maintenance baseline now records the canonical Chinese home with its single `/zh/` redirect alias, the build-gated canonical/hreflang/sitemap metadata with omitted `lastmod` and reported content debt, and the environment-supplied provider verification marker. The shared SEO checker reaches CI as a generated snapshot verified against its manifest, with no private action or token. No new product/documentation drift is known; the EdgeOne-layer redirect proof and production samples remain delivery items rather than product drift."
related:
  - AGENTS.md
  - README.md
  - docs/agents/repo-architecture.md
---

## Docs/System Gap TODO

This is the durable repository-local backlog for differences between:

- public documentation in `tiangong-lca-next-docs`;
- shipped product behavior in `../platform`.

GitHub issues and pull requests own tracked delivery. This file is for newly discovered product/documentation drift that is not yet represented by an executable issue.

## Rules

- Verify ambiguous behavior in the product repository or live product before documenting it.
- Identify the affected product file or route and all four public locale files.
- Record the user impact, expected documentation outcome, and verification evidence.
- If the gap is partially addressed, keep the remaining work here or move it to a tracked issue during the same session.
- Remove completed detail after the durable issue or pull request contains the resolution; Git history preserves the timeline.

## Active backlog

No active repository-local documentation drift is known after Issue #182. The tool guides explicitly disclose standalone Skill portability, moving-source fingerprints, native output-path requirements, and validation limits; documented upstream constraints are not promises of capabilities the products do not provide.

## Current maintenance baseline

- Four complete locales: Chinese source plus English, German, and French translations.
- Root `/` renders the full default-language home; `/zh/` is a permanent provider redirect to it and no other redirect compatibility exists, while retired paths keep their 404s.
- Canonicals, hreflang, the sitemap and Open Graph metadata are build-gated: each canonical URL is listed once with reciprocal alternates, `lastmod` is omitted rather than faked from one build epoch, and pages without a page-specific description are reported as editorial content debt instead of being filled with a site-level default.
- Provider ownership verification is environment-supplied and gated exactly: a configured code is published verbatim and an unset environment must publish no marker.
- Generated routes, public endpoints, search records, AI index, metadata, local links, fragments, and assets are build-gated.
- The required-check job additionally runs the generated shared SEO checker snapshot (`scripts/vendor/workspace-seo/`, checked against its manifest) over the already-built `out/`. That snapshot is generated tooling from the private workspace source: it is consumed read-only and replaced only by a workspace-side export, never by a local edit.
- Docs-impact screenshots are gated as shared content-addressed assets with complete four-locale MDX bindings and safe add/replace/reuse semantics.
- Visual changes require real-browser inspection at mobile, desktop, ultra-wide, light, and dark states.
- EdgeOne reconciliation validates source identity and indexing policy for both allowlisted origins; preview canonicalizes to production, and only production may mutate Algolia or Context7 state.
