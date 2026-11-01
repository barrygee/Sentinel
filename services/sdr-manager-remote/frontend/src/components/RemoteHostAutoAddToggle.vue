<template>
  <div class="sdr-devices-enabled-group" role="radiogroup" :aria-labelledby="labelledBy">
    <BasePillToggle
      v-for="(option, optionIndex) in OPTIONS"
      :key="String(option.value)"
      class="sdr-devices-enabled-btn"
      role="radio"
      :aria-checked="modelValue === option.value"
      :tabindex="keyboard.radioTabindex(optionIndex)"
      :active="modelValue === option.value"
      active-class="is-active"
      @click="emit('update:modelValue', option.value)"
      @keydown="keyboard.onRadioKeydown($event, optionIndex)"
    >
      {{ option.label }}
    </BasePillToggle>
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostAutoAddToggle` — MANUALLY / AUTOMATICALLY for one Sentinel host:
 * whether its SDRs become radios one at a time with ADD, or every public SDR
 * on it becomes one by itself (`auto_add_sdrs`). A radio group with the
 * roving-tabindex keyboard model (`useRadioGroupKeyboard`).
 */
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'

const props = defineProps<{
  /** True to add the host's SDRs automatically. */
  modelValue: boolean
  /** The id of the element naming the group (its form label). */
  labelledBy: string
}>()
const emit = defineEmits<{ 'update:modelValue': [autoAdd: boolean] }>()

const OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: false, label: 'MANUALLY' },
  { value: true, label: 'AUTOMATICALLY' },
]

const keyboard = useRadioGroupKeyboard({
  optionCount: () => OPTIONS.length,
  selectedIndex: () => OPTIONS.findIndex((option) => option.value === props.modelValue),
  select: (optionIndex) => emit('update:modelValue', OPTIONS[optionIndex]!.value),
})
</script>
