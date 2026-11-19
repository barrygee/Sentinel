<template>
  <div class="sdr-freq-row">
    <input
      ref="inputElement"
      v-model="frequencyText"
      class="sdr-freq-input-large"
      type="text"
      aria-label="Tuned frequency in MHz"
      size="8"
      placeholder=""
      autocomplete="off"
      spellcheck="false"
      :disabled="disabled"
      :readonly="readonly"
      @keydown.enter="emit('tune')"
      @blur="emit('format')"
      @wheel.prevent="emit('wheel', $event)"
    />
    <span class="sdr-freq-unit">MHz</span>
    <SdrAddFrequencyButton v-if="unsavedHz !== null" @click="emit('add', unsavedHz)" />
  </div>
  <div v-if="label" class="sdr-freq-name">{{ label }}</div>
</template>

<script setup lang="ts">
/**
 * The large tuned-frequency readout: the MHz input (Enter tunes, the wheel
 * steps the digit under the cursor), the `+` that saves an unsaved frequency,
 * and the saved frequency's name underneath.
 *
 * The input element is exposed as `inputElement` because the parent's digit
 * wheel measures the text inside it to find the digit under the cursor.
 */
import './SdrFrequencyEntry.css'
import { ref } from 'vue'
import SdrAddFrequencyButton from './SdrAddFrequencyButton.vue'

/** The MHz text in the input, as typed (formatted by the parent on blur). */
const frequencyText = defineModel<string>({ required: true })

defineProps<{
  disabled: boolean
  /** Locked while the scanner drives the frequency. */
  readonly: boolean
  /** The typed frequency in Hz when it is valid and not saved yet, else null. */
  unsavedHz: number | null
  /** The saved frequency's name, or empty. */
  label: string
}>()

const emit = defineEmits<{
  tune: []
  format: []
  wheel: [event: WheelEvent]
  add: [frequencyHz: number]
}>()

const inputElement = ref<HTMLInputElement | null>(null)
defineExpose({ inputElement })
</script>
