<template>
  <div class="sdr-devices-enabled-group" role="radiogroup" :aria-labelledby="labelledBy">
    <BasePillToggle
      v-for="(option, optionIndex) in OPTIONS"
      :key="option.value"
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
 * `LocalVisibilityToggle` — PUBLIC / PRIVATE for one device: whether this
 * machine's SDR Manager lists it in `GET /api/v1/sdrs`, the unauthenticated
 * list other Sentinels read. A radio group with the roving-tabindex keyboard
 * model (`useRadioGroupKeyboard`).
 */
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'

type Visibility = 'public' | 'private'

const props = defineProps<{
  modelValue: Visibility
  /** The id of the element naming the group (its form label). */
  labelledBy: string
}>()
const emit = defineEmits<{ 'update:modelValue': [Visibility] }>()

const OPTIONS: readonly { value: Visibility; label: string }[] = [
  { value: 'public', label: 'PUBLIC' },
  { value: 'private', label: 'PRIVATE' },
]

const keyboard = useRadioGroupKeyboard({
  optionCount: () => OPTIONS.length,
  selectedIndex: () => OPTIONS.findIndex((option) => option.value === props.modelValue),
  select: (optionIndex) => emit('update:modelValue', OPTIONS[optionIndex]!.value),
})
</script>
