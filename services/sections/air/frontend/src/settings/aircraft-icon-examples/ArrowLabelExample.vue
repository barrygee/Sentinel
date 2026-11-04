<script setup lang="ts">
/**
 * Example of the ARROW option: one aircraft label exactly as the map draws it
 * — black pill, direction arrow, callsign — built with the same map-kit label
 * parts and left/right rule the map's labels use, so the example can never
 * drift from the map.
 */
import { onMounted, ref } from 'vue'
import {
  appendMirrored,
  createDirectionArrowShape,
  createGlyphSvg,
  createGlyphWell,
  createLabelPill,
  createNameSegment,
  isLeftFacing,
} from '@sentinel/map-kit/map-label/mapLabelParts'
import { ARROW_COLOURS } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'

const props = withDefaults(
  defineProps<{
    /** Callsign shown in the label. */
    callsign?: string
    /** Track the arrow points along, in degrees clockwise from north. */
    trackDeg?: number
  }>(),
  { callsign: 'BAW123', trackDeg: 60 },
)

const labelHost = ref<HTMLElement | null>(null)

onMounted(() => {
  const label = createLabelPill()
  // The map's rule: an aircraft heading right (east) carries its label on the
  // left, so the arrow sits at the end it is travelling towards.
  const leftFacing = isLeftFacing(props.trackDeg)
  appendMirrored(
    label,
    [
      createGlyphWell(
        createGlyphSvg(createDirectionArrowShape(ARROW_COLOURS.civil), props.trackDeg),
      ),
      createNameSegment(props.callsign, leftFacing ? 'left' : 'right'),
    ],
    leftFacing,
  )
  labelHost.value?.replaceChildren(label)
})
</script>

<template>
  <span ref="labelHost" class="arrow-label-example" />
</template>

<style scoped>
.arrow-label-example {
  display: flex;
  /* The map label is sized for the map; it fits the tile without scaling. */
  pointer-events: none;
}
</style>
