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
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue) until
 * the B10 co-location sweep, same as the other SDR-family primitives.
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
