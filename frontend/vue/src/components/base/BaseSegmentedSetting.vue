<template>
  <div class="settings-segmented-wrap">
    <div class="settings-segmented-group" role="radiogroup" :aria-label="accessibleName">
      <BasePillToggle
        v-for="(option, optionIndex) in options"
        :key="option.value"
        class="settings-segmented-btn"
        role="radio"
        :aria-checked="modelValue === option.value"
        :tabindex="keyboard.radioTabindex(optionIndex)"
        :active="modelValue === option.value"
        active-class="is-active"
        :data-value="option.value"
        @click="select(option.value)"
        @keydown="keyboard.onRadioKeydown($event, optionIndex)"
      >
        {{ option.label }}
      </BasePillToggle>
    </div>
  </div>
</template>

<script setup lang="ts" generic="TValue extends string">
import BasePillToggle from './BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@/composables/useRadioGroupKeyboard'

/**
 * `BaseSegmentedSetting` — a single-select segmented control for the Settings
 * panel: a labelled `radiogroup` of pills with the arrow-key/roving-tabindex
 * behaviour a radio group is expected to have.
 *
 * The shape is `SourceOverrideControl`'s, lifted so the theme rows (and any
 * later three-way setting) share it rather than re-deriving the ARIA and the
 * keyboard model. Callers own persistence: this emits the picked value and
 * nothing else, which keeps it usable both for staged settings and for
 * immediate ones.
 */
const props = defineProps<{
  /** The selected value. */
  modelValue: TValue
  /** The choices, in the order they are rendered. */
  options: ReadonlyArray<{ value: TValue; label: string }>
  /** Accessible name for the group — the setting, not the options. */
  accessibleName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: TValue] }>()

const keyboard = useRadioGroupKeyboard({
  optionCount: () => props.options.length,
  selectedIndex: () => props.options.findIndex((option) => option.value === props.modelValue),
  select: (optionIndex: number) => {
    const option = props.options[optionIndex]
    /* v8 ignore start -- the composable wraps its index with the option count
       it is handed, so it can only ever name a rendered option; the guard is
       here because `noUncheckedIndexedAccess` types the lookup as possibly
       undefined, not because it can happen. */
    if (!option) return
    /* v8 ignore stop */
    select(option.value)
  },
})

function select(value: TValue): void {
  if (value === props.modelValue) return
  emit('update:modelValue', value)
}
</script>
