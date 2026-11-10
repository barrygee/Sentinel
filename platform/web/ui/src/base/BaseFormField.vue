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
 * `density` picks the look: `panel` is the SDR side panel's add/edit forms,
 * `settings` the Settings panel's hairline fields.
 *
 * `layout` places the caption: `stacked` (the default) above the control,
 * `inline` in a column beside it, with the error and hint lined up under the
 * control. The column is `--ba-form-field-label-width` wide (110px), and
 * `--ba-form-field-align` (center) aligns the caption with a taller control.
 * `wrapControl` lets an inline control too wide for the row (a pair of pills
 * on a phone) drop onto its own line under the caption instead of overflowing.
 *
 * A control whose caption is drawn elsewhere on its card leaves `label` out:
 * no caption is rendered, and the caller names the control itself with an
 * `aria-label`.
 */
const props = withDefaults(
  defineProps<{
    /** The visible caption above the control. Omit it only when the control is named with an `aria-label`. */
    label?: string
    /** The validation message to show under the control; empty or omitted for none. */
    error?: string | undefined
    /** Guidance shown under the control while there is no error (e.g. the accepted range). */
    hint?: string | undefined
    /** Marks the control invalid without a message — for a field whose only cue is its rule turning red. */
    invalid?: boolean
    /**
     * Makes the error line an alert, so a message appearing while the user types
     * is announced. The line then stays mounted (empty while valid), as a live
     * region must exist before its text changes to be announced reliably.
     */
    errorAlert?: boolean
    /** The control's id. Generated when omitted; pass one for callers whose specs or CSS address it. */
    controlId?: string | undefined
    /** `control` (the default) renders a `<label for>`; `group` renders a plain caption. */
    labelKind?: 'control' | 'group'
    /** The visual treatment. */
    density?: 'panel' | 'settings'
    /** Where the caption sits: above the control, or in a column beside it. */
    layout?: 'stacked' | 'inline'
    /** Inline only: moves the control under the caption when the row is too narrow for both. */
    wrapControl?: boolean
  }>(),
  {
    error: '',
    hint: '',
    invalid: false,
    label: '',
    errorAlert: false,
    controlId: undefined,
    labelKind: 'control',
    density: 'panel',
    layout: 'stacked',
    wrapControl: false,
  },
)

const generatedId = useId()
const resolvedControlId = computed(() => props.controlId ?? `ba-form-field-${generatedId}`)
const labelId = computed(() => `${resolvedControlId.value}-label`)
const errorId = computed(() => `${resolvedControlId.value}-error`)
const hintId = computed(() => `${resolvedControlId.value}-hint`)
const hasError = computed(() => props.error !== '')
const showsInvalid = computed(() => props.invalid || hasError.value)
/** The error explains the field while there is one; otherwise the hint, if any, does. */
const describedBy = computed(() => {
  if (hasError.value) return errorId.value
  return props.hint !== '' ? hintId.value : undefined
})
const rendersErrorLine = computed(() => hasError.value || props.errorAlert)
</script>

<template>
  <div
    class="ba-form-field"
    :class="[
      `ba-form-field--${density}`,
      `ba-form-field--${layout}`,
      { 'ba-form-field--wrap-control': wrapControl && layout === 'inline' },
    ]"
  >
    <label
      v-if="label !== '' && labelKind === 'control'"
      :id="labelId"
      class="ba-form-field__label"
      :for="resolvedControlId"
      >{{ label }}</label
    >
    <span v-else-if="label !== ''" :id="labelId" class="ba-form-field__label">{{ label }}</span>
    <slot
      :control-id="resolvedControlId"
      :label-id="labelId"
      :described-by="describedBy"
      :invalid="showsInvalid"
    />
    <div
      v-if="rendersErrorLine"
      :id="errorId"
      class="ba-form-field__error"
      :role="errorAlert ? 'alert' : undefined"
    >
      {{ error }}
    </div>
    <div v-if="!hasError && hint !== ''" :id="hintId" class="ba-form-field__hint">{{ hint }}</div>
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
.ba-form-field__error:empty {
  display: none;
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
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: var(--sev-error);
}

/* settings: the Settings panel's fields — a 60%-ink caps caption, the value on
   a hairline rule (see BaseTextField), and a sentence-case hint or error under
   it. 60% ink rather than --ink-secondary's 55%: at 9px the lighter grey
   measures 4.0:1 on the panel, below the 4.5:1 AA minimum; 60% gives 4.7:1. */
.ba-form-field--settings {
  gap: 8px;
}
.ba-form-field--settings .ba-form-field__label {
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: rgba(var(--ink-rgb), 0.6);
  user-select: none;
}
.ba-form-field--settings :is(.ba-form-field__error, .ba-form-field__hint) {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: var(--settings-text-small);
  line-height: 1.45;
}
.ba-form-field--settings .ba-form-field__error {
  font-weight: 500;
  color: var(--danger-hover);
}
.ba-form-field--settings .ba-form-field__hint {
  font-weight: 400;
  color: rgba(var(--ink-rgb), 0.6); /* 4.5:1 AA on the panel at 11-12px */
}

/* inline: the caption in a fixed column, the control beside it, and the error
   or hint in the control's column on the rows below. Slotted controls belong
   to the caller's scope, hence :deep() to place them. */
.ba-form-field--inline {
  display: grid;
  grid-template-columns: var(--ba-form-field-label-width, 110px) minmax(0, 1fr);
  column-gap: 14px;
  align-items: var(--ba-form-field-align, center);
}
.ba-form-field--inline > :deep(*) {
  grid-column: 2;
}
.ba-form-field--inline .ba-form-field__label {
  grid-column: 1;
}

/* wrapControl: a wrapping row in place of the grid, so a control too wide to
   sit beside the caption moves under it; the error or hint still starts at the
   control's column. */
.ba-form-field--wrap-control {
  display: flex;
  flex-flow: row wrap;
  align-items: var(--ba-form-field-align, center);
  column-gap: 14px;
}
.ba-form-field--wrap-control .ba-form-field__label {
  flex: 0 0 var(--ba-form-field-label-width, 110px);
}
.ba-form-field--wrap-control :is(.ba-form-field__error, .ba-form-field__hint) {
  flex-basis: 100%;
  padding-left: calc(var(--ba-form-field-label-width, 110px) + 14px);
}
</style>
