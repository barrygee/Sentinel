<template>
  <div class="base-slider-row">
    <div class="base-slider-row-header">
      <label class="base-slider-row-label">{{ label }}</label>
      <span
        class="base-slider-row-value"
        :class="{ 'base-slider-row-value--dimmed': readoutDimmed }"
        >{{ readout }}</span
      >
    </div>
    <input
      class="base-slider-row-input"
      type="range"
      :aria-label="accessibleName"
      :aria-valuetext="readout"
      :min="min"
      :max="max"
      :step="step"
      :value="value"
      :disabled="disabled"
      @input="emit('input', $event)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * `BaseSliderRow` — a labelled range-slider row: an uppercase field label
 * with a right-aligned value readout, above a full-width range input. Used
 * by the SDR panel's SETTINGS accordion (VOLUME/SQUELCH/BANDWIDTH/RF GAIN)
 * and the offline-maps DEPTH picker.
 *
 * State stays caller-owned: `value` is a plain prop and `input` re-emits the
 * raw DOM event — the parent panel's handlers own the engine side effects
 * (150 ms command debounces, audio-worklet calls) and their cadence MUST NOT
 * change. The readout arrives pre-formatted (`80%`, `-60 dBFS`, `AUTO`) so
 * per-row formatting quirks stay with the caller.
 *
 * Deliberately NOT folded in: `SdrWaterfall`'s Zoom/Max/Min rows — a
 * different structure (horizontal label + wrapped `v-model` slider, no
 * readout) and CSS family; forcing them under one primitive would leave it
 * describing nothing.
 *
 * The row has no padding of its own: spacing is the context's job, so a
 * caller passes its row class through (`class` falls through to the root;
 * the SDR panel passes `sdr-radio-section`). The classes below are styled
 * by the unscoped block at the end of this file; callers restyle them from
 * a descendant selector (`.my-context :deep(.base-slider-row-label)`):
 * `base-slider-row-header`, `-label`, `-value` (+ `--dimmed`), `-input`.
 */
withDefaults(
  defineProps<{
    /** The uppercase field label (VOLUME, SQUELCH, …). */
    label: string
    /** Pre-formatted readout text shown right of the label. */
    readout: string
    /** Renders the readout in its dimmed style (e.g. the control is unusable or read-only). */
    readoutDimmed?: boolean
    /**
     * `aria-label` for the range input (the visual label element is not
     * programmatically associated — preserved as-is from the pre-extraction
     * rows, whose specs and the live axe audit key off these names).
     */
    accessibleName: string
    /** Range minimum (string or number, forwarded verbatim). */
    min: number | string
    /** Range maximum (string or number, forwarded verbatim). */
    max: number | string
    /** Range step (string or number, forwarded verbatim). */
    step: number | string
    /** Current slider value (caller-owned state; no v-model on purpose). */
    value: number
    /** Disables the range input. */
    disabled?: boolean
  }>(),
  { readoutDimmed: false, disabled: false },
)

const emit = defineEmits<{
  /** Raw input event from the range input (callers own all side effects). */
  (event: 'input', domEvent: Event): void
}>()
</script>

<!-- Unscoped on purpose: `scoped` would add [data-v] attribute selectors and
     raise specificity, so callers' descendant overrides would need more
     weight. The header, label and value rules were the SDR panel's
     `.sdr-slider-header`/`.sdr-field-label`/`.sdr-slider-val` look (label in
     strong ink, as inside `.sdr-radio-section`). `outline: none` on the input
     looks like a focus-ring risk but isn't: assets/a11y.css restores
     :focus-visible with !important, which beats this rule regardless of
     source order. -->
<style>
.base-slider-row-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.base-slider-row-label {
  display: block;
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-strong);
}

.base-slider-row-value {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 700;
  color: var(--ink-secondary);
  letter-spacing: 0.1em;
  min-width: 60px;
  text-align: right;
  flex-shrink: 0;
}

.base-slider-row-value--dimmed {
  opacity: 0.25;
}

.base-slider-row-input {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: var(--surface);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  display: block;
  box-sizing: border-box;
  border: none;
}

.base-slider-row-input:disabled {
  opacity: 0.3;
  cursor: default;
}

.base-slider-row-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(var(--shadow-rgb), 0.5);
}

.base-slider-row-input::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent);
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(var(--shadow-rgb), 0.5);
}

.base-slider-row-input::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: var(--surface);
}
</style>
