<template>
  <div class="sdr-radio-section">
    <label class="sdr-field-label">MODULATION</label>
    <div class="sdr-mode-pills" role="radiogroup" aria-label="Demodulation mode">
      <BasePillToggle
        v-for="(mode, modeIndex) in modes"
        :key="mode"
        class="sdr-mode-pill"
        role="radio"
        :aria-checked="currentMode === mode"
        :tabindex="modeKeyboard.radioTabindex(modeIndex)"
        :active="currentMode === mode"
        active-class="active"
        :disabled="disabled"
        @click="emit('select', mode)"
        @keydown="modeKeyboard.onRadioKeydown($event, modeIndex)"
      >
        {{ mode }}
      </BasePillToggle>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The MODULATION radio group in the CONTROLS accordion: one pill per demod mode,
 * with a roving tabindex and arrow keys. An arrow key selects through the same
 * `select` event as a click, so both run the parent's one mode-change path.
 */
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'

const props = defineProps<{
  modes: readonly string[]
  currentMode: string
  disabled: boolean
}>()

const emit = defineEmits<{ select: [mode: string] }>()

const modeKeyboard = useRadioGroupKeyboard({
  optionCount: () => props.modes.length,
  selectedIndex: () => props.modes.indexOf(props.currentMode),
  select: (modeIndex) => emit('select', props.modes[modeIndex]!),
})
</script>
