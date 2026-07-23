---
name: maplibre-control
description: >-
  Sentinel's pattern for adding a map feature as a MapLibre IControl — the
  SentinelControlBase abstract class, per-feature control folders under
  components/<domain>/controls/<feature>/, wiring into the map view, active-state
  styling, persistence, and the accessibility requirements. Use when adding,
  editing, or reviewing a map control/feature/button/overlay on any Sentinel map
  (air, space, sea, land), or when tempted to put map-feature logic inline in a
  view — controls are the required mechanism.
---

# Sentinel MapLibre controls

Map features are **class-based MapLibre `IControl`s**, one folder per feature
under `frontend/vue/src/components/<domain>/controls/<feature>/`, extending the
shared base — never inline logic in the map view component. (Project rule from
`CLAUDE.md`: "add features as controls, not inline in the view".)

## The base class

`components/air/controls/sentinel-control-base/SentinelControlBase.ts`
(`abstract class SentinelControlBase implements maplibregl.IControl`) owns the
chrome so features only implement behavior:

- Subclasses implement: `buttonLabel` (text or an `<svg …` string — HTML is
  detected by a leading `<`), `buttonTitle`, `onInit()`, `handleClick()`.
- The base builds the 29×29 black button, wires hover styling, and calls
  `onInit()` at the end of `onAdd()` — the map is available as `this.map` from
  there on.
- **Accessibility is handled in the base**: `buttonTitle` is exposed as
  `aria-label` because icon-only buttons can't rely on `title` for the
  accessible name (WCAG 4.1.2). Give every control a descriptive
  `buttonTitle`; don't remove or duplicate the label wiring in subclasses.
- `setButtonActive(active)` is the standard on/off affordance: full-opacity
  `#c8ff00` when active, dimmed white when not. Use it rather than restyling
  ad hoc — `#c8ff00` is the established accent (dark-map-visible; see the
  military-bracket lesson).

## Adding a new control (checklist)

1. Create `components/<domain>/controls/<feature>/` containing
   `<Feature>Control.ts` extending `SentinelControlBase` (its `.spec.ts` is
   written at commit/push time on confirmation, per the global testing rule —
   Sentinel's coverage gate is 100%, so tests land with the merge).
2. Keep the control single-responsibility. If the feature has real UI beyond
   the button (panels, lists), that UI is a Vue component the control toggles —
   composed of small sub-components per the composition rule — not DOM built
   inside the control class.
3. Register it in the domain's map view alongside the existing
   `map.addControl(...)` calls, matching the existing ordering.
4. Persisted on/off state goes through the domain's Pinia store /
   `user_settings` like the existing controls — restore state in the control's
   constructor/`onInit`, not a view `setTimeout` (see the ADS-B filter-restore
   timing lesson: late restores flash wrong state on load).
5. Layer visibility toggles must cover **every** layer the feature owns (the
   ground-track bug: four orbit layers, toggles only covered two).
6. Map data is opaque to assistive tech — significant new map information needs
   an accessible equivalent (control + data-table/list), per
   `accessibility-standards`.

## Domains

`air/controls/` is the richest set (aara, adsb, airports, awacs, range-rings,
reset-view, …) and the reference for idiom; `space/controls/` (daynight,
names, satellite) follows the same base. The base class currently lives under
`air/` — if a `sea`/`land` control ever needs it, prefer moving the base to a
shared location over duplicating it.
