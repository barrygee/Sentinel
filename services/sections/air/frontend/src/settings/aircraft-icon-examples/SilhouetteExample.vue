<script setup lang="ts">
/**
 * One aircraft as the SILHOUETTE option draws it: its type's outline at the
 * size the map draws it (zoomed out), turned to its track, with — when a
 * callsign is given — the plain text the map shows on hover or select.
 *
 * Drawn as an inline SVG from the same outline, colours and sizing the map's
 * icon images are rasterised from.
 */
import { computed } from 'vue'
import { silhouetteSvgFrame } from '@sentinel/map-kit/aircraft-silhouettes/aircraftSilhouette'
import {
  SILHOUETTE_BODY_SPREAD_PX,
  SILHOUETTE_COLOURS,
  SILHOUETTE_DETAIL_COLOURS,
  SILHOUETTE_DETAIL_WIDTH_PX,
  SILHOUETTE_OUTLINE_WIDTH_PX,
  silhouetteForShape,
  silhouetteIconSizePx,
} from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import { isLeftFacing } from '@sentinel/map-kit/map-label/mapLabelParts'
import { SILHOUETTE_TAG_CALLSIGN_PX } from '../../controls/adsb/silhouetteTagStyle'

const props = withDefaults(
  defineProps<{
    /** Shape to draw, e.g. `type:A320`. */
    shapeKey: string
    /** Track the aircraft is turned to, in degrees clockwise from north. */
    trackDeg?: number
    /** Callsign to show beside it, as on hover; omitted for an unhovered aircraft. */
    callsign?: string
  }>(),
  { trackDeg: 0, callsign: undefined },
)

const sizePx = computed(() => silhouetteIconSizePx(props.shapeKey))
/**
 * The map's rule for which side the text goes: an aircraft heading right
 * (east) carries it on the left, clear of where it is going.
 */
const textOnLeft = computed(() => isLeftFacing(props.trackDeg))
/** The outline and where it sits in the SVG, or `null` for an unknown shape. */
const drawing = computed(() => {
  const silhouette = silhouetteForShape(props.shapeKey)
  if (!silhouette) return null
  return {
    pathData: silhouette.pathData,
    frame: silhouetteSvgFrame(silhouette, SILHOUETTE_OUTLINE_WIDTH_PX, sizePx.value),
  }
})
</script>

<template>
  <span class="silhouette-example" :class="{ 'silhouette-example--text-left': textOnLeft }">
    <svg
      v-if="drawing"
      :width="sizePx"
      :height="sizePx"
      :viewBox="drawing.frame.viewBox"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g :transform="`rotate(${trackDeg})`">
        <path
          :d="drawing.pathData"
          :fill="SILHOUETTE_COLOURS.civil"
          :stroke="SILHOUETTE_COLOURS.civil"
          :stroke-width="2 * SILHOUETTE_BODY_SPREAD_PX"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
        <path
          :d="drawing.pathData"
          fill="none"
          :stroke="SILHOUETTE_DETAIL_COLOURS.dark"
          :stroke-width="SILHOUETTE_DETAIL_WIDTH_PX"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
      </g>
    </svg>
    <span
      v-if="callsign"
      class="silhouette-example-callsign"
      :style="`font-size:${SILHOUETTE_TAG_CALLSIGN_PX}px;`"
    >
      {{ callsign }}
    </span>
  </span>
</template>

<style scoped>
.silhouette-example {
  display: flex;
  align-items: center;
  gap: 3px;
}

.silhouette-example--text-left {
  flex-direction: row-reverse;
}

/* The map's hover and selected tag text (AdsbLiveControl._buildTagHTML). */
.silhouette-example-callsign {
  color: #ffffff;
  font-family: 'Barlow Condensed', 'Barlow', sans-serif;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
}
</style>
