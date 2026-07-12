<template>
  <!-- Custom dropdown (NOT native <select>): native option lists are
       UA-rendered and can't be themed; reuse the app's flat-dark
       device-dropdown primitives instead. -->
  <BaseSelectMenu
    ref="selectMenuRef"
    class="sdr-ef-setting-dropdown"
    trigger-role="button"
    aria-label="Device sample rate"
    :menu-attrs="{ role: 'listbox', 'aria-label': 'Device sample rate options' }"
  >
    <template #selected>
      <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
        formatBwHz(sampleRateHz)
      }}</span>
    </template>
    <template #options>
      <div
        v-for="rate in SAMPLE_RATE_OPTIONS"
        :key="rate"
        class="sdr-device-menu-item"
        :class="{ 'sdr-device-menu-item--selected': rate === sampleRateHz }"
        role="option"
        :aria-selected="rate === sampleRateHz"
        @click="pickRate(rate)"
      >
        {{ formatBwHz(rate) }}
      </div>
    </template>
  </BaseSelectMenu>
</template>

<script setup lang="ts">
/**
 * SdrSampleRatePicker — the SAMPLE RATE dropdown used by the frequency-manager
 * add/edit forms' RADIO SETTINGS grid. It edits a *stored* frequency's sample
 * rate (a plain v-model number), not the connected device — the RADIO tab's
 * live sample-rate dropdown stays in SdrSettingsAccordion because picking
 * there sends a hardware command.
 *
 * The trigger + body-teleported listbox menu (and its dismiss behaviour:
 * outside click, settle-window scroll, resize) come from BaseSelectMenu,
 * whose default keyboard model (Enter/Space toggles, Escape closes) matches
 * this picker; this component keeps the rate option model and rows.
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref } from 'vue'
import BaseSelectMenu from '@/components/base/BaseSelectMenu.vue'
import { formatBwHz, SAMPLE_RATE_OPTIONS } from './sdrPanelUtils'

const sampleRateHz = defineModel<number>({ required: true })

const selectMenuRef = ref<InstanceType<typeof BaseSelectMenu> | null>(null)

function pickRate(rate: number) {
  // The options only render once the menu (and therefore the ref) exists.
  selectMenuRef.value!.closeMenu()
  // The menu only ever offers SAMPLE_RATE_OPTIONS values.
  /* v8 ignore start */
  if (!SAMPLE_RATE_OPTIONS.includes(rate as (typeof SAMPLE_RATE_OPTIONS)[number])) return
  /* v8 ignore stop */
  sampleRateHz.value = rate
}
</script>
