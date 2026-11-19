<script setup lang="ts">
/**
 * The info box floating over the frozen spectrum and waterfall while a
 * frequency-range search ("Searching", with its progress bar and range) or a
 * group scan ("Scanning", with the group chips) sweeps. Renders nothing
 * otherwise.
 */
import './SdrWaterfallSearchOverlay.css'
import { computed } from 'vue'
import BaseChip from '@sentinel/ui/base/BaseChip.vue'
import { useSdrStore } from './stores/sdr'

const store = useSdrStore()

// The search's range and progress, shaped into the strings and fraction the
// box renders.
const searchOverlayLowMHz = computed(() =>
  store.searchLowHz != null ? (store.searchLowHz / 1e6).toFixed(4) : '—',
)
const searchOverlayHighMHz = computed(() =>
  store.searchHighHz != null ? (store.searchHighHz / 1e6).toFixed(4) : '—',
)
const searchOverlayProgressPct = computed(() => {
  const lo = store.searchLowHz
  const hi = store.searchHighHz
  const cur = store.searchCurrentHz
  if (lo == null || hi == null || cur == null || hi <= lo) return 0
  const pct = ((cur - lo) / (hi - lo)) * 100
  return Math.max(0, Math.min(100, pct))
})
</script>

<template>
  <div v-if="store.searchSweeping" class="sdr-wf-search-overlay">
    <div class="sdr-wf-search-overlay-inner">
      <div class="sdr-wf-search-overlay-stack">
        <div class="sdr-wf-search-overlay-headline">Searching</div>
        <div v-if="store.searchLabel" class="sdr-wf-scan-overlay-groups">
          <BaseChip as="span" active>{{ store.searchLabel }}</BaseChip>
        </div>
        <div
          class="sdr-wf-search-overlay-progress"
          aria-label="Search progress"
          :aria-valuenow="searchOverlayProgressPct"
          aria-valuemin="0"
          aria-valuemax="100"
          role="progressbar"
        >
          <div
            class="sdr-wf-search-overlay-progress-fill"
            :style="{ width: searchOverlayProgressPct + '%' }"
          ></div>
        </div>
        <div class="sdr-wf-search-overlay-range">
          <span class="sdr-wf-search-overlay-range-val">{{ searchOverlayLowMHz }}</span>
          <span class="sdr-wf-search-overlay-range-sep">→</span>
          <span class="sdr-wf-search-overlay-range-val">{{ searchOverlayHighMHz }}</span>
          <span class="sdr-wf-search-overlay-range-unit">MHz</span>
        </div>
      </div>
    </div>
  </div>
  <div v-else-if="store.scanSweeping" class="sdr-wf-search-overlay">
    <div class="sdr-wf-search-overlay-inner">
      <div class="sdr-wf-search-overlay-stack">
        <div class="sdr-wf-search-overlay-headline">Scanning</div>
        <div class="sdr-wf-scan-overlay-groups">
          <BaseChip
            v-for="(name, idx) in store.scanGroupNames"
            :key="name + idx"
            as="span"
            active
            >{{ name }}</BaseChip
          >
        </div>
      </div>
    </div>
  </div>
</template>
