<template>
  <div class="local-field">
    <div class="sdr-devices-form-row">
      <label class="sdr-devices-form-label" :for="fieldId">{{ label }}</label>
      <slot :described-by="describedBy" :invalid="error !== null" />
    </div>
    <p v-if="hint" :id="hintId" class="local-field-hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="sdr-devices-form-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * `LocalFormField` — one labelled row of a THIS MACHINE form: the label, the
 * input the caller puts in the slot, and an optional hint and error below it.
 *
 * The slot receives `describedBy` (the hint and error ids) and `invalid`, to
 * bind as the input's `aria-describedby` and `aria-invalid`, so a screen reader
 * reads the error with the field. The caller gives its input `id="fieldId"`.
 */
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    /** The input's id, which the label points at. */
    fieldId: string
    hint?: string
    error?: string | null
  }>(),
  { hint: '', error: null },
)

const hintId = computed(() => `${props.fieldId}-hint`)
const errorId = computed(() => `${props.fieldId}-error`)
const describedBy = computed(
  () =>
    [props.hint ? hintId.value : null, props.error ? errorId.value : null]
      .filter((id) => id !== null)
      .join(' ') || undefined,
)
</script>

<style scoped>
.local-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.local-field-hint {
  margin: 0 0 0 124px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  color: var(--ink-secondary);
}
@media (max-width: 600px) {
  .local-field-hint {
    margin-left: 0;
  }
}
</style>
