<template>
  <div class="sdr-search-adhoc-row">
    <div class="sdr-search-adhoc-col">
      <label class="sdr-field-label">LOW (MHz)</label>
      <input
        v-model="lowMhz"
        class="sdr-panel-input sdr-search-adhoc-input"
        aria-label="Search range low frequency in MHz"
        type="number"
        step="0.0001"
        required
        :disabled="inputsDisabled"
      />
    </div>
    <div class="sdr-search-adhoc-col">
      <label class="sdr-field-label">HIGH (MHz)</label>
      <input
        v-model="highMhz"
        class="sdr-panel-input sdr-search-adhoc-input"
        aria-label="Search range high frequency in MHz"
        type="number"
        step="0.0001"
        required
        :disabled="inputsDisabled"
      />
    </div>
    <div class="sdr-search-adhoc-col">
      <label class="sdr-field-label">STEP</label>
      <SdrStepPicker v-model="stepKhz" :disabled="inputsDisabled" />
    </div>
    <div class="sdr-search-adhoc-col sdr-search-adhoc-col--play">
      <SdrSweepPlayButton
        sweep-name="search"
        :running="searching"
        :disabled="playDisabled"
        @click="emit('toggleSearch')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The SEARCH accordion's one-off range: LOW and HIGH in MHz, the STEP, and the
 * button that starts or stops a sweep across them.
 */
import './SdrAdhocSearchRow.css'
import SdrStepPicker from './SdrStepPicker.vue'
import SdrSweepPlayButton from './SdrSweepPlayButton.vue'

/** The typed low edge, in MHz. */
const lowMhz = defineModel<string>('lowMhz', { required: true })
/** The typed high edge, in MHz. */
const highMhz = defineModel<string>('highMhz', { required: true })
/** The step, in kHz. */
const stepKhz = defineModel<string>('stepKhz', { required: true })

defineProps<{
  inputsDisabled: boolean
  /** A sweep of this range is running. */
  searching: boolean
  playDisabled: boolean
}>()

const emit = defineEmits<{ toggleSearch: [] }>()
</script>
