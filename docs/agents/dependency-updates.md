---
title: Documentation Dependency Updates
docType: guide
scope: repo
status: active
authoritative: false
owner: next-docs
language: en
whenToUse:
  - when reviewing dependency or GitHub Actions update pull requests
  - when changing monitoring scope, cadence or compatibility groups
whenToUpdate:
  - when dependency monitoring or its validation and review requirements change
checkPaths:
  - .github/dependabot.yml
  - docs/agents/dependency-updates.md
  - pnpm-lock.yaml
lastReviewedAt: 2026-10-16
lastReviewedCommit: dde833bbe8b90f4906887a47f591d5fcd0a124d0
lastReviewedNote: "Docs #219 reuses existing read-only PR validation for weekly monitoring; lock-only maintenance retains guidance without manufactured metadata edits, while manifest, runtime, public-content and publication contracts remain governed."
related:
  - ../../AGENTS.md
  - ./repo-validation.md
  - ../../.github/workflows/publish-docs.yml
---

## Dependency updates

Dependabot monitors the root pnpm graph on Mondays at 05:00 and GitHub Actions
at 05:20, both in Asia/Shanghai. Every entry has a seven-day cooldown. npm permits
two open version-update PRs and Actions permits one. The weekly version schedule
and cooldown do not delay security updates.

Compatible minor/patch updates are grouped for Fumadocs, React and its types,
styling packages, and remaining development tooling. Package major updates stay
individually visible; Next.js and Algolia updates remain independent. Actions
updates share one group. Automatic merging is not configured.

To match the approved Node 24 LTS runtime, npm ignores `@types/node` versions
`>=25.0.0` while retaining Node 24 updates; revisit this bound only with explicit
approval for a future Node major.

The existing `Validate (required check)` PR job already installs the frozen graph,
lints Markdown, typechecks, builds the CI static fixture and checks the vendored
SEO snapshot/output. It has read-only repository permission and does not run the
push-only production reconciliation jobs. Dependency PRs reuse this job without
adding validation or publication workflows. Local proof uses the existing commands:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
DEPLOY_ENV=ci CANONICAL_ORIGIN=http://localhost:3000 NEXT_PUBLIC_SEARCH_MODE=static pnpm build
```

The build includes the general Node tests, output contracts and link checks;
do not add a preceding duplicate test run. Screenshot-validator tests retain
their separately owned docs-impact scope. Runtime, pnpm, compiler and action pins,
and the exact reviewed release-age exceptions remain authoritative in their current
manifests and contracts. Monitoring does not qualify an upgrade or justify changing
those pins, four-locale public content, generated SEO-checker bytes, static-output
expectations or deployment/search settings to silence a failure.

Inspect actual manifest/lockfile changes and upstream release notes before
acceptance. Lock-only resolution maintenance requires the repository contract and
this guide to exist, without mandatory metadata edits. Manifest, workspace policy,
runtime, site source, public-content and publication changes retain their existing
Docpact review requirements; mixed changes still trigger those stricter rules.

This internal guide stays outside public content and AI indexes. Configuration
takes effect from `main`; passing local tests and merging configuration do not
prove that the first updater or lockfile update ran. Verify the actual update log,
resulting PR and repository security settings separately. Production hosting,
Algolia and Context7 reconciliation retain their existing boundaries.

References: [Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
and [version-update configuration](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-version-updates).
