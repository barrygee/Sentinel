# Accessibility audit — WCAG 2.2 AA (Phase 7)

**Date:** 2026-06-13
**Scope:** The Vue 3 SPA in `frontend/vue/` — all domains (Air, Space, SDR, Sea,
Land), the shared shell (header/nav, MapSidebar, AppFooter, SettingsPanel), and
the MapLibre map views.
**Type:** Read-only audit. This document records findings only — **no code was
changed.** Remediation is Phase 8.
**Target bar:** WCAG 2.2 Level AA.

## Method & limitations

This was a **static source audit** (semantic structure, accessible names, ARIA,
focus styling, form labelling, motion, and the canvas/map alternative), driven by
grepping the component tree and reading the relevant markup/CSS. It was **not**
supplemented here by a live axe/Lighthouse run or a manual VoiceOver/NVDA pass —
those require driving the running app and should be done in Phase 8 to confirm and
catch the ~60% of issues automated/static analysis can't (a *wrong* label, an
illogical focus order, an unannounced live update). Treat the severities below as
well-evidenced but verify the keyboard and screen-reader behaviour against the
running app before closing each item.

Several findings here are the **same pre-existing gaps that were deferred during
the test backfill** — the `jest-axe` `region` and `label` rules were disabled in
every component spec precisely because of items #2, #4 and #6 below. Phase 8 fixes
these and re-enables those rules.

## Summary of findings

| # | Finding | Severity | WCAG |
|---|---------|----------|------|
| 1 | Map canvas has no accessible name, role, or data/text alternative | **Critical** | 1.1.1, 4.1.2 |
| 2 | No visible focus indicator — `outline: none` (28×) with zero `:focus-visible` | **Critical** | 2.4.7, 2.4.13 |
| 3 | Form inputs not programmatically labelled (51 `<label>`, 1 `for=`; placeholder-as-label) | **Serious** | 1.3.1, 3.3.2, 4.1.2 |
| 4 | Icon-only buttons named via `title=` only (incl. all map controls) | **Serious** | 4.1.2, 1.4.13 |
| 5 | Dynamic updates not announced — no live regions (`aria-live` = 0) | **Serious** | 4.1.3 |
| 6 | No document structure — zero headings (`h1`–`h6`), no `<main>`, no skip link | **Serious** | 1.3.1, 2.4.1, 2.4.6 |
| 7 | Panels/menus are not dialogs — no `role="dialog"`, focus trap, Esc, or focus restore | **Serious** | 4.1.2, 2.4.3, 2.1.2 |
| 8 | Non-semantic clickables — `@click` on `<div>`/`<span>` (9×) | **Moderate** | 2.1.1, 4.1.2 |
| 9 | SPA route change doesn't move focus or update the page title | **Moderate** | 2.4.3, 2.4.2 |
| 10 | No `prefers-reduced-motion` handling across 27 animated components | **Moderate** | 2.3.3 (AAA), best practice |
| 11 | Disclosure/accordion state not exposed (`aria-expanded` = 0) | **Moderate** | 4.1.2 |
| 12 | Target-size and touch-target spacing not verified at AA (≥24×24px) | **Minor** | 2.5.8 |

Things already done **well** (keep these): `html lang="en"` and the viewport meta
are present; the logo `<img>` has a meaningful `alt="SENTINEL"`; the settings
toggles correctly use `role="switch"` **with** `aria-checked` (9×); `vue-router`'s
`<RouterLink>` emits `aria-current="page"` on the active nav item automatically.

---

## Findings in detail

### 1. Map canvas has no accessible alternative — **Critical**
**What.** The core UI of every domain is a MapLibre GL canvas mounted into a bare
`<div ref="containerRef" class="map-container" />` (`components/shared/MapLibreMap.vue`).
It has no `role`, no accessible name, and there is no text/data-table equivalent
for the information rendered on it (aircraft, satellites, passes, spectrum
markers). A WebGL canvas is entirely opaque to assistive technology.
**Where.** `components/shared/MapLibreMap.vue`; all `*Map.vue` views.
**Who.** Screen-reader users get nothing from the map — the primary content of the
app is invisible to them.
**WCAG.** 1.1.1 Non-text Content; 4.1.2 Name, Role, Value.
**Fix (Phase 8).** Give the map container an accessible name
(`role="application"`/`"img"` + `aria-label`, or a labelled region) and provide a
**data-table or list alternative** of the on-map entities for each domain (the
data already exists in the Pinia stores — e.g. a toggleable "list view" of
aircraft/satellites/passes), plus an `aria-live` region announcing key state
changes (see #5). Ensure map **controls** are real, named buttons (see #4).

### 2. No visible focus indicator — **Critical**
**What.** `outline: none` appears **28 times** across `SdrPanel.css`,
`SdrWaterfall.css`, `SettingsPanel.css`, `AirReplayPanel.css`, `AirFilter.vue`,
`SpaceFilter.vue`, `SpacePasses.css`, and two settings controls — with **zero**
`:focus-visible` rules anywhere in the codebase and only 5 files defining any
`:focus` style. Keyboard users cannot see where focus is.
**Where.** Repo-wide; see the `outline: none` hits above.
**Who.** Keyboard-only and low-vision users lose track of focus entirely.
**WCAG.** 2.4.7 Focus Visible; 2.4.13 Focus Appearance (2.2).
**Fix (Phase 8).** Remove blanket `outline: none`, or pair every suppression with
a clearly-visible `:focus-visible` style (a ≥2px ring with adequate contrast
against the dark theme). A global `:focus-visible` token in the shared
reset/tokens is the cheapest fix.

### 3. Form inputs not programmatically labelled — **Serious**
**What.** There are 50 `<input>`, 7 `<textarea>`, and 1 `<select>`, and 51
`<label>` elements — but only **one** `<label for=…>` association. Labels are
visually adjacent but not programmatically linked, and 27 `placeholder=`
attributes are used where placeholder appears to stand in for a label.
**Where.** SettingsPanel, SDR panels, Air/Space filter panels, settings controls.
**Who.** Screen-reader users hear "edit text" with no name; placeholder text
disappears on input and fails contrast.
**WCAG.** 1.3.1 Info & Relationships; 3.3.2 Labels or Instructions; 4.1.2.
**Fix (Phase 8).** Associate every control with its label via `for`/`id` (or wrap
the input in its `<label>`, or add `aria-label`/`aria-labelledby`). Keep
placeholders as *hints*, not labels. This is the deferred `jest-axe` `label` rule.

### 4. Icon-only buttons named via `title=` only — **Serious**
**What.** 168 `<button>`s but only 51 `aria-label`s; 32 buttons carry a `title=`
as their only name. Crucially, **every map control** built from
`SentinelControlBase` sets `this.button.title = this.buttonTitle` with no
`aria-label`, and the SDR/recordings panels have icon buttons (Tune, Stop,
Record, Download WAV/IQ, Play/Stop) labelled only by `title`. `title` is an
unreliable accessible name (some screen readers ignore it) and its tooltip is not
keyboard- or touch-accessible.
**Where.** `components/air/controls/sentinel-control-base/SentinelControlBase.ts`;
`SdrPanel.vue`, `SdrRecordingsSection.vue`, `SdrWaterfall.vue`.
**Who.** Screen-reader users hear "button"; sighted keyboard/touch users never see
the tooltip.
**WCAG.** 4.1.2 Name, Role, Value; 1.4.13 Content on Hover or Focus.
**Fix (Phase 8).** Add `aria-label` (keep `title` only as an optional visual
tooltip). For `SentinelControlBase`, set `button.setAttribute('aria-label', …)`
alongside (or instead of) `title`.

### 5. Dynamic updates are not announced — **Serious**
**What.** There are **no** `aria-live` regions (`aria-live` = 0). Notifications/
alerts (location-unavailable, overhead aircraft, satellite passes), connection
state (SDR connect/disconnect, connectivity online/offline), search result counts,
and streaming status all change the DOM silently.
**Where.** NotificationsPanel, App-level alert watches, SDR connection UI, Air/
Space search panels.
**Who.** Screen-reader users are never told that an alert fired or that a
connection dropped.
**WCAG.** 4.1.3 Status Messages.
**Fix (Phase 8).** Add a polite live region for status/notifications (and an
assertive one for errors/urgent alerts), and route status text through it.

### 6. No document structure — no headings, `<main>`, or skip link — **Serious**
**What.** The app renders **zero** heading elements (`h1`–`h6` all 0); panel and
section titles are styled `<div>`s. `<RouterView>` is not wrapped in a `<main>`
landmark (only `<header>`/`<nav>` exist in `App.vue`), and there is **no
skip-to-content link**.
**Where.** `App.vue` and every panel/view.
**Who.** Screen-reader users can't navigate by heading or landmark (a primary
navigation mode), and keyboard users can't skip the nav.
**WCAG.** 1.3.1 Info & Relationships; 2.4.1 Bypass Blocks; 2.4.6 Headings & Labels.
**Fix (Phase 8).** Add one `<h1>` per view, nest section headings without skipping
levels, wrap the routed view in `<main id="main">`, and add a skip link as the
first focusable element. This is the deferred `jest-axe` `region` rule.

### 7. Panels and menus are not dialogs — **Serious**
**What.** `SettingsPanel` and the teleported sidebar menus open as overlays but
are not exposed as dialogs: no `role="dialog"`, no `aria-modal`, no focus move-in
on open, no focus trap, no `Esc`-to-close convention, and no focus restoration to
the trigger on close (`role="dialog"`/`aria-modal` = 0).
**Where.** `components/shared/SettingsPanel.vue`, `MapSidebar.vue`, teleported menus.
**Who.** Keyboard and screen-reader users can tab "behind" the panel and lose
focus context.
**WCAG.** 4.1.2; 2.4.3 Focus Order; 2.1.2 No Keyboard Trap (the inverse — focus
should be *contained* while open, then released).
**Fix (Phase 8).** Use native `<dialog>` or apply the dialog pattern (role +
aria-modal + accessible name + focus trap + Esc + restore). See the skill's
`reference/aria-patterns.md`.

### 8. Non-semantic clickables — **Moderate**
**What.** 9 `<div>`/`<span>` elements have `@click` handlers (in
`SdrRecordingsSection.vue`, `SpaceTleOnlineControl.vue`, `AirFilter.vue`). Unless
each has `tabindex="0"`, a `role`, and a keydown handler, they're mouse-only.
**Where.** the three files above.
**Who.** Keyboard and screen-reader users can't reach or activate them.
**WCAG.** 2.1.1 Keyboard; 4.1.2.
**Fix (Phase 8).** Convert to `<button>` where the action warrants it; otherwise
add `role`, `tabindex`, and key handling. Verify each case individually.

### 9. SPA route change doesn't move focus or update the title — **Moderate**
**What.** Navigating between domains swaps `<RouterView>` content but focus stays
where it was and `document.title` is the static "SENTINEL" from `index.html`.
**Where.** `App.vue` / router.
**Who.** Screen-reader and keyboard users aren't told they navigated.
**WCAG.** 2.4.3 Focus Order; 2.4.2 Page Titled (per-view titles).
**Fix (Phase 8).** On each route change, set a per-view `document.title` and move
focus to the new view's `<h1>` (or a focusable container).

### 10. No `prefers-reduced-motion` handling — **Moderate**
**What.** 27 components define `transition`/`animation`/`@keyframes`, but no
`@media (prefers-reduced-motion: reduce)` rule exists anywhere.
**Where.** repo-wide CSS.
**Who.** Users with vestibular sensitivity / reduced-motion OS settings.
**WCAG.** 2.3.3 Animation from Interactions (AAA) — and a baseline best practice
under the global standards.
**Fix (Phase 8).** Add a global `@media (prefers-reduced-motion: reduce)` block
that dampens/removes non-essential motion (a shared token/reset is cheapest).

### 11. Disclosure/accordion state not exposed — **Moderate**
**What.** The app has several expand/collapse disclosures (sidebar panes, SDR/
Space accordions) but `aria-expanded` is used 0 times, so the open/closed state
isn't conveyed.
**Where.** MapSidebar, SpacePasses/SpaceFilter accordions, SDR panels.
**Who.** Screen-reader users don't know a section is expandable or its state.
**WCAG.** 4.1.2 Name, Role, Value.
**Fix (Phase 8).** Add `aria-expanded` + `aria-controls` to disclosure triggers.

### 12. Target size not verified — **Minor**
**What.** Several icon buttons (map controls, SDR transport, recordings actions)
are visually small; AA requires interactive targets ≥ 24×24 CSS px or adequate
spacing. Not measured in this static pass.
**Where.** map controls, SDR/recordings icon buttons.
**WCAG.** 2.5.8 Target Size (Minimum) (2.2).
**Fix (Phase 8).** Measure in the running app at mobile width; bump undersized
targets or add spacing.

---

## Recommended Phase 8 order

1. **Quick global wins** — `:focus-visible` token (#2), `prefers-reduced-motion`
   block (#10), `<main>` + skip link (#6 part).
2. **Names & labels** — `aria-label` on icon/map-control buttons (#4),
   `for`/`id` label associations (#3); then **re-enable the `jest-axe` `label`
   rule**.
3. **Structure** — headings per view, landmark regions (#6); then **re-enable the
   `jest-axe` `region` rule**.
4. **Dynamic & dialogs** — live regions (#5), dialog pattern for panels (#7),
   route-change focus/title (#9), `aria-expanded` (#11).
5. **Case-by-case** — non-semantic clickables (#8), target sizes (#12).
6. **Verify** — live axe + Lighthouse run and a manual keyboard + VoiceOver/NVDA
   pass to confirm fixes and catch what static analysis can't.
