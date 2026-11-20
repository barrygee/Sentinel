<template>
  <div class="sat-acc-section sat-acc-section--polar">
    <div class="sat-acc-section-title sat-acc-polar-title">
      <span>{{ title }}</span>
      <span v-if="plottedPass" class="sat-acc-polar-maxel"
        >MAX {{ plottedPass.max_elevation_deg.toFixed(0) }}°</span
      >
    </div>
    <SatPolarPlot
      v-if="plottedPass && plottedPass.sky_track && plottedPass.sky_track.length > 1"
      :track="plottedPass.sky_track"
      :live="liveMarker"
    />
    <div v-else class="sat-acc-polar-empty">
      {{ loading ? 'COMPUTING ARC…' : 'NO UPCOMING PASS TO PLOT' }}
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The POLAR PLOT section of an expanded satellite accordion: the sky track of
 * the pass in progress, or else the next one, with the satellite's live
 * position on it while that pass is under way.
 */
import { computed } from 'vue'
import SatPolarPlot from './SatPolarPlot.vue'
import { formatPassDate, formatPassTime } from './utils/satelliteUtils'
import type { AccPass, SkyPoint } from './spacePassesUtils'

const props = defineProps<{
  /** The satellite's upcoming passes, soonest first. */
  passes: AccPass[]
  /** Current time (ms): passes whose AOS is after it count as upcoming. */
  now: number
  /**
   * Whether a pass is in progress. A function rather than a derived value
   * because the two panes have always judged it differently: the satellite
   * list against the wall clock, the PASSES pane against its ticked `now`.
   */
  isPassActive: (pass: AccPass) => boolean
  /** The satellite's latest look-angles, or null before the first annotated update. */
  liveAzEl: SkyPoint | null
  /** True while the passes are being computed. */
  loading: boolean
}>()

// The pass to plot: the active (in-progress) pass if there is one, else the next.
const plottedPass = computed<AccPass | null>(() => {
  if (!props.passes.length) return null
  const active = props.passes.find((pass) => props.isPassActive(pass))
  if (active) return active
  return props.passes.find((pass) => pass.aos_unix_ms > props.now) ?? null
})

const title = computed(() => {
  const pass = plottedPass.value
  if (!pass) return 'NEXT PASS'
  const label = props.isPassActive(pass) ? 'CURRENT PASS' : 'NEXT PASS'
  return `${label} · ${formatPassDate(pass.aos_utc)} ${formatPassTime(pass.aos_utc)}`
})

// Show the live marker only while the plotted pass is actually in progress.
const liveMarker = computed<SkyPoint | null>(() => {
  const pass = plottedPass.value
  if (!pass || !props.isPassActive(pass)) return null
  return props.liveAzEl
})
</script>
