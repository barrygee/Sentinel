<template>
  <BaseSliderRow
    class="replay-timeline"
    label="TIMELINE"
    :readout="readout"
    :value-text="valueText"
    :readout-dimmed="!replaying"
    :accessible-name="`${sectionLabel} replay time`"
    :min="rangeStart"
    :max="rangeEnd"
    :step="1000"
    :value="replaying ? momentMs : rangeEnd"
    @input="onInput"
    @keydown="onKeydown"
  >
    <template #track>
      <div class="replay-timeline-coverage" aria-hidden="true">
        <span
          v-for="band in bands"
          :key="`${band.source}-${band.start}`"
          class="replay-timeline-band"
          :class="`replay-timeline-band--${band.source}`"
          :style="{ left: `${band.left}%`, width: `${band.width}%` }"
        />
      </div>
    </template>
  </BaseSliderRow>
</template>

<script setup lang="ts">
/**
 * The replay timeline: the app's slider row over the retention window, with
 * the stretches that hold recorded data shaded under the track (online or off
 * grid). Arrows move a second; PageUp/PageDown an hour; Home/End the ends.
 */
import { computed } from 'vue'
import BaseSliderRow from '@sentinel/ui/base/BaseSliderRow.vue'
import { describeReplayMoment } from '@sentinel/ui/utils/playbackTime'
import type { CoverageSpan } from '@sentinel/shell-api/playback/useHistoryCoverage'

const props = defineProps<{
  sectionLabel: string
  replaying: boolean
  momentMs: number
  rangeStart: number
  rangeEnd: number
  coverage: CoverageSpan[]
  /** 'online' / 'off grid' at the moment, or null with no recorded data there. */
  source: string | null
}>()

const emit = defineEmits<{ seek: [epochMs: number] }>()

const HOUR_MS = 60 * 60 * 1000

/** The short readout beside the label: live, or which feed recorded the moment (the heading shows the time). */
const readout = computed(() => {
  if (!props.replaying) return 'LIVE'
  return props.source ? props.source.toUpperCase() : 'NO DATA'
})

/** What a screen reader hears as the slider's value: the full moment and its source. */
const valueText = computed(() => {
  if (!props.replaying) return 'Live'
  const moment = describeReplayMoment(props.momentMs)
  return props.source ? `${moment}, ${props.source}` : `${moment}, no recorded data`
})

const bands = computed(() => {
  const span = props.rangeEnd - props.rangeStart
  if (span <= 0) return []
  return props.coverage
    .filter((band) => band.end > props.rangeStart && band.start < props.rangeEnd)
    .map((band) => {
      const start = Math.max(band.start, props.rangeStart)
      const end = Math.min(band.end, props.rangeEnd)
      return {
        start,
        source: band.source === 'offgrid' ? 'offgrid' : 'online',
        left: ((start - props.rangeStart) / span) * 100,
        // At least a sliver, so a short burst of data still shows.
        width: Math.max(0.3, ((end - start) / span) * 100),
      }
    })
})

function onInput(event: Event): void {
  emit('seek', Number((event.target as HTMLInputElement).value))
}

function onKeydown(event: KeyboardEvent): void {
  const from = props.replaying ? props.momentMs : props.rangeEnd
  const jumps: Record<string, number> = {
    PageUp: from + HOUR_MS,
    PageDown: from - HOUR_MS,
    Home: props.rangeStart,
    End: props.rangeEnd,
  }
  const target = jumps[event.key]
  if (target === undefined) return
  event.preventDefault()
  emit('seek', Math.min(props.rangeEnd, Math.max(props.rangeStart, target)))
}
</script>

<style scoped>
.replay-timeline-coverage {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 3px;
  transform: translateY(-50%);
  border-radius: 2px;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}
.replay-timeline-band {
  position: absolute;
  top: 0;
  bottom: 0;
}
.replay-timeline-band--online {
  background: rgba(var(--accent-rgb), 0.55);
}
.replay-timeline-band--offgrid {
  background: rgba(var(--warn-rgb), 0.7);
}
/* The bands sit on the track; the thumb stays above them. */
.replay-timeline :deep(.base-slider-row-input) {
  background: var(--surface);
}
.replay-timeline :deep(.base-slider-row-input::-webkit-slider-thumb) {
  position: relative;
  z-index: 2;
}
</style>
