<template>
  <div class="sdr-radio-section">
    <div class="sdr-slider-header">
      <label class="sdr-field-label">{{ label }}</label>
      <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': readoutDimmed }">{{
        readout
      }}</span>
    </div>
    <input
      class="sdr-panel-slider"
      type="range"
      :aria-label="accessibleName"
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
 * `BaseSliderRow` — the labelled range-slider row used by the SDR panel's
 * SETTINGS accordion: an uppercase field label with a right-aligned value
 * readout, above a full-width range input. Extracted from (not a rewrite of)
 * the four near-identical VOLUME/SQUELCH/BANDWIDTH/RF-GAIN rows in
 * `SdrSettingsAccordion.vue`.
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
 * The range-input chrome (`.sdr-panel-slider`, hardcoded in this template —
 * its sole renderer) is styled by the unscoped block below (B10 CSS
 * co-location). The header family (`.sdr-slider-header/-val`) lives with
 * `SdrSettingsAccordion.vue`, which contains both of its renderers (these
 * rows and the hand-rolled SAMPLE RATE header); the row wrapper
 * (`.sdr-radio-section`) and label (`.sdr-field-label`) stay in SdrPanel.css
 * with their many other renderers.
 */
withDefaults(
  defineProps<{
    /** The uppercase field label (VOLUME, SQUELCH, …). */
    label: string
    /** Pre-formatted readout text shown right of the label. */
    readout: string
    /** Renders the readout in its dimmed style (no usable radio / read-only). */
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

<!-- Unscoped on purpose (B10 CSS co-location): moved verbatim from
     SdrPanel.css. `scoped` would add [data-v] attribute selectors and RAISE
     specificity over the original global rules. `outline: none` looks like a
     focus-ring risk but isn't: assets/a11y.css restores :focus-visible with
     !important, which beats this rule regardless of source order. -->
<style>
.sdr-panel-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 3px;
  background: #c8ff00;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  display: block;
  box-sizing: border-box;
  border: none;
}

.sdr-panel-slider:disabled {
  opacity: 0.3;
  cursor: default;
}

.sdr-panel-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.sdr-panel-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.sdr-panel-slider::-moz-range-track {
  height: 3px;
  border-radius: 2px;
  background: #c8ff00;
}
</style>
