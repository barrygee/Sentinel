<template>
  <label>
    <input
      type="checkbox"
      class="ba-checkbox-input"
      :class="inputClass"
      :checked="checked"
      :disabled="disabled"
      :aria-label="accessibleName"
      @change="emit('change', $event)"
    />
    <span :class="boxClass">
      <slot name="checkmark" />
    </span>
    <slot />
  </label>
</template>

<script setup lang="ts">
/**
 * `BaseCheckbox` — the custom-checkbox structure shared by the app's three
 * checkbox families: a label wrapping a hidden native `<input
 * type="checkbox">`, followed by the visual box `<span>`, followed by any
 * trailing content. Extracted from (not a rewrite of) the AGC checkbox
 * (`SdrSettingsAccordion.vue`, `.sdr-checkbox-*`) and the ADS-B label/tag
 * field grids (`AdsbLabelFieldsControl.vue` `.adsb-lf-*`,
 * `AdsbTagFieldsControl.vue` `.adsb-tf-*`).
 *
 * The component owns only the structure and the hidden input; each family's
 * look stays in its own CSS (keyed off `inputClass`/`boxClass` and the
 * `input:checked + box` sibling selector, which this element order
 * guarantees). The check glyph itself is family-owned too:
 * - CSS-drawn checks (the AGC `::after` tick) need no slot content.
 * - Inline-SVG checks (the ADS-B grids) render via the `#checkmark` slot,
 *   conditioned on the caller's own state.
 *
 * State stays caller-owned: `checked` is a plain prop and `change` re-emits
 * the raw DOM event (the AGC parent's handler owns hardware side effects and
 * its command cadence MUST NOT change; the grids ignore the event object).
 *
 * Scoped-CSS note for adopters: only the label (this component's root)
 * carries the adopting component's scope id — scoped rules for the input/box
 * need `:deep()` anchored at the label class (see the ADS-B controls).
 *
 * Known, deliberately preserved limitation: every pre-extraction family
 * hides the input with `display: none`, so these checkboxes are not
 * keyboard-focusable. Fixing that (visually-hidden instead of display:none,
 * plus :focus-visible box styling) is a behaviour change for a dedicated
 * a11y pass, not this byte-identical dedupe.
 */
withDefaults(
  defineProps<{
    /** Whether the box is ticked (caller-owned state; no v-model on purpose). */
    checked: boolean
    /** Extra class(es) for the hidden input (the family's `input:checked` key). */
    inputClass?: string
    /** Class(es) for the visual box span (family look + variants like `--mil`). */
    boxClass?: string
    /** Disables the native input (the AGC checkbox while no radio is usable). */
    disabled?: boolean
    /**
     * `aria-label` for the input. Omit when the label's own visible content
     * (default-slot text) names the control, as the AGC checkbox does.
     * Deliberately NOT named `ariaLabel`; see the identical note in
     * `BaseToggleSwitch`.
     */
    accessibleName?: string
  }>(),
  {
    inputClass: undefined,
    boxClass: undefined,
    disabled: false,
    accessibleName: undefined,
  },
)

const emit = defineEmits<{
  /** Raw change event from the native input (callers own all side effects). */
  (event: 'change', domEvent: Event): void
}>()
</script>

<style scoped>
/* The native input is the state/eventing element only; the box span is the
   visual. All three pre-extraction families hid it exactly this way (see the
   keyboard-focus note in the component doc). */
.ba-checkbox-input {
  display: none;
}
</style>
