<template>
  <figure class="altitude-legend" :style="{ background: AIRFIELD_LABEL_FILLS[palette] }">
    <figcaption class="altitude-legend-title">ALT</figcaption>
    <div class="altitude-legend-scale">
      <div class="altitude-legend-bar" :style="{ background: gradient }" aria-hidden="true" />
      <ol class="altitude-legend-ticks">
        <li v-for="tick in ALTITUDE_LEGEND_TICKS_FEET" :key="tick">{{ tickLabel(tick) }}</li>
      </ol>
    </div>
  </figure>
</template>

<script setup lang="ts">
/** The key to the map's altitude colours: the ramp with its altitudes marked. */
import { computed } from 'vue'
import {
  ALTITUDE_LEGEND_TICKS_FEET,
  altitudeColour,
} from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'
import type { SilhouettePalette } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import { AIRFIELD_LABEL_FILLS } from './controls/airfield-label/AirfieldMarkers'

const props = defineProps<{
  /** The basemap on screen, whose colours the aircraft are drawn in. */
  palette: SilhouettePalette
}>()

/** The ramp, each tick's colour evenly spaced to match the labels under it. */
const gradient = computed(() => {
  const lastIndex = ALTITUDE_LEGEND_TICKS_FEET.length - 1
  const stops = ALTITUDE_LEGEND_TICKS_FEET.map(
    (tick, index) => `${altitudeColour(tick, props.palette)} ${(index / lastIndex) * 100}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
})

/** `40k+` for the top of the ramp, `2k` for the rest, `0` at the ground. */
function tickLabel(tickFeet: number): string {
  if (tickFeet === 0) return '0'
  const isTop = tickFeet === ALTITUDE_LEGEND_TICKS_FEET.at(-1)
  return `${tickFeet / 1000}k${isTop ? '+' : ''}`
}
</script>

<style scoped>
.altitude-legend {
  /* The rails and open panel either side of the visible map; widened below. */
  --altitude-legend-inset-left: 0px;
  --altitude-legend-inset-right: 0px;

  position: fixed;
  bottom: 56px;
  /* The centre of the visible map, between whatever covers each side. */
  left: calc(50% + (var(--altitude-legend-inset-left) - var(--altitude-legend-inset-right)) / 2);
  z-index: 2;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: min(
    560px,
    calc(100vw - var(--altitude-legend-inset-left) - var(--altitude-legend-inset-right) - 24px)
  );
  margin: 0;
  padding: 11px 16px 9px;
  transform: translateX(-50%);
  font-family: var(--font-primary);
  color: #ffffff;
  font-size: 10px;
  letter-spacing: 0.08em;
  /* A key, not a control: the map underneath stays draggable. */
  pointer-events: none;
  transition: left 0.2s ease;
}

/* From 769px the sidebar sits beside the map rather than over it, as
   `MapNoticeBanner` allows for: the rails are always there, and MapSidebar sets
   `data-sidebar-open` on <body> while its panel is. */
@media (min-width: 769px) {
  .altitude-legend {
    --altitude-legend-inset-left: 44px;
    --altitude-legend-inset-right: 44px;
  }

  body[data-sidebar-open] .altitude-legend {
    /* Rail (44px) + open panel (386px). */
    --altitude-legend-inset-left: 430px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .altitude-legend {
    transition: none;
  }
}

.altitude-legend-title {
  flex-shrink: 0;
  /* The bar's height, so the word sits level with the bar, not the labels. */
  line-height: 6px;
  white-space: nowrap;
}

.altitude-legend-scale {
  flex: 1;
  min-width: 0;
}

.altitude-legend-bar {
  height: 6px;
}

.altitude-legend-ticks {
  display: flex;
  justify-content: space-between;
  margin: 3px 0 0;
  padding: 0;
  list-style: none;
}
</style>
