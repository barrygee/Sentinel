<template>
  <section
    v-if="section.mode === 'replay'"
    class="section-playback-bar"
    :aria-label="`${sectionLabel} replay`"
    @keydown="onKeydown"
  >
    <div class="section-playback-bar-row">
      <span class="section-playback-bar-badge">REPLAY</span>
      <time
        class="section-playback-bar-moment"
        :datetime="new Date(section.cursorMs).toISOString()"
      >
        {{ formatReplayMoment(section.cursorMs) }}
      </time>
      <PlaybackTransport
        :playing="section.playing"
        step-label="1 minute"
        @toggle-playing="playback.setPlaying(sectionId, !section.playing)"
        @step-back="playback.step(sectionId, -STEP_MS)"
        @step-forward="playback.step(sectionId, STEP_MS)"
      />
      <PlaybackRateSelect
        :rates="PLAYBACK_RATES"
        :model-value="section.rate"
        @update:model-value="playback.setRate(sectionId, $event as PlaybackRate)"
      />
      <PlaybackLiveButton @go-live="playback.exitReplay(sectionId)" />
    </div>
    <div class="section-playback-bar-row">
      <PlaybackScrubber
        :range-start="rangeStart"
        :range-end="rangeEnd"
        :value="section.cursorMs"
        :accessible-name="`${sectionLabel} replay time`"
        :value-text="scrubberValueText"
        :coverage="coverageSpans"
        @seek="playback.seek(sectionId, $event)"
      />
      <PlaybackJumpTo
        :range-start="rangeStart"
        :range-end="rangeEnd"
        :value="section.cursorMs"
        @seek="playback.seek(sectionId, $event)"
      />
    </div>
    <!-- Announces jumps and play/pause, never every tick of playback. -->
    <p class="section-playback-bar-announcer" role="status" aria-live="polite">
      {{ announcement }}
    </p>
  </section>
</template>

<script setup lang="ts">
/**
 * The replay timeline for one section, shown while that section is in
 * replay: REPLAY badge and the replayed moment, transport, speed, LIVE, the
 * scrubber over the retention window (shaded where data was recorded) and a
 * go-to date/time.
 *
 * It owns the playback loop: while playing, every animation frame moves the
 * section's cursor on by the elapsed wall time × speed (`playback.advance`),
 * which returns to live on reaching the present. The maps read that cursor
 * through `playback.now(section)`, so nothing else needs a timer.
 *
 * Sits just above the footer, centred on the visible map with the same inset
 * rules as `MapNoticeBanner` and the altitude legend.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PlaybackJumpTo from '@sentinel/ui/playback/PlaybackJumpTo.vue'
import PlaybackLiveButton from '@sentinel/ui/playback/PlaybackLiveButton.vue'
import PlaybackRateSelect from '@sentinel/ui/playback/PlaybackRateSelect.vue'
import PlaybackScrubber, { type CoverageSpan } from '@sentinel/ui/playback/PlaybackScrubber.vue'
import PlaybackTransport from '@sentinel/ui/playback/PlaybackTransport.vue'
import { describeReplayMoment, formatReplayMoment } from '@sentinel/ui/utils/playbackTime'
import { fetchHistoryCoverage } from '@sentinel/shell-api/playback/historyApi'
import {
  PLAYBACK_RATES,
  type PlaybackRate,
  type PlaybackSectionId,
} from '@sentinel/shell-api/playback/playbackSections'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'

const props = withDefaults(
  defineProps<{
    sectionId: PlaybackSectionId
    /** The section's name for accessible labels (`Air`). */
    sectionLabel: string
    /**
     * Whether this section has recorded coverage to shade. Space has none: it
     * recomputes any moment from orbital elements, so its whole window is playable.
     */
    hasCoverage?: boolean
  }>(),
  // Vue casts an omitted boolean prop to false; coverage is the norm.
  { hasCoverage: true },
)

const STEP_MS = 60_000
/** Re-read coverage this often while replaying, so new recordings appear on the timeline. */
const COVERAGE_REFRESH_MS = 60_000

const playback = usePlaybackStore()
const section = computed(() => playback.sections[props.sectionId])

// The window's ends move with the wall clock; a coarse tick is plenty for a week-long range.
const wallClock = ref(Date.now())
const rangeEnd = computed(() => wallClock.value)
const rangeStart = computed(() => playback.rangeStartMs(props.sectionId, wallClock.value))

const coverageSpans = ref<CoverageSpan[]>([])
const announcement = ref('')

async function loadCoverage(): Promise<void> {
  if (!props.hasCoverage) {
    coverageSpans.value = [{ start: rangeStart.value, end: rangeEnd.value, source: 'online' }]
    return
  }
  const coverage = await fetchHistoryCoverage(props.sectionId)
  if (!coverage) return
  coverageSpans.value = coverage.buckets.map(([start, , source]) => ({
    start,
    end: start + coverage.bucketMs,
    source,
  }))
}

function sourceAt(moment: number): string | null {
  const span = coverageSpans.value.find((band) => band.start <= moment && moment < band.end)
  if (!span || !props.hasCoverage) return null
  return span.source === 'offgrid' ? 'off grid' : 'online'
}

const scrubberValueText = computed(() => {
  const source = sourceAt(section.value.cursorMs)
  const described = describeReplayMoment(section.value.cursorMs)
  return source ? `${described}, ${source}` : `${described}, no recorded data`
})

// ── Playback loop ──────────────────────────────────────────────────────────
let animationFrame: number | null = null
let lastFrameAt: number | null = null

function onAnimationFrame(timestamp: number): void {
  if (lastFrameAt !== null) playback.advance(props.sectionId, timestamp - lastFrameAt)
  lastFrameAt = timestamp
  animationFrame = section.value.playing ? requestAnimationFrame(onAnimationFrame) : null
}

function stopLoop(): void {
  if (animationFrame !== null) cancelAnimationFrame(animationFrame)
  animationFrame = null
  lastFrameAt = null
}

watch(
  () => section.value.playing,
  (playing) => {
    stopLoop()
    if (playing) animationFrame = requestAnimationFrame(onAnimationFrame)
  },
)

// ── Coverage and window refresh while replaying ───────────────────────────
let refreshTimer: ReturnType<typeof setInterval> | null = null

watch(
  () => section.value.mode,
  (mode) => {
    if (refreshTimer) clearInterval(refreshTimer)
    refreshTimer = null
    if (mode !== 'replay') {
      // The bar (and its live region) goes with replay; the map going live is the feedback.
      stopLoop()
      return
    }
    wallClock.value = Date.now()
    void loadCoverage()
    refreshTimer = setInterval(() => {
      wallClock.value = Date.now()
      void loadCoverage()
    }, COVERAGE_REFRESH_MS)
  },
  { immediate: true },
)

// Jumps and play/pause are announced; the cursor ticking while playing is not.
watch(
  () => section.value.seekVersion,
  () => {
    if (section.value.mode === 'replay') {
      announcement.value = `Replaying ${describeReplayMoment(section.value.cursorMs)}`
    }
  },
)
watch(
  () => section.value.playing,
  (playing) => {
    if (section.value.mode === 'replay') announcement.value = playing ? 'Playing' : 'Paused'
  },
)

/** Esc returns to live from anywhere in the bar; Space toggles play outside text fields and buttons. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    playback.exitReplay(props.sectionId)
    return
  }
  const target = event.target as HTMLElement
  const ownsSpace = target.closest('button, input[type="datetime-local"]') !== null
  if (event.key === ' ' && !ownsSpace) {
    event.preventDefault()
    playback.setPlaying(props.sectionId, !section.value.playing)
  }
}

onBeforeUnmount(() => {
  stopLoop()
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.section-playback-bar {
  /* How much of each side of the map the sidebar rails cover (see MapNoticeBanner). */
  --playback-bar-inset-left: 0px;
  --playback-bar-inset-right: 0px;

  position: fixed;
  bottom: calc(var(--footer-height) + 8px);
  left: calc(50% + (var(--playback-bar-inset-left) - var(--playback-bar-inset-right)) / 2);
  transform: translateX(-50%);
  /* Mobile first: the full width less a 16px gutter each side. */
  width: min(
    760px,
    calc(100% - var(--playback-bar-inset-left) - var(--playback-bar-inset-right) - 32px)
  );
  z-index: 1002;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  font-family: var(--font-primary);
  color: var(--rail-ink);
  background: var(--map-bar-bg, var(--rail-bg));
  border: 1px solid var(--rail-border);
  transition: left 0.2s ease;
}

@media (min-width: 769px) {
  .section-playback-bar {
    --playback-bar-inset-left: 44px;
    --playback-bar-inset-right: 44px;
  }
  body[data-sidebar-open] .section-playback-bar {
    /* Rail (44px) + open panel (386px). */
    --playback-bar-inset-left: 430px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .section-playback-bar {
    transition: none;
  }
}

.section-playback-bar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.section-playback-bar-badge {
  padding: 2px 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--accent-ink);
  background: var(--sev-warn);
}

.section-playback-bar-moment {
  flex: 1;
  min-width: 140px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.06em;
}

.section-playback-bar-announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
