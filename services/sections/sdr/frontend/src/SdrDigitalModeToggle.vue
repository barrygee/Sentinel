<template>
  <div class="sdr-radio-section">
    <label class="sdr-field-label">DIGITAL MODE</label>
    <div class="sdr-mode-pills">
      <BasePillToggle
        class="sdr-mode-pill sdr-digital-btn"
        :active="enabled"
        active-class="sdr-digital-btn--active"
        :title="enabled ? 'Hide decoder' : 'Decode digital voice'"
        :aria-label="enabled ? 'Hide decoder' : 'Decode digital voice'"
        :aria-pressed="enabled"
        :disabled="disabled"
        @click="emit('toggle')"
      >
        DMR
      </BasePillToggle>
      <!-- No APRS button here by design: the APRS receiver is chosen
           in Settings → LAND, which reserves that radio and locks it
           out of this panel (see `radioReservation` in the SDR store).
           A toggle here would have started decode on the radio being
           viewed and instantly locked the operator out of it. -->
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The DIGITAL MODE row in the CONTROLS accordion: the DMR / P25 pill toggles
 * digital voice decoding, which also shows or hides the decoder dock under the
 * waterfall.
 */
import './SdrDigitalModeToggle.css'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'

defineProps<{
  /** Digital voice decoding is on. */
  enabled: boolean
  disabled: boolean
}>()

const emit = defineEmits<{ toggle: [] }>()
</script>
