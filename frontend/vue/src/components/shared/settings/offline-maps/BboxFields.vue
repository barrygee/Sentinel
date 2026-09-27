<template>
  <div class="settings-location-fields oma-bbox-fields">
    <div v-for="field in fields" :key="field.key" class="settings-location-field oma-bbox-field">
      <label class="settings-location-label" :for="`${idPrefix}-${field.key}`">{{
        field.label
      }}</label>
      <input
        :id="`${idPrefix}-${field.key}`"
        type="text"
        inputmode="decimal"
        class="settings-location-input"
        :class="{
          'settings-location-input--invalid': shouldValidate && fieldErrors[field.key] !== null,
        }"
        :value="fieldText[field.key]"
        :aria-invalid="shouldValidate && fieldErrors[field.key] !== null"
        :aria-describedby="
          shouldValidate && fieldErrors[field.key] !== null
            ? `${idPrefix}-${field.key}-error`
            : undefined
        "
        spellcheck="false"
        autocomplete="off"
        placeholder="0.000"
        @input="onInput(field.key, ($event.target as HTMLInputElement).value)"
        @focus="focusedField = field.key"
        @blur="onBlur(field.key)"
        @keydown.enter="($event.target as HTMLInputElement).blur()"
      />
      <p
        v-if="shouldValidate && fieldErrors[field.key] !== null"
        :id="`${idPrefix}-${field.key}-error`"
        class="settings-location-error oma-bbox-error"
        aria-live="polite"
      >
        {{ fieldErrors[field.key] }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `BboxFields` — labelled North/South/East/West decimal-degree inputs, kept
 * in sync with the drawn rectangle in both directions. This is the WCAG
 * 2.5.7-mandated accessible equivalent of dragging a rectangle on the canvas
 * — the only path a screen-reader (or keyboard-only, no-pointer) user has to
 * set an exact area — so every value the map can produce must also be
 * enterable and readable here.
 *
 * Each field keeps its own local text draft rather than rendering
 * `props.bounds` directly: reformatting the value to `toFixed(5)` on every
 * keystroke (as an earlier version did) makes the field literally untypeable,
 * since a half-typed "54.9" gets clobbered back to "0.00000" before the next
 * character lands. Instead:
 * - typing updates the local text immediately, and *also* emits a live
 *   `update:bounds` the moment the text parses to a number that differs from
 *   the current bound (so the map preview / other fields track a good value
 *   as you type) — but the field's own displayed text is never reformatted
 *   while it has focus;
 * - blur/Enter is the commit point that reformats the text to five decimal
 *   places (or, if the text doesn't parse, reverts it to the last good value);
 * - `props.bounds` only resyncs a field's text when that field does NOT have
 *   focus, so a field the operator is mid-typing in is never overwritten by,
 *   say, a draw-handler preview arriving for a different edge.
 *
 * Errors are suppressed for the pristine, never-touched draft (the default
 * 0/0/0/0 box would otherwise permanently show "North must be greater than
 * South" before the operator has done anything) — they appear once the
 * operator has interacted with a field, or once a real (non-degenerate) area
 * exists some other way (drawn, or "use current view").
 */
import { computed, reactive, ref, useId, watch } from 'vue'
import type { LngLatBounds } from './rectangleDrawHandler'
import { computeBboxFieldErrors } from './bboxValidation'

const props = defineProps<{
  bounds: LngLatBounds
}>()

const emit = defineEmits<{
  /** A field's parsed value changed and differs from the current bound. */
  'update:bounds': [bounds: LngLatBounds]
}>()

const idPrefix = useId()

type FieldKey = 'north' | 'south' | 'east' | 'west'
const fields: { key: FieldKey; label: string }[] = [
  { key: 'north', label: 'NORTH' },
  { key: 'south', label: 'SOUTH' },
  { key: 'east', label: 'EAST' },
  { key: 'west', label: 'WEST' },
]

/** True once the bounds describe an actual area rather than the empty 0/0/0/0 draft. */
function describesArea(bounds: LngLatBounds): boolean {
  return bounds.west !== bounds.east || bounds.south !== bounds.north
}

/** What a field shows for a bound: blank (so its placeholder appears, like the
 *  LOCATION fields) until an area exists, then the value to five places. */
function displayText(bounds: LngLatBounds, key: FieldKey): string {
  return describesArea(bounds) ? formatBound(bounds[key]) : ''
}

function formatBound(value: number): string {
  return Number.isFinite(value) ? value.toFixed(5) : ''
}

const fieldText = reactive<Record<FieldKey, string>>({
  north: displayText(props.bounds, 'north'),
  south: displayText(props.bounds, 'south'),
  east: displayText(props.bounds, 'east'),
  west: displayText(props.bounds, 'west'),
})

const focusedField = ref<FieldKey | null>(null)
/** True once the operator has typed in any field — part of the pristine-state gate. */
const hasInteracted = ref(false)

const hasArea = computed(() => describesArea(props.bounds))
const shouldValidate = computed(() => hasInteracted.value || hasArea.value)

watch(
  () => props.bounds,
  (bounds) => {
    for (const field of fields) {
      if (focusedField.value === field.key) continue
      fieldText[field.key] = displayText(bounds, field.key)
    }
  },
)

const fieldErrors = computed(() => computeBboxFieldErrors(props.bounds))

function onInput(key: FieldKey, rawValue: string): void {
  hasInteracted.value = true
  fieldText[key] = rawValue
  const parsed = Number(rawValue.trim())
  if (rawValue.trim() === '' || !Number.isFinite(parsed) || parsed === props.bounds[key]) return
  emit('update:bounds', { ...props.bounds, [key]: parsed })
}

/** Commit point: reformat to five decimal places, or revert an unparseable draft. */
function onBlur(key: FieldKey): void {
  if (focusedField.value === key) focusedField.value = null
  const parsed = Number(fieldText[key].trim())
  if (fieldText[key].trim() !== '' && Number.isFinite(parsed)) {
    fieldText[key] = formatBound(parsed)
    if (parsed !== props.bounds[key]) emit('update:bounds', { ...props.bounds, [key]: parsed })
  } else {
    fieldText[key] = displayText(props.bounds, key)
  }
}
</script>

<style scoped>
/* Styling is the settings panel's shared LOCATION field set. The form column
   already caps the width, so the pair grid fills it. */
.oma-bbox-fields {
  max-width: none;
}
</style>
