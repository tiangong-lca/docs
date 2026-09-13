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
lastReviewedAt: 2026-09-13
lastReviewedCommit: c3eb31049b1d91dc9bb218d47bf133968003e74d
lastReviewedNote: "Reviewed for docs #199: canonical repository identity and active Skills/CLI links migrated across all four locales; the Context7 refresh binds the registered service key. No new content gaps introduced; existing backlog items unchanged."
related:
  - AGENTS.md
  - README.md
  - docs/agents/repo-architecture.md
---

## Docs/System Gap TODO

This is the durable repository-local backlog for differences between:

- public documentation in `tiangong-lca-next-docs`;
- shipped product behavior in `../tiangong-lca-next`.

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
- Root `/` renders the full default-language home without redirect compatibility.
- Generated routes, public endpoints, search records, AI index, metadata, local links, fragments, and assets are build-gated.
- Docs-impact screenshots are gated as shared content-addressed assets with complete four-locale MDX bindings and safe add/replace/reuse semantics.
- Visual changes require real-browser inspection at mobile, desktop, ultra-wide, light, and dark states.
- EdgeOne reconciliation validates source identity and indexing policy for both allowlisted origins; preview canonicalizes to production, and only production may mutate Algolia or Context7 state.
