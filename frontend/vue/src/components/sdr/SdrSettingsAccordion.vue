<template>
  <button
    type="button"
    class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
    :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': expanded }"
    :aria-expanded="expanded"
    aria-controls="sdr-settings-section"
    @click="expanded = !expanded"
  >
    <label class="sdr-field-label sdr-frequency-manager-scanner-title">SETTINGS</label>
    <span class="sdr-frequency-manager-accordion-chevron">
      <ChevronIcon />
    </span>
  </button>
  <div v-show="expanded" id="sdr-settings-section">
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
      <div
        ref="sampleRateDropdownRef"
        class="sdr-device-dropdown"
        :class="{
          'sdr-device-dropdown--open': sampleRateMenuOpen,
          'sdr-device-dropdown--loading': tuningDisabled,
        }"
        tabindex="0"
        @click.stop="toggleSampleRateMenu"
        @keydown="onSampleRateDropdownKey"
      >
        <div class="sdr-device-dropdown-selected">
          <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
            formatBwHz(sampleRateHz)
          }}</span>
          <span class="sdr-device-dropdown-arrow"></span>
        </div>
      </div>
      <Teleport to="body">
        <div
          v-if="sampleRateMenuOpen"
          class="sdr-device-menu sdr-device-menu--open"
          :style="sampleRateMenuStyle"
          @click.stop
        >
          <div
            v-for="r in SAMPLE_RATE_OPTIONS"
            :key="r"
            class="sdr-device-menu-item"
            :class="{ 'sdr-device-menu-item--selected': r === sampleRateHz }"
            @click="pickSampleRate(r)"
          >
            {{ formatBwHz(r) }}
          </div>
        </div>
      </Teleport>
    </div>
  </div>
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
 * The dropdown owns its dismiss behaviour like the other extracted pickers:
 * outside click, Escape, panel scroll past the open-settle window, and
 * window resize. Styling lives in SdrPanel.css (imported globally by
 * SdrPanel.vue).
 */
import { ref } from 'vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import { useWindowEvent } from '@/composables/useWindowEvent'
import { formatBwHz, MENU_OPEN_SETTLE_MS, SAMPLE_RATE_OPTIONS } from './sdrPanelUtils'

const props = defineProps<{
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
const sampleRateDropdownRef = ref<HTMLElement | null>(null)
const sampleRateMenuOpen = ref(false)
const sampleRateMenuStyle = ref<Record<string, string>>({})

// Armed at open time; scrolls within the settle window are the browser
// scrolling the focused trigger into view, not the user dismissing the menu.
let openedAtMs = 0

function positionSampleRateMenu() {
  const el = sampleRateDropdownRef.value
  // The dropdown is always rendered (the radio pane is mounted), so its ref is
  // populated whenever the menu is toggled open.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  sampleRateMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleSampleRateMenu() {
  if (props.controlsDisabled) return
  if (sampleRateMenuOpen.value) {
    closeSampleRateMenu()
    return
  }
  positionSampleRateMenu()
  sampleRateMenuOpen.value = true
  openedAtMs = Date.now()
}

function closeSampleRateMenu() {
  sampleRateMenuOpen.value = false
}

function onSampleRateDropdownKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleSampleRateMenu()
  }
  if (e.key === 'Escape') closeSampleRateMenu()
}

function pickSampleRate(v: number) {
  closeSampleRateMenu()
  emit('pick-sample-rate', v)
}

function closeOnScroll() {
  if (Date.now() - openedAtMs < MENU_OPEN_SETTLE_MS) return
  closeSampleRateMenu()
}

useDocumentEvent('click', closeSampleRateMenu)
// Capture phase so scrolls from the inner side-panel container (a descendant,
// and scroll doesn't bubble) still reach this handler and dismiss the menu.
useDocumentEvent('scroll', closeOnScroll, { capture: true })
useWindowEvent('resize', closeSampleRateMenu)
</script>
