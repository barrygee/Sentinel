<template>
  <figure
    class="altitude-legend"
    :style="{
      '--altitude-legend-footer-left': `${footerClusters.left.value}px`,
      '--altitude-legend-footer-right': `${footerClusters.right.value}px`,
    }"
    aria-label="Aircraft altitude, in feet"
  >
    <div class="altitude-legend-scale">
      <div class="altitude-legend-bar" :style="{ background: gradient }" aria-hidden="true" />
      <ol class="altitude-legend-ticks">
        <li v-for="tick in ALTITUDE_LEGEND_TICKS_FEET" :key="tick">{{ tickLabel(tick) }}</li>
      </ol>
    </div>
  </figure>
</template>

<script setup lang="ts">
/**
 * The key to the map's altitude colours: the ramp with its altitudes marked.
 * It sits in the shell's footer bar, level with the side-panel and settings
 * buttons, but stays centred on the visible map rather than on the footer.
 */
import { computed } from 'vue'
import {
  ALTITUDE_LEGEND_TICKS_FEET,
  altitudeColour,
} from '@sentinel/map-kit/aircraft-silhouettes/altitudeColour'
import type { SilhouettePalette } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import { useFooterClusterWidths } from './composables/useFooterClusterWidths'

const props = defineProps<{
  /** The basemap on screen, whose colours the aircraft are drawn in. */
  palette: SilhouettePalette
}>()

/** The footer's button groups, which the legend shrinks to keep clear of. */
const footerClusters = useFooterClusterWidths()

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
  /* What covers each side of the visible map: nothing below 769px, where the
     rails are hidden; widened below. */
  --altitude-legend-inset-left: 0px;
  --altitude-legend-inset-right: 0px;
  /* How far the footer's button groups reach in from each edge, measured
     (`useFooterClusterWidths`), since the right group grows when, say, SDR's
     tuned frequency shows there. */
  --altitude-legend-footer-left: 0px;
  --altitude-legend-footer-right: 0px;
  /* Space kept between the legend and either button group. */
  --altitude-legend-gap: 12px;

  /* Over the footer bar (z-index 1000), filling its height above the safe area,
     so the key reads as part of the bar rather than floating over the map. */
  position: fixed;
  bottom: env(safe-area-inset-bottom, 0px);
  height: calc(var(--footer-height) - env(safe-area-inset-bottom, 0px));
  /* The centre of the visible map, between whatever covers each side. */
  left: calc(50% + (var(--altitude-legend-inset-left) - var(--altitude-legend-inset-right)) / 2);
  z-index: 1001;
  display: flex;
  align-items: center;
  /* Centred on the visible map, so it is twice the room on its tighter side:
     from the centre to whichever reaches further in on each side, the rail or
     the footer's button group, less the gap. (A fixed box's % is the window.) */
  width: max(
    0px,
    min(
      560px,
      calc(
        2 *
          min(
            50% + (var(--altitude-legend-inset-left) - var(--altitude-legend-inset-right)) / 2 -
              max(var(--altitude-legend-inset-left), var(--altitude-legend-footer-left)),
            50% - (var(--altitude-legend-inset-left) - var(--altitude-legend-inset-right)) / 2 -
              max(var(--altitude-legend-inset-right), var(--altitude-legend-footer-right))
          ) -
          2 * var(--altitude-legend-gap)
      )
    )
  );
  box-sizing: border-box;
  margin: 0;
  /* 2px on top: optical centring. This box's top is the footer's 1px top
     border, and the tick labels leave their descender space empty below the
     digits, so centring the box's content put the visible bar-and-labels about
     1px above the middle of the bar the operator sees. */
  padding: 2px 16px 0;
  transform: translateX(-50%);
  font-family: var(--font-primary);
  color: var(--rail-ink);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.08em;
  /* A key, not a control: clicks fall through to the footer underneath. */
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
