<template>
  <div class="playback-scrubber">
    <div class="playback-scrubber-coverage" aria-hidden="true">
      <span
        v-for="band in bands"
        :key="`${band.source}-${band.start}`"
        class="playback-scrubber-band"
        :class="`playback-scrubber-band--${band.source}`"
        :style="{ left: `${band.left}%`, width: `${band.width}%` }"
      />
    </div>
    <input
      class="playback-scrubber-input"
      type="range"
      :aria-label="accessibleName"
      :aria-valuetext="valueText"
      :min="rangeStart"
      :max="rangeEnd"
      :step="1000"
      :value="value"
      @input="onInput"
      @keydown="onKeydown"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The replay timeline: a range input over the retention window, with the
 * stretches that hold recorded data shaded behind it (tinted by which feed
 * heard them, so a switch between online and off grid shows).
 *
 * The native range handles arrows (one second); PageUp/PageDown move an hour
 * and Home/End jump to the ends, which a week-long range needs to be usable
 * from the keyboard.
 */
import '@sentinel/ui/playback/playbackControls.css'
import { computed } from 'vue'

export interface CoverageSpan {
  start: number
  end: number
  source: string
}

const props = defineProps<{
  rangeStart: number
  rangeEnd: number
  value: number
  accessibleName: string
  /** Spoken value: the full date and time, plus the source heard then. */
  valueText: string
  coverage: CoverageSpan[]
}>()

const emit = defineEmits<{ seek: [epochMs: number] }>()

const HOUR_MS = 60 * 60 * 1000

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
        // At least a sliver, so a short burst of data is still visible.
        width: Math.max(0.15, ((end - start) / span) * 100),
      }
    })
})

function onInput(event: Event): void {
  emit('seek', Number((event.target as HTMLInputElement).value))
}

function onKeydown(event: KeyboardEvent): void {
  const jumps: Record<string, number> = {
    PageUp: props.value + HOUR_MS,
    PageDown: props.value - HOUR_MS,
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
.playback-scrubber {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 28px;
  display: flex;
  align-items: center;
}
.playback-scrubber-coverage {
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  height: 6px;
  transform: translateY(-50%);
  background: rgba(var(--rail-ink-rgb), 0.12);
  overflow: hidden;
}
.playback-scrubber-band {
  position: absolute;
  top: 0;
  bottom: 0;
}
.playback-scrubber-band--online {
  background: var(--accent);
}
.playback-scrubber-band--offgrid {
  background: var(--sev-warn);
}
.playback-scrubber-input {
  position: relative;
  width: 100%;
  margin: 0;
  background: transparent;
  accent-color: var(--rail-ink);
  /* 24px tall hit area (WCAG 2.5.8) over the 6px track drawn behind it. */
  height: 24px;
  cursor: pointer;
}
.playback-scrubber-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
