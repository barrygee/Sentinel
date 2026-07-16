<template>
  <BaseAccordionSection v-model:expanded="expanded" title="SETTINGS" body-id="sdr-settings-section">
    <!-- Volume -->
    <BaseSliderRow
      label="VOLUME"
      :readout="`${volume}%`"
      :readout-dimmed="controlsDisabled"
      accessible-name="Volume"
      min="0"
      max="200"
      step="1"
      :value="volume"
      :disabled="controlsDisabled"
      @input="emit('volume-input', $event)"
    />

    <!-- Squelch -->
    <BaseSliderRow
      label="SQUELCH"
      :readout="`${squelch} dBFS`"
      :readout-dimmed="controlsDisabled"
      accessible-name="Squelch in dBFS"
      min="-120"
      max="0"
      step="1"
      :value="squelch"
      :disabled="controlsDisabled"
      @input="emit('squelch-input', $event)"
    />

    <!-- Bandwidth -->
    <BaseSliderRow
      label="BANDWIDTH"
      :readout="formatBwHz(bwHz)"
      :readout-dimmed="tuningDisabled"
      accessible-name="Bandwidth"
      min="1000"
      :max="bwMax"
      step="500"
      :value="bwHz"
      :disabled="tuningDisabled"
      @input="emit('bw-input', $event)"
    />

    <!-- RF Gain -->
    <BaseSliderRow
      label="RF GAIN"
      :readout="gainAuto ? 'AUTO' : `${gainDb.toFixed(1)} dB`"
      :readout-dimmed="controlsDisabled"
      accessible-name="RF gain in dB"
      min="-1"
      max="49"
      step="0.5"
      :value="gainDb"
      :disabled="tuningDisabled || gainAuto"
      @input="emit('gain-input', $event)"
    />

    <!-- AGC -->
    <div class="sdr-radio-section sdr-agc-row">
      <BaseCheckbox
        class="sdr-checkbox-label"
        input-class="sdr-checkbox"
        box-class="sdr-checkbox-custom"
        :checked="gainAuto"
        :disabled="tuningDisabled"
        @change="emit('agc-change', $event)"
      >
        <span class="sdr-checkbox-text">AGC (Automatic Gain Control)</span>
      </BaseCheckbox>
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
 * collapsible body come from BaseAccordionSection. The AGC checkbox family
 * (`.sdr-agc-row` / `.sdr-checkbox-*`) and the slider-row header family
 * (`.sdr-slider-header/-val`, shared by BaseSliderRow's rows and the
 * hand-rolled SAMPLE RATE header) are styled by the unscoped block below
 * (B10 CSS co-location); the range-input chrome lives in BaseSliderRow, and
 * the remaining styling (dropdown, section chrome) still lives in
 * SdrPanel.css (imported globally by SdrPanel.vue).
 */
import { ref } from 'vue'
import BaseAccordionSection from '@/components/base/BaseAccordionSection.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseSelectMenu from '@/components/base/BaseSelectMenu.vue'
import BaseSliderRow from '@/components/base/BaseSliderRow.vue'
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

<!-- Unscoped on purpose (B10 CSS co-location): the AGC checkbox and
     slider-row-header families moved here verbatim from SdrPanel.css.
     `scoped` would add [data-v] attribute selectors and RAISE specificity
     over the original global rules — and the classes sit on elements rendered
     by BaseCheckbox/BaseSliderRow, which don't carry this component's scope
     id anyway. This component hosts the slider-header family (rather than
     BaseSliderRow) because it contains BOTH renderers: BaseSliderRow's rows
     and the hand-rolled SAMPLE RATE header above the sample-rate dropdown.
     Loaded after SdrPanel.css (component modules import after SdrPanel.vue's
     leading CSS import), which preserves today's cascade: `.sdr-agc-row`
     keeps overriding `.sdr-radio-section`'s padding, and the remaining
     equal-specificity `.sdr-radio-section .sdr-field-label` rule in
     SdrPanel.css sets only `color` — disjoint from `.sdr-slider-header
     .sdr-field-label`'s layout props, so order between them is moot. -->
<style>
.sdr-slider-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.sdr-slider-header .sdr-field-label {
  margin-bottom: 0;
  flex: 1;
  min-width: 0;
}

.sdr-slider-val {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.25);
  letter-spacing: 0.1em;
  min-width: 60px;
  text-align: right;
  flex-shrink: 0;
}

.sdr-slider-val--dimmed {
  opacity: 0.25;
}

.sdr-agc-row {
  padding-top: 14px;
  padding-bottom: 14px;
}

.sdr-checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}

.sdr-checkbox {
  display: none;
}

.sdr-checkbox-custom {
  width: 14px;
  height: 14px;
  /* Flat dark: no border, just a subtle fill — matches the dropdowns/inputs. */
  border: none;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}

.sdr-checkbox:checked + .sdr-checkbox-custom {
  background: rgba(200, 255, 0, 0.12);
}

.sdr-checkbox:checked + .sdr-checkbox-custom::after {
  content: '';
  display: block;
  width: 8px;
  height: 5px;
  border-left: 1.5px solid #c8ff00;
  border-bottom: 1.5px solid #c8ff00;
  transform: rotate(-45deg) translateY(-1px);
}

.sdr-checkbox-text {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.06em;
}
</style>
