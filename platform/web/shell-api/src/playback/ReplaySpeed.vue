<template>
  <div class="replay-speed">
    <span :id="labelId" class="replay-speed-label">SPEED</span>
    <div class="replay-speed-options" role="radiogroup" :aria-labelledby="labelId">
      <BaseChip
        v-for="(rate, rateIndex) in rates"
        :key="rate"
        role="radio"
        :aria-checked="rate === modelValue"
        :aria-label="`${rate} times speed`"
        :active="rate === modelValue"
        :tabindex="keyboard.radioTabindex(rateIndex)"
        @click="emit('update:modelValue', rate)"
        @keydown="keyboard.onRadioKeydown($event, rateIndex)"
      >
        {{ rate }}×
      </BaseChip>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Replay speed as a chip radio group (1×, 10×, 60×, 300×). */
import { useId } from 'vue'
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'

const props = defineProps<{ rates: readonly number[]; modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [rate: number] }>()

const labelId = `replay-speed-${useId()}`
const keyboard = useRadioGroupKeyboard({
  optionCount: () => props.rates.length,
  selectedIndex: () => props.rates.indexOf(props.modelValue),
  select: (rateIndex) => emit('update:modelValue', props.rates[rateIndex]!),
})
</script>

<style scoped>
.replay-speed {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.replay-speed-label {
  font-family: var(--font-primary);
  font-size: 9px;
  letter-spacing: 0.18em;
  color: var(--ink-strong);
}
.replay-speed-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
