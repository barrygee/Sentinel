<template>
  <div class="playback-rate" role="radiogroup" aria-label="Replay speed">
    <BasePillToggle
      v-for="(rate, rateIndex) in rates"
      :key="rate"
      class="playback-pill"
      role="radio"
      :aria-checked="rate === modelValue"
      :aria-label="`${rate} times speed`"
      :active="rate === modelValue"
      active-class="playback-pill--active"
      :tabindex="keyboard.radioTabindex(rateIndex)"
      @click="emit('update:modelValue', rate)"
      @keydown="keyboard.onRadioKeydown($event, rateIndex)"
    >
      {{ rate }}×
    </BasePillToggle>
  </div>
</template>

<script setup lang="ts">
/** Replay speed as a segmented radio group (1×, 10×, 60×, 300×). */
import '@sentinel/ui/playback/playbackControls.css'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'

const props = defineProps<{ rates: readonly number[]; modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [rate: number] }>()

const keyboard = useRadioGroupKeyboard({
  optionCount: () => props.rates.length,
  selectedIndex: () => props.rates.indexOf(props.modelValue),
  select: (rateIndex) => emit('update:modelValue', props.rates[rateIndex]!),
})
</script>

<style scoped>
.playback-rate {
  display: flex;
  gap: 2px;
}
</style>
