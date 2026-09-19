<template>
  <div class="lrf">
    <!-- Styled as the SDR panel's section accordions are (`SdrPanel.css`
         `.sdr-scanner-header-row.sdr-frequency-manager-accordion-toggle`):
         a 44px bar, no border or background, 9px white title, chevron on the
         right that turns accent on hover/expanded. Those styles live with the
         SDR panel, hence the local copy. -->
    <button
      type="button"
      class="lrf-heading"
      :class="{ 'lrf-heading--expanded': expanded }"
      :aria-expanded="expanded"
      :aria-controls="bodyId"
      @click="expanded = !expanded"
    >
      <span class="lrf-heading-label">Repeater filters</span>
      <span class="lrf-heading-chevron"><ChevronIcon /></span>
    </button>
    <div v-show="expanded" :id="bodyId" class="lrf-body">
      <LandFilterChipRow label="Band" :options="bandOptions" @toggle="toggleBand" />
      <LandFilterChipRow label="Mode" :options="modeOptions" @toggle="toggleMode" />
      <LandFilterChipRow label="Status" :options="statusOptions" @toggle="setStatus" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `LandRepeaterFilters` — the BAND, MODE and STATUS chips for the REPEATERS
 * list in the Land FILTER pane, folded into an accordion directly under the
 * search box (collapsed by default, with the active narrowing summarised in
 * its header so a hidden filter is never a mystery). They narrow the map and
 * the list together and persist at once to `land.repeaterFilters`, so the
 * app-config JSON and other devices follow. ALL clears the band/mode rows
 * (the mode row lists only the modes the directory actually carries); STATUS
 * is single-select — all sites, on air, or off air.
 */
import { computed, ref } from 'vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import LandFilterChipRow, { type FilterChipOption } from './LandFilterChipRow.vue'
import { useRepeatersStore } from '@/stores/repeaters'
import {
  REPEATER_BAND_ORDER,
  REPEATER_MODE_CODES,
  repeaterModeLabel,
  stationModes,
} from '@/constants/repeaters'
import type { RepeaterModeCode, RepeaterStatusFilter } from '@/types/repeaters'

const ALL_KEY = '__all__'

const repeatersStore = useRepeatersStore()

const expanded = ref(false)
const bodyId = 'land-repeater-filters-body'

/** Only the modes the directory actually carries — no chip for a mode with
 *  no repeater behind it (all eleven until the directory has loaded). */
const availableModes = computed<RepeaterModeCode[]>(() => {
  if (repeatersStore.stations.length === 0) return [...REPEATER_MODE_CODES]
  const present = new Set(repeatersStore.stations.flatMap((station) => stationModes(station)))
  return REPEATER_MODE_CODES.filter((code) => present.has(code))
})

const bandOptions = computed<FilterChipOption[]>(() => [
  { key: ALL_KEY, label: 'All', active: repeatersStore.filters.bands.length === 0 },
  ...REPEATER_BAND_ORDER.map((band) => ({
    key: band,
    label: band,
    active: repeatersStore.filters.bands.includes(band),
  })),
])

const modeOptions = computed<FilterChipOption[]>(() => [
  { key: ALL_KEY, label: 'All', active: repeatersStore.filters.modes.length === 0 },
  ...availableModes.value.map((code) => ({
    key: code,
    label: repeaterModeLabel(code),
    active: repeatersStore.filters.modes.includes(code),
  })),
])

const STATUS_OPTIONS: { key: RepeaterStatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'operational', label: 'On air' },
  { key: 'offAir', label: 'Off air' },
]
const statusOptions = computed<FilterChipOption[]>(() =>
  STATUS_OPTIONS.map((option) => ({
    key: option.key,
    label: option.label,
    active: repeatersStore.filters.status === option.key,
  })),
)

function setStatus(key: string): void {
  repeatersStore.setStatusFilter(key as RepeaterStatusFilter)
}

function toggleBand(key: string): void {
  if (key === ALL_KEY) repeatersStore.clearBands()
  else repeatersStore.toggleBand(key)
}

function toggleMode(key: string): void {
  if (key === ALL_KEY) repeatersStore.clearModes()
  else repeatersStore.toggleMode(key as RepeaterModeCode)
}
</script>

<style scoped>
.lrf {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  /* Breathing room between the search box and the bar. */
  padding-top: 8px;
}
.lrf-heading {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 44px;
  padding: 0 44px 0 24px;
  margin: 0;
  border: none;
  background: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  text-transform: uppercase;
}
.lrf-heading:focus-visible {
  outline: 1px solid var(--color-accent, #c8ff00);
  outline-offset: -1px;
}
.lrf-heading-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: #fff;
}
/* Hover and expanded state light the chevron, never a background wash. */
.lrf-heading-chevron {
  position: absolute;
  right: 20px;
  top: 0;
  height: 44px;
  display: flex;
  align-items: center;
  color: rgba(255, 255, 255, 0.25);
  transform: rotate(-90deg);
  transition:
    transform 0.2s ease,
    color 0.15s;
}
.lrf-heading:hover .lrf-heading-chevron,
.lrf-heading--expanded .lrf-heading-chevron {
  color: var(--color-accent, #c8ff00);
}
.lrf-heading--expanded .lrf-heading-chevron {
  transform: rotate(0deg);
}
@media (prefers-reduced-motion: reduce) {
  .lrf-heading-chevron {
    transition: none;
  }
}
.lrf-body {
  display: flex;
  flex-direction: column;
  padding-bottom: 16px;
  /* The rows carry 16px of top padding between themselves; the first one
     sits closer to the bar than that. */
  margin-top: -8px;
}
</style>
