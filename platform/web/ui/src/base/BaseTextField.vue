<script setup lang="ts" generic="FieldValue extends string | number">
import { computed, ref, useAttrs } from 'vue'
import BaseFormField from '@sentinel/ui/base/BaseFormField.vue'

/**
 * `BaseTextField` — a labelled single-line input (or, with `multiline`, a
 * textarea) bound with `v-model`, built on `BaseFormField` so the caption,
 * error line and their ids come for free.
 *
 * Attributes the caller sets that are not props (`placeholder`, `maxlength`,
 * `step`, `min`, `disabled`, `aria-label`, `rows`, …) go to the input itself,
 * so the field reads like a native input at the call site — except `class`
 * and `style`, which lay out the field as a whole and so stay on the wrapper.
 *
 * The model keeps the native `v-model` behaviour: a `number` input hands back
 * a number once the text parses, the raw text otherwise — which is why the
 * value type is generic rather than fixed.
 */
defineOptions({ inheritAttrs: false })

const model = defineModel<FieldValue>({ required: true })

withDefaults(
  defineProps<{
    /** The visible caption above the input. Omit it only when the input has an `aria-label`. */
    label?: string
    /** The validation message to show under the input; empty or omitted for none. */
    error?: string | undefined
    /** Guidance under the input while there is no error; see `BaseFormField`. */
    hint?: string | undefined
    /** Marks the input invalid without a message; see `BaseFormField`. */
    invalid?: boolean
    /** Announces the error line as it changes; see `BaseFormField`. */
    errorAlert?: boolean
    /** The input's id, for callers whose specs or CSS address it. Generated when omitted. */
    inputId?: string | undefined
    /** The native input type. Ignored when `multiline`. */
    inputType?: 'text' | 'number' | 'url' | 'password' | 'search'
    /** Renders a textarea instead of an input. */
    multiline?: boolean
    /**
     * The visual treatment; see `BaseFormField`. The `settings` input sizes
     * itself from `--ba-text-field-width`, `--ba-text-field-max-width` and
     * `--ba-text-field-align`, set on the field or an ancestor.
     */
    density?: 'panel' | 'settings'
  }>(),
  {
    error: '',
    hint: '',
    invalid: false,
    label: '',
    errorAlert: false,
    inputId: undefined,
    inputType: 'text',
    multiline: false,
    density: 'panel',
  },
)

const attrs = useAttrs()
/** Everything but `class` / `style`, which `wrapperAttrs` keeps for the wrapper. */
const inputAttrs = computed(() => {
  const { class: _wrapperClass, style: _wrapperStyle, ...forwarded } = attrs
  return forwarded
})
const wrapperAttrs = computed(() => ({ class: attrs.class, style: attrs.style }))

const inputRef = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

defineExpose({
  /** Moves focus into the input. */
  focus: (): void => inputRef.value?.focus(),
})
</script>

<template>
  <BaseFormField
    v-slot="{ controlId, describedBy, invalid: showsInvalid }"
    v-bind="wrapperAttrs"
    :label="label"
    :error="error"
    :hint="hint"
    :invalid="invalid"
    :error-alert="errorAlert"
    :control-id="inputId"
    :density="density"
  >
    <textarea
      v-if="multiline"
      :id="controlId"
      ref="inputRef"
      v-model="model"
      v-bind="inputAttrs"
      class="ba-text-field__input ba-text-field__input--multiline"
      :class="[
        `ba-text-field__input--${density}`,
        { 'ba-text-field__input--invalid': showsInvalid },
      ]"
      :aria-invalid="showsInvalid || undefined"
      :aria-describedby="describedBy"
    ></textarea>
    <input
      v-else
      :id="controlId"
      ref="inputRef"
      v-model="model"
      v-bind="inputAttrs"
      :type="inputType"
      class="ba-text-field__input"
      :class="[
        `ba-text-field__input--${density}`,
        { 'ba-text-field__input--invalid': showsInvalid },
      ]"
      :aria-invalid="showsInvalid || undefined"
      :aria-describedby="describedBy"
    />
  </BaseFormField>
</template>

<style scoped>
.ba-text-field__input {
  width: 100%;
  box-sizing: border-box;
  border: none;
  outline: none;
  font-family: var(--font-primary, 'Barlow', sans-serif);
}

/* No spinner arrows on number inputs: the panel's fields are typed into. */
.ba-text-field__input[type='number']::-webkit-outer-spin-button,
.ba-text-field__input[type='number']::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.ba-text-field__input[type='number'] {
  -moz-appearance: textfield;
  appearance: textfield;
}

/* panel: the SDR side panel's add/edit forms — a filled 36px strip. */
.ba-text-field__input--panel {
  height: 36px;
  padding: 0 12px;
  border-radius: 2px;
  background: rgba(var(--ink-rgb), 0.06);
  color: var(--ink-strong);
  font-size: 11px;
  letter-spacing: 0.08em;
  transition: border-color 0.15s;
}
.ba-text-field__input--panel::placeholder {
  color: rgba(var(--ink-rgb), 0.4);
}
.ba-text-field__input--panel.ba-text-field__input--multiline {
  height: auto;
  min-height: 96px;
  padding: 10px 12px;
  resize: none;
  overflow-y: auto;
  font-family: inherit;
  line-height: 1.4;
  white-space: pre-wrap;
}
.ba-text-field__input--panel.ba-text-field__input--invalid {
  box-shadow:
    inset 0 0 0 1px var(--sev-error),
    0 0 0 1px rgba(var(--sev-error-rgb), 0.35);
}

/* settings: the Settings panel's field — no fill, the value written on a
   hairline rule that thickens to the accent on focus and turns red when the
   value is rejected, staying red after focus moves on so the error under it is
   anchored to a field that still looks wrong. */
.ba-text-field__input--settings {
  width: var(--ba-text-field-width, 100%);
  max-width: var(--ba-text-field-max-width, none);
  min-width: 0;
  padding: 6px 0 8px;
  border-radius: 0;
  background: none;
  box-shadow: inset 0 -1px 0 var(--settings-field-line, var(--rule));
  color: var(--ink);
  caret-color: var(--ink-strong);
  font-size: var(--settings-text-value);
  font-weight: 400;
  letter-spacing: 0.04em;
  text-align: var(--ba-text-field-align, left);
  transition: box-shadow 0.15s;
}
.ba-text-field__input--settings:focus {
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
.ba-text-field__input--settings.ba-text-field__input--invalid {
  box-shadow: inset 0 -2px 0 var(--danger);
}
.ba-text-field__input--settings::placeholder {
  color: rgba(var(--ink-rgb), 0.38);
  letter-spacing: 0.1em;
}
.ba-text-field__input--settings:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (prefers-reduced-motion: reduce) {
  .ba-text-field__input {
    transition: none;
  }
}
</style>
