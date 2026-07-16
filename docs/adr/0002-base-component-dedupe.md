# 0002. Dedupe the Vue SPA onto base components (B-series)

Date: 2026-07-12
Status: accepted

## Context

Two exhaustive inventories of `frontend/vue/src` (2026-07-12, following the
SdrPanel decomposition series P0–P7, PRs #190–#197) found substantial UI
duplication that the existing 13-primitive `components/base/` layer does not
yet absorb:

- **Teleported dropdown pattern:** five SDR pickers (`SdrStepPicker`,
  `SdrSampleRatePicker`, `SdrDeviceSelector`, `SdrSettingsAccordion`,
  `SdrTrunkSection`) carried near-verbatim copies of the same menu state,
  positioning, settle-window scroll dismissal and listener registrations
  (~250 script lines + ~90 template lines). The settings panel re-implements
  the same visual a second way (`tle-dropdown`, 3 files) and `AirReplayPanel`
  a third way with hand-rolled dismissal.
- **Accordion headers:** 5 byte-identical copies of the SDR header-row +
  chevron toggle, plus 2 near-copies in `SdrFrequencyManagerTab`.
- **Pills/chips/segmented toggles:** ~25 instances (`sdr-mode-pill` ×10+ incl.
  the tune/stop/rec/decode transport buttons, scan group chips, pass category
  chips, `settings-source-override-btn` shared across two settings files,
  `SdrDeviceForm` ENABLED/DISABLED, replay speed pills).
- **Icon row-actions:** ~15 tooltip'd action buttons across
  `AirFilter`/`SpaceFilter`/`SpacePasses`/`SdrRecordingsSection`/
  `SdrDecodeDock` using the exact `data-tooltip` mechanism `BaseIconButton`
  centralises, but in a non-rail shape; plus bare-glyph row actions and 4
  identical "clear search ✕" buttons.
- **Underadopted primitives:** `BaseListItem` has zero importers despite 6+
  hand-rolled row sites shaped like it; ~7 files re-implement the same
  empty-state/hint label.
- **Other:** 3 unrelated custom-checkbox families; 4 near-identical slider
  rows; ~90 duplicated lines (formatters + RADIO grid template) between
  `SpaceFilter` and `SpacePasses`; `SdrPanel.css` (3,889 lines, global)
  styling 10 components that own no styles.

## Decision

Eliminate the duplication in a phased **B-series** — one small PR per phase,
shared logic before primitives, primitives before adoptions. Variants compose
a base (slots + props + CSS custom-property hooks); they never copy it.

| Phase | Deliverable | Removes |
|---|---|---|
| B0 | `useTeleportedMenu()` composable adopted by the 5 SDR pickers | ~250 verbatim script lines; zero visual change |
| B1 | `BaseSelectMenu` primitive on B0 (trigger/option slots, opt-in keyboard nav) | the 5 pickers' duplicated templates |
| B2 | `BaseAccordionSection` (title, `v-model:expanded`, header-extra + body slots) | 5 exact + 2 near-exact accordion headers |
| B3 | `BasePillToggle` (no group wrapper: today it would be a classless pass-through div; it belongs with a deliberate radiogroup-ARIA pass, not a byte-identical dedupe) | ~24 pill/chip/segmented buttons (the 25th "chip" is a decorative span in `SdrWaterfall` — styling reuse, not a toggle) |
| B4 | `BaseIconAction`, the non-rail sibling of `BaseIconButton` (composes `BasePillToggle`; top/bottom/left tooltip anchoring + custom-prop pill restyling — none of these tooltips use the rail's left/right model) | 17 tooltip'd row actions, 10 bare glyphs, 4 clear-✕; 5 duplicated tooltip CSS blocks |
| B5 | Adopt `BaseButton` ghost for the `sdr-panel-btn` CANCEL/SAVE/ADD family (ghost only — SAVE is a tint modifier of the same family, not the lime primary; ghost gained bg/hover-bg/radius/font-weight/letter-spacing hooks as the dark-theme mirror). `sdr-add-freq-btn` stays hand-rolled: its mixed-case accent look isn't a ghost | the family's chrome CSS (now hook mappings mirroring the original cascade rule-for-rule) across 12 button sites in 4 SDR files |
| B6 | `BaseCheckbox` (checkmark slot) | 3 unrelated checkbox families |
| B7 | `BaseSliderRow` (label + pre-formatted readout + raw-event range input). Waterfall's 3 rows stay: different structure (horizontal label, wrapped `v-model` slider, no readout) and CSS family — the hook did not fit | 4 SETTINGS slider rows |
| B8 | DESCOPED on evidence (2026-07-15): the empty-state primitive already exists — `BaseList`'s `emptyText` default + `#empty` slot, adopted where it fits (TrackingPanel, recordings); the remaining "empties" are non-list one-offs a component can't absorb byte-identically (`settings-empty` light theme, `SdrDecodeDock`'s `<td colspan>`, `sdr-trunk-hint` paragraph, `sdr-panel-empty`'s JS-driven `display:none`), and `#msb-tracking-empty` (the one byte-identical duplicate of `.ba-list-empty`) is spec-pinned by id. `BaseListItem` retrofits fail the same test: every candidate row family owns layout+hover CSS that conflicts with (`.sdr-search-range-item:hover` = 0.06 vs the primitive's 0.04) or exactly duplicates the primitive's affordances — adoption would add a wrapper class and delete nothing. `BaseListItem` remains the primitive for NEW lists | — |
| B9 | `SatRadioInfoSection` (class-prefix prop selects the caller's `sfr-acc`/`spp-acc` family) + shared `satRadioInfo.ts` utils (`formatHz`/`formatStatus`/`splitNotes`/`hasRadioInfo`, now directly unit-tested instead of v8-ignored). The scattered SDR `(hz/1e6).toFixed` calls were evaluated and left: they differ in precision and format (3/4 dp, kHz steps, unit-less) — a parameterised wrapper would add indirection without removing duplication | ~90 duplicated Space lines |
| B10 | CSS co-location sweep, one family per PR (B10a…). Settled policy (2026-07-15): a family moves to its **sole renderer** — the feature component that puts the classes in the DOM (a base primitive owns a family only where its own template hardcodes the classes, e.g. `BaseSelectMenu`'s `sdr-device-dropdown/-menu` shell); moved blocks are **unscoped** `<style>` (scoped `[data-v]` selectors would raise specificity, and the classes often sit on base-component-rendered elements outside the adopter's scope). Cascade rule: `SdrPanel.css` is `SdrPanel.vue`'s *first* import, so component styles always land **after** it in module order — a family may move only when no equal-specificity rule remaining in another file targets the same elements (verified per PR in the built CSS; the once-feared per-picker menu modifiers `.sdr-step-menu`/`.sdr-trunk-menu` have no rules today, and all contextual overrides — `#sdr-mini-player …`, `.sdr-search-adhoc-col …`, `.sdr-ef-setting …`, `.sdr-settings-controls …` — are higher-specificity, hence order-immune). Shared stragglers (`.sdr-slider-header/-val`, rendered by both `BaseSliderRow` and the hand-rolled SAMPLE RATE header) go to `SdrSettingsAccordion`, the one component containing every renderer. Families that can't move without cascade risk stay, with the reason recorded here | B10a: the AGC checkbox family (`.sdr-agc-row`/`.sdr-checkbox-*`) → `SdrSettingsAccordion.vue`. B10b: the slider-row families — `.sdr-slider-header/-val` → `SdrSettingsAccordion.vue` (per the straggler rule), `.sdr-panel-slider` chrome → `BaseSliderRow.vue` (sole renderer; its `outline: none` is focus-safe because a11y.css restores `:focus-visible` with `!important`). B10c: the trunk family (`.sdr-trunk-*` + the `#sdr-trunk-section-body` context rules) → `SdrTrunkSection.vue`. B10d: the GROUPS tab families (`.sdr-group-pill*` live rules, `.sdr-frequency-manager-group-add-row`, `.sdr-panel-add-row`) → `SdrGroupsTab.vue`, moved as one ordered unit because the two add-row classes style the same element at equal specificity with conflicting padding; the pill edit/del glyph chrome stays grouped with its `.sdr-freq-row-edit` siblings in `SdrPanel.css`, and `.sdr-group-pill-dot`/`-default` stay as dead-CSS candidates (no renderer anywhere) for the verification pass |

Every phase keeps runtime behaviour byte-identical (same DOM classes, same
event/command cadence), holds the 100% coverage gate, ships jest-axe tests on
new components, keeps `e2e/sdr.spec.ts` green, and commits the rebuilt
`frontend/spa-dist/` bundle.

**Deliberately out of scope** (evidence, not guesswork): MapLibre IControl
DOM-created buttons (centralised in `SentinelControlBase`; only
`AdsbLiveControl`'s own toggle could optionally extend it — an imperative-layer
change); `AirSideMenu`'s 3D widget (tooltips open upward, excluded by
`BaseIconButton`'s documented left/right model); `AirReplayPanel` calendar
internals (one-off widget); `sdr-device-btn` and `tle-cat-clear` (documented
in `BaseButton` as intentionally distinct); the `AirFilter`/`SpaceFilter`
always-visible listboxes (an a11y structure, not dropdowns); one-off CTAs
(`NoUrlOverlay`, `App.vue` nav overlay, `spp-action-btn`).

The `tle-dropdown` family's blur-dismiss model is deliberate; it folds into
`BaseSelectMenu` only if the primitive grows a non-teleported mode, otherwise
it stays.

## Consequences

- New base primitives own their styles (scoped/co-located), reversing the
  P-series convention of parking extracted components' CSS in the global
  `SdrPanel.css`; the global sheets shrink as phases land.
- The plan is recorded here because the P-series plan doc was never committed
  and its final phase's scope was lost.
- Phase statuses are tracked in the PRs (search: "base dedupe B" /
  `refactor/use-teleported-menu` onwards).
