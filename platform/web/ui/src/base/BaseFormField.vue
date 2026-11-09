<script setup lang="ts">
import { computed, useId } from 'vue'

/**
 * `BaseFormField` — the labelled wrapper every form control sits in: a visible
 * caption, the control (default slot) and an optional error line under it.
 *
 * It owns the ids that tie the three together, so callers never hand-wire
 * `for` / `aria-describedby`. The slot receives them:
 * - `controlId` — put on the control; the `<label>` points at it.
 * - `labelId` — the caption's id, for `aria-labelledby` on a group.
 * - `describedBy` — the error line's id while there is an error, else undefined.
 * - `invalid` — whether an error is showing.
 *
 * `labelKind="group"` is for a caption over something that is not one form
 * control (a pill radiogroup, a custom picker): the caption is then a `<span>`
 * rather than a `<label>` pointing at nothing.
 *
 * `density` picks the look. `panel` is the SDR side panel's add/edit forms; the
 * Settings look arrives with the Settings controls that will use it.
 */
const props = withDefaults(
  defineProps<{
    /** The visible caption above the control. */
    label: string
    /** The validation message to show under the control; empty or omitted for none. */
    error?: string | undefined
    /** The control's id. Generated when omitted; pass one for callers whose specs or CSS address it. */
    controlId?: string | undefined
    /** `control` (the default) renders a `<label for>`; `group` renders a plain caption. */
    labelKind?: 'control' | 'group'
    /** The visual treatment. */
    density?: 'panel'
  }>(),
  {
    error: '',
    controlId: undefined,
    labelKind: 'control',
    density: 'panel',
  },
)

const generatedId = useId()
const resolvedControlId = computed(() => props.controlId ?? `ba-form-field-${generatedId}`)
const labelId = computed(() => `${resolvedControlId.value}-label`)
const errorId = computed(() => `${resolvedControlId.value}-error`)
const invalid = computed(() => props.error !== '')
</script>

<template>
  <div class="ba-form-field" :class="`ba-form-field--${density}`">
    <label
      v-if="labelKind === 'control'"
      :id="labelId"
      class="ba-form-field__label"
      :for="resolvedControlId"
      >{{ label }}</label
    >
    <span v-else :id="labelId" class="ba-form-field__label">{{ label }}</span>
    <slot
      :control-id="resolvedControlId"
      :label-id="labelId"
      :described-by="invalid ? errorId : undefined"
      :invalid="invalid"
    />
    <div v-if="invalid" :id="errorId" class="ba-form-field__error">{{ error }}</div>
  </div>
</template>

<style scoped>
.ba-form-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.ba-form-field__label {
  display: block;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-weight: 400;
  text-transform: uppercase;
}
.ba-form-field__error {
  text-transform: uppercase;
}

/* panel: the SDR side panel's add/edit forms — small spaced caps over a filled
   field, with a red caps line under a field that failed validation. */
.ba-form-field--panel .ba-form-field__label {
  margin-bottom: 10px;
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--ink-strong);
}
.ba-form-field--panel .ba-form-field__error {
  margin-top: 4px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--sev-error);
}
</style>
