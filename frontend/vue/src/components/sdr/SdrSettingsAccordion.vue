<template>
  <BaseAccordionSection v-model:expanded="expanded" title="SETTINGS" body-id="sdr-settings-section">
    <!-- Volume -->
    <div class="sdr-radio-section">
      <div class="sdr-slider-header">
        <label class="sdr-field-label">VOLUME</label>
        <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
          >{{ volume }}%</span
        >
      </div>
      <input
        class="sdr-panel-slider"
        type="range"
        aria-label="Volume"
        min="0"
        max="200"
        step="1"
        :value="volume"
        :disabled="controlsDisabled"
        @input="emit('volume-input', $event)"
      />
    </div>

    <!-- Squelch -->
    <div class="sdr-radio-section">
      <div class="sdr-slider-header">
        <label class="sdr-field-label">SQUELCH</label>
        <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
          >{{ squelch }} dBFS</span
        >
      </div>
      <input
        class="sdr-panel-slider"
        type="range"
        aria-label="Squelch in dBFS"
        min="-120"
        max="0"
        step="1"
        :value="squelch"
        :disabled="controlsDisabled"
        @input="emit('squelch-input', $event)"
      />
    </div>

    <!-- Bandwidth -->
    <div class="sdr-radio-section">
      <div class="sdr-slider-header">
        <label class="sdr-field-label">BANDWIDTH</label>
        <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': tuningDisabled }">{{
          formatBwHz(bwHz)
        }}</span>
      </div>
      <input
        class="sdr-panel-slider"
        type="range"
        aria-label="Bandwidth"
        min="1000"
        :max="bwMax"
        step="500"
        :value="bwHz"
        :disabled="tuningDisabled"
        @input="emit('bw-input', $event)"
      />
    </div>

    <!-- RF Gain -->
    <div class="sdr-radio-section">
      <div class="sdr-slider-header">
        <label class="sdr-field-label">RF GAIN</label>
        <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{
          gainAuto ? 'AUTO' : `${gainDb.toFixed(1)} dB`
        }}</span>
      </div>
      <input
        class="sdr-panel-slider"
        type="range"
        aria-label="RF gain in dB"
        min="-1"
        max="49"
        step="0.5"
        :value="gainDb"
        :disabled="tuningDisabled || gainAuto"
        @input="emit('gain-input', $event)"
      />
    </div>

    <!-- AGC -->
    <div class="sdr-radio-section sdr-agc-row">
      <label class="sdr-checkbox-label">
        <input
          type="checkbox"
          class="sdr-checkbox"
          :checked="gainAuto"
          :disabled="tuningDisabled"
          @change="emit('agc-change', $event)"
        />
        <span class="sdr-checkbox-custom"></span>
        <span class="sdr-checkbox-text">AGC (Automatic Gain Control)</span>
      </label>
    </div>

    <!-- Sample Rate (hardware) — sets the spectrum/waterfall span -->
    <div class="sdr-radio-section">
      <div class="sdr-slider-header">
        <label class="sdr-field-label">SAMPLE RATE</label>
        <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{
          formatBwHz(sampleRateHz)
        }}</span>
      </div>
      <!-- Custom dropdown (NOT native <select>): native option lists
           can't be styled (UA popup), and we want the menu to match
           the device dropdown above. Built off the same primitives. -->
      <BaseSelectMenu
        ref="sampleRateMenuRef"
        :loading="tuningDisabled"
        :disabled="controlsDisabled"
      >
        <template #selected>
          <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
            formatBwHz(sampleRateHz)
          }}</span>
        </template>
        <template #options>
          <div
            v-for="rateOption in SAMPLE_RATE_OPTIONS"
            :key="rateOption"
            class="sdr-device-menu-item"
            :class="{ 'sdr-device-menu-item--selected': rateOption === sampleRateHz }"
            @click="pickSampleRate(rateOption)"
          >
            {{ formatBwHz(rateOption) }}
          </div>
        </template>
      </BaseSelectMenu>
    </div>
  </BaseAccordionSection>
</template>

<script setup lang="ts">
/**
 * SdrSettingsAccordion — the RADIO tab's SETTINGS accordion: the volume,
 * squelch, bandwidth and RF-gain sliders, the AGC checkbox, and the hardware
 * SAMPLE RATE dropdown (with its own body-teleported menu).
 *
 * This is a pure view. Every control forwards its RAW DOM event to the
 * parent panel (`volume-input`, `squelch-input`, `bw-input`, `gain-input`,
 * `agc-change`), whose handlers own the engine side effects — the 150 ms
 * gain/squelch command debounces and the audio-worklet calls
 * (sdrAudio.setVolume/setSquelch/setBandwidthHz). Keeping those handlers in
 * the panel untouched is deliberate: the command cadence to the hardware and
 * worklet MUST NOT change. Picking a sample rate emits `pick-sample-rate`
 * with the chosen Hz; the parent validates, clamps the bandwidth ceiling and
 * sends the hardware command.
 *
 * The dropdown's trigger, teleported menu and dismiss behaviour (outside
 * click, settle-window scroll, resize) come from BaseSelectMenu, whose
 * default keyboard model + `disabled` gate match this dropdown's
 * controlsDisabled gating (the `--loading` style tracks tuningDisabled
 * separately, preserving the pre-extraction split). The SETTINGS header +
 * collapsible body come from BaseAccordionSection. Styling lives in
 * SdrPanel.css (imported globally by SdrPanel.vue).
 */
import { ref } from 'vue'
import BaseAccordionSection from '@/components/base/BaseAccordionSection.vue'
import BaseSelectMenu from '@/components/base/BaseSelectMenu.vue'
import { formatBwHz, SAMPLE_RATE_OPTIONS } from './sdrPanelUtils'

defineProps<{
  /** Audio volume percent (0–200). */
  volume: number
  /** Squelch threshold in dBFS. */
  squelch: number
  /** Demod-filter bandwidth in Hz (audio only — never reconfigures the device). */
  bwHz: number
  /** Bandwidth slider ceiling (tracks the hardware sample rate). */
  bwMax: number
  /** RF gain in dB (−1 renders as AUTO). */
  gainDb: number
  /** Whether AGC is on (disables the gain slider). */
  gainAuto: boolean
  /** Hardware sample rate in Hz. */
  sampleRateHz: number
  /** No usable radio: disables every control. */
  controlsDisabled: boolean
  /** Follower/read-only: additionally disables hardware-tuning controls. */
  tuningDisabled: boolean
}>()

const emit = defineEmits<{
  /** Raw input event from the VOLUME slider (parent handler owns side effects). */
  (event: 'volume-input', domEvent: Event): void
  /** Raw input event from the SQUELCH slider. */
  (event: 'squelch-input', domEvent: Event): void
  /** Raw input event from the BANDWIDTH slider. */
  (event: 'bw-input', domEvent: Event): void
  /** Raw input event from the RF GAIN slider. */
  (event: 'gain-input', domEvent: Event): void
  /** Raw change event from the AGC checkbox. */
  (event: 'agc-change', domEvent: Event): void
  /** A sample rate was picked from the dropdown menu. */
  (event: 'pick-sample-rate', rateHz: number): void
}>()

// Whether the accordion body is open. Expanded by default (matches the
// pre-extraction panel state).
const expanded = ref(true)

// ── Sample-rate dropdown ──────────────────────────────────────────────────────
const sampleRateMenuRef = ref<InstanceType<typeof BaseSelectMenu> | null>(null)

function pickSampleRate(v: number) {
  // The options only render once the menu (and therefore the ref) exists.
  sampleRateMenuRef.value!.closeMenu()
  emit('pick-sample-rate', v)
}
</script>
