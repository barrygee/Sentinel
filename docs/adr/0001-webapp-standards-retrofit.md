# 0001. Retrofit Sentinel to the webapp standards

Date: 2026-06-14
Status: accepted

## Context

Sentinel predates the team's current web-app standards — the conventions a
greenfield project now gets for free (Conventional-Commit changelog automation,
linting/formatting gates, CI, pre-commit hooks, a real test harness with a
coverage gate, accessibility to WCAG 2.2 AA, and onboarding docs). Because the
codebase grew before those defaults existed, it had:

- no automated CHANGELOG and no enforced commit/branch conventions;
- no shared linting/formatting configuration or CI gate, so style and quality
  drifted per author;
- no frontend test harness and effectively no test coverage on the Vue SPA — the
  largest files (`SdrPanel.vue` ~4.2k lines, `AdsbLiveControl` ~2.8k lines) were
  wholly untested, making any change high-risk;
- numerous accessibility gaps (no visible focus, unlabelled inputs and icon
  buttons, no landmarks/headings, no live regions, a map canvas opaque to
  assistive tech, no reduced-motion support);
- thin project documentation for a newcomer to set up, run, and contribute.

The forces at play: the app is actively maintained and shipping, so the retrofit
had to be incremental and non-breaking (no big-bang rewrite), had to keep CI
green at every step, and had to ratchet quality upward without ever regressing
it. The codebase also has three distinct tooling contexts (the Vue SPA under
`frontend/vue/` on vitest, root build helpers on jest, and the Python backend on
uv/ruff/pytest), so any standard had to be applied per-context rather than
globally.

## Decision

Retrofit Sentinel to the full webapp-standards baseline as a multi-phase effort,
**one branch + PR per slice off `main`**, each slice landing at 100% coverage of
its files with green CI, never committing to `main`. The nine phases:

1. **Changelog automation** — git-cliff + a GitHub Action that regenerates
   `CHANGELOG.md` per PR from Conventional Commits.
2. **Linting foundation** — ESLint + Prettier (JS/TS/Vue) and ruff (Python),
   with ruff-format as the gating Python formatter.
3. **Base CI** — `.github/workflows/ci.yml` running the per-context lint, type,
   and test gates.
4. **Pre-commit** — husky + lint-staged.
5. **Vue test harness** — vitest + @vue/test-utils + jest-axe + coverage.
6. **Frontend test backfill** — every store, util, composable, component, and
   view to 100%, with the vitest coverage threshold ratcheted upward after each
   slice until it reached a flat 100% gate.
7. **Accessibility audit** — a read-only static WCAG 2.2 AA audit (12 findings).
8. **Accessibility remediation** — fix all 12 findings (focus, names/labels,
   landmarks/headings, live regions, the modal-dialog pattern, the map's
   accessible name + data alternative, non-semantic clickables, target sizes),
   then remove the audit report.
9. **Docs sweep** — `CONTRIBUTING.md`, refreshed `README.md` and `CLAUDE.md`
   covering the three tooling contexts and the "what's enforced where" matrix.

A follow-up slice (8-7) added a real-browser `@axe-core/playwright` suite and
**wired it into the gating CI**, because jsdom/jest-axe physically cannot see
color-contrast, target-size, or `display:none`-hidden-label name gaps — and the
live pass immediately caught two genuine WCAG AA bugs that the component-level
tests had missed.

Two source bugs surfaced by the test backfill were fixed in-line (a satellite
heads-up scheduling infinite-recursion and a per-pass alert-dedup defect), and
dead code uncovered during testing was removed slice-by-slice.

## Consequences

**What this enables**

- The whole Vue frontend is now at 100% coverage with a 100% CI gate, so any
  regression in covered code fails the build. Large, previously-untouchable files
  are now safe to change.
- Accessibility is enforced, not aspirational: all 12 audit findings are
  remediated, and a real-browser axe suite gates every push/PR/merge in CI.
- Commits, changelog, linting, formatting, and types are all gated consistently
  across the three tooling contexts; a newcomer can go from clone to running app
  and passing tests from the README/CONTRIBUTING alone.

**What it costs / trade-offs**

- The 100% frontend coverage gate is strict. Genuinely unreachable defensive
  branches are excluded with justified `/* v8 ignore start … stop */` blocks
  rather than contrived tests; new code must ship with tests to that bar.
- The live axe CI step installs a Chromium binary and runs a browser e2e on every
  CI run, adding time and a cache dependency. It is intentionally **not** a
  pre-push husky hook (too heavy locally); CI is the gate.
- The committed `spa-dist` build artifact must be rebuilt whenever runtime DOM
  changes (it is pretty-printed by root lint-staged — the established repo
  pattern), adding a build step to a11y/runtime slices.

**Out of scope (deliberately not done here)**

- Release/version tagging, mypy `Mapped[T]` cleanup, and the sea/land domains.
- A manual VoiceOver/NVDA screen-reader pass on the running app — recommended
  before release; the axe-core/Playwright CI gate is the automated substitute,
  not a full replacement.
