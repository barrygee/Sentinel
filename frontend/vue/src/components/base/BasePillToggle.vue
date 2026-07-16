<template>
  <button type="button" :class="active ? activeClass : undefined">
    <slot />
  </button>
</template>

<script setup lang="ts">
/**
 * `BasePillToggle` — the small pill/chip button pattern used for mode pills,
 * scan-group and pass-category chips, segmented settings toggles and the SDR
 * transport buttons. Extracted from (not a rewrite of) the ~24 hand-rolled
 * `<button>` + family-class + conditional-active-class copies across
 * `SdrPanel`, `SdrFrequencyManagerTab`, `SdrSearchRangesTab`, `SpacePasses`,
 * `SourceOverrideControl`, `SpaceHoverPreviewControl`, `SdrDeviceForm` and
 * `AirReplayPanel`.
 *
 * The component owns only the shared shape: a `type="button"` element whose
 * active/selected state maps to the caller's CSS family's own active class
 * (`active`, `…-active`, `…--active`, `is-active` — the families predate any
 * shared convention, and their styling stays in the per-feature sheets until
 * the B10 co-location sweep). Everything else — the family class itself,
 * `disabled`, `title`, `aria-*`, `data-*` and the click handler — falls
 * through to the button, so adopting sites keep byte-identical DOM classes,
 * ARIA and event cadence. Momentary pills (e.g. the SDR TUNE/STOP transport
 * buttons) simply omit `active`/`activeClass`.
 *
 * State ARIA stays caller-owned via fallthrough (the deliberate radiogroup /
 * aria-pressed a11y pass deferred from B3): independent and multi-select
 * pills bind `:aria-pressed`; single-select segmented groups put
 * `role="radiogroup"` + a label on their existing wrapper and give each pill
 * `role="radio"` + `:aria-checked` + the roving-tabindex/arrow-key bindings
 * from `useRadioGroupKeyboard` (both helpers, always — half-done radio
 * semantics are worse than buttons). Momentary pills (TUNE/STOP) carry no
 * state ARIA at all.
 */
withDefaults(
  defineProps<{
    /** Whether the pill is in its selected/on state. */
    active?: boolean
    /**
     * The caller's CSS family class for the active state (e.g. `active`,
     * `sdr-scan-group-chip-active`, `is-active`). No default: the families'
     * class names predate any shared convention. Omit together with `active`
     * for momentary (non-toggle) pills.
     */
    activeClass?: string
  }>(),
  { active: false, activeClass: undefined },
)
</script>
