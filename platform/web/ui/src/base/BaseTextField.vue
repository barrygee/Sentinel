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
    /** The visible caption above the input. */
    label: string
    /** The validation message to show under the input; empty or omitted for none. */
    error?: string | undefined
    /** The input's id, for callers whose specs or CSS address it. Generated when omitted. */
    inputId?: string | undefined
    /** The native input type. Ignored when `multiline`. */
    inputType?: 'text' | 'number' | 'url' | 'password' | 'search'
    /** Renders a textarea instead of an input. */
    multiline?: boolean
    /** The visual treatment; see `BaseFormField`. */
    density?: 'panel'
  }>(),
  {
    error: '',
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
    v-slot="{ controlId, describedBy, invalid }"
    v-bind="wrapperAttrs"
    :label="label"
    :error="error"
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
      :class="[`ba-text-field__input--${density}`, { 'ba-text-field__input--invalid': invalid }]"
      :aria-invalid="invalid || undefined"
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
      :class="[`ba-text-field__input--${density}`, { 'ba-text-field__input--invalid': invalid }]"
      :aria-invalid="invalid || undefined"
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

@media (prefers-reduced-motion: reduce) {
  .ba-text-field__input {
    transition: none;
  }
}
</style>
