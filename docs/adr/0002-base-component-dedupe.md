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
| B5 | Adopt `BaseButton` ghost/primary for `sdr-panel-btn` CANCEL/SAVE/ADD | duplicated form buttons in 3 SDR tabs × 2 forms |
| B6 | `BaseCheckbox` (checkmark slot) | 3 unrelated checkbox families |
| B7 | `BaseSliderRow` (optional value-readout) | 4 settings slider rows (waterfall's 3 only if the hook fits) |
| B8 | `BaseEmptyState` + real `BaseList`/`BaseListItem` adoption | 7 empty-state implementations; 6+ hand-rolled row sites |
| B9 | Shared RADIO-info sub-component + frequency/format utils | ~90 duplicated Space lines; scattered `(hz/1e6).toFixed` |
| B10 | CSS co-location sweep | each phase drains its family from `SdrPanel.css`/`SettingsPanel.css`; B10 finishes |

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
