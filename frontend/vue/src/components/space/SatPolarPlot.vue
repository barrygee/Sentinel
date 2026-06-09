<template>
  <div class="spp-polar">
    <svg
      :viewBox="`0 0 ${SIZE} ${SIZE}`"
      class="spp-polar-svg"
      role="img"
      aria-label="Satellite sky track polar plot"
    >
      <!-- Elevation rings: 0° (horizon), 30°, 60°. Centre = zenith (90°). -->
      <circle :cx="C" :cy="C" :r="elRadius(0)" class="spp-polar-ring spp-polar-ring--horizon" />
      <circle :cx="C" :cy="C" :r="elRadius(30)" class="spp-polar-ring" />
      <circle :cx="C" :cy="C" :r="elRadius(60)" class="spp-polar-ring" />
      <!-- Cardinal cross -->
      <line :x1="C" :y1="C - R" :x2="C" :y2="C + R" class="spp-polar-axis" />
      <line :x1="C - R" :y1="C" :x2="C + R" :y2="C" class="spp-polar-axis" />

      <!-- Pass arc -->
      <polyline v-if="track.length > 1" :points="trackPoints" class="spp-polar-track" />

      <!-- AOS / LOS endpoint markers -->
      <template v-if="endpoints">
        <circle :cx="endpoints.aos[0]" :cy="endpoints.aos[1]" r="3" class="spp-polar-aos" />
        <circle :cx="endpoints.los[0]" :cy="endpoints.los[1]" r="3" class="spp-polar-los" />
      </template>

      <!-- Live satellite position -->
      <g v-if="livePos">
        <circle :cx="livePos[0]" :cy="livePos[1]" r="6" class="spp-polar-sat-halo" />
        <circle :cx="livePos[0]" :cy="livePos[1]" r="3.5" class="spp-polar-sat" />
      </g>

      <!-- Cardinal labels -->
      <text :x="C" :y="LBL" class="spp-polar-label">N</text>
      <text :x="SIZE - LBL" :y="C + 3" class="spp-polar-label" text-anchor="end">E</text>
      <text :x="C" :y="SIZE - LBL + 6" class="spp-polar-label">S</text>
      <text :x="LBL" :y="C + 3" class="spp-polar-label" text-anchor="start">W</text>
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface SkyPoint {
  az: number
  el: number
}

const props = defineProps<{
  /** Az/el samples across the pass (az: 0=N clockwise, el: 0=horizon..90=zenith). */
  track: SkyPoint[]
  /** Optional live satellite az/el to overlay (when the pass is in progress). */
  live?: SkyPoint | null
}>()

const SIZE = 200 // svg coordinate space
const C = SIZE / 2 // centre (zenith)
const R = 88 // horizon radius
const LBL = 12 // label inset from edge

// Elevation maps linearly to radius: 90° (zenith) -> 0 (centre), 0° (horizon) -> R.
function elRadius(el: number): number {
  return R * (1 - Math.max(0, Math.min(90, el)) / 90)
}

// Az/el -> svg x/y. Azimuth 0=N (up), increasing clockwise.
function project(az: number, el: number): [number, number] {
  const r = elRadius(el)
  const a = (az - 90) * (Math.PI / 180) // rotate so 0°=up
  return [C + r * Math.cos(a), C + r * Math.sin(a)]
}

const trackPoints = computed(() =>
  props.track
    .map((p) =>
      project(p.az, p.el)
        .map((n) => n.toFixed(1))
        .join(','),
    )
    .join(' '),
)

const endpoints = computed(() => {
  if (props.track.length < 2) return null
  return {
    aos: project(props.track[0]!.az, props.track[0]!.el),
    los: project(props.track[props.track.length - 1]!.az, props.track[props.track.length - 1]!.el),
  }
})

const livePos = computed(() => (props.live ? project(props.live.az, props.live.el) : null))
</script>

<style scoped>
.spp-polar {
  display: flex;
  justify-content: center;
  padding: 4px 0 2px 0;
}

.spp-polar-svg {
  width: 100%;
  max-width: 220px;
  height: auto;
}

.spp-polar-ring {
  fill: none;
  stroke: rgba(255, 255, 255, 0.12);
  stroke-width: 1;
}

.spp-polar-ring--horizon {
  stroke: rgba(255, 255, 255, 0.25);
}

.spp-polar-axis {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}

.spp-polar-track {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 1.75;
  stroke-linejoin: round;
  stroke-linecap: round;
  opacity: 0.9;
}

.spp-polar-aos {
  fill: var(--color-accent);
}

.spp-polar-los {
  fill: none;
  stroke: var(--color-accent);
  stroke-width: 1.25;
}

.spp-polar-sat {
  fill: var(--color-accent);
}

.spp-polar-sat-halo {
  fill: var(--color-accent);
  opacity: 0.22;
}

.spp-polar-label {
  fill: rgba(255, 255, 255, 0.4);
  font-family: var(--font-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-anchor: middle;
}
</style>
