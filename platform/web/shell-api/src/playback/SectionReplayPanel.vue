<template>
  <section class="replay-panel" :aria-label="`${sectionLabel} replay`">
    <ReplayStatusHeader :replaying="controls.replaying.value" :moment-ms="section.cursorMs" />
    <ReplayTimeline
      :section-label="sectionLabel"
      :replaying="controls.replaying.value"
      :moment-ms="section.cursorMs"
      :range-start="rangeStart"
      :range-end="rangeEnd"
      :coverage="coverageSpans"
      :source="hasCoverage ? sourceAt(section.cursorMs) : null"
      @seek="controls.seek"
    />
    <ReplayCoverageLegend v-if="hasCoverage" />
    <ReplayTransport
      :playing="section.playing"
      :replaying="controls.replaying.value"
      step-label="1 minute"
      @toggle-playing="controls.togglePlaying"
      @step-back="controls.step(-REPLAY_STEP_MS)"
      @step-forward="controls.step(REPLAY_STEP_MS)"
      @go-live="controls.goLive"
    />
    <ReplaySpeed
      :rates="PLAYBACK_RATES"
      :model-value="section.rate"
      @update:model-value="controls.setRate($event as PlaybackRate)"
    />
    <ReplayJumpTo
      :range-start="rangeStart"
      :range-end="rangeEnd"
      :moment-ms="controls.replaying.value ? section.cursorMs : rangeEnd"
      @seek="controls.seek"
    />
    <p v-if="!hasCoverage" class="replay-panel-note">
      Positions for any moment in the window are recalculated from the orbits stored then.
    </p>
    <!-- Announces jumps, play/pause and going live — never every tick of playback. -->
    <p class="replay-panel-announcer" role="status" aria-live="polite">{{ announcement }}</p>
  </section>
</template>

<script setup lang="ts">
/**
 * A section's replay controls in the left side panel's REPLAY pane: status,
 * timeline (shaded where data was recorded), transport and LIVE, speed, and
 * go-to date/time. Built from the app's own slider row, chips, buttons and
 * text field. Using any control while live starts replay (useReplayControls);
 * the map keeps playing while the panel is closed (the loop lives with the
 * map, in useSectionReplay).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { describeReplayMoment } from '@sentinel/ui/utils/playbackTime'
import ReplayCoverageLegend from '@sentinel/shell-api/playback/ReplayCoverageLegend.vue'
import ReplayJumpTo from '@sentinel/shell-api/playback/ReplayJumpTo.vue'
import ReplaySpeed from '@sentinel/shell-api/playback/ReplaySpeed.vue'
import ReplayStatusHeader from '@sentinel/shell-api/playback/ReplayStatusHeader.vue'
import ReplayTimeline from '@sentinel/shell-api/playback/ReplayTimeline.vue'
import ReplayTransport from '@sentinel/shell-api/playback/ReplayTransport.vue'
import {
  PLAYBACK_RATES,
  type PlaybackRate,
  type PlaybackSectionId,
} from '@sentinel/shell-api/playback/playbackSections'
import { useHistoryCoverage } from '@sentinel/shell-api/playback/useHistoryCoverage'
import { REPLAY_STEP_MS, useReplayControls } from '@sentinel/shell-api/playback/useReplayControls'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'

const props = withDefaults(
  defineProps<{
    sectionId: PlaybackSectionId
    /** The section's name for accessible labels (`Air`). */
    sectionLabel: string
    /**
     * Whether the section has recorded coverage to shade. Space has none: it
     * recomputes any moment from orbital elements, so its whole window plays.
     */
    hasCoverage?: boolean
    /** The pane is on screen: coverage is kept fresh only then. */
    visible?: boolean
  }>(),
  { hasCoverage: true, visible: true },
)

/** Coarse wall-clock tick for the window's ends: plenty for a week-long range. */
const WINDOW_TICK_MS = 30_000

const playback = usePlaybackStore()
const controls = useReplayControls(props.sectionId)
const section = controls.section

const wallClock = ref(Date.now())
const windowTimer = setInterval(() => (wallClock.value = Date.now()), WINDOW_TICK_MS)
onBeforeUnmount(() => clearInterval(windowTimer))
const rangeEnd = computed(() => wallClock.value)
const rangeStart = computed(() => playback.rangeStartMs(props.sectionId, wallClock.value))

const { spans, sourceAt } = useHistoryCoverage(
  props.sectionId,
  props.hasCoverage,
  computed(() => props.visible),
)
const coverageSpans = computed(() =>
  props.hasCoverage
    ? spans.value
    : [{ start: rangeStart.value, end: rangeEnd.value, source: 'online' }],
)

const announcement = ref('')
watch(
  () => section.value.seekVersion,
  () => {
    if (controls.replaying.value) {
      announcement.value = `Replaying ${describeReplayMoment(section.value.cursorMs)}`
    }
  },
)
watch(
  () => section.value.playing,
  (playing) => {
    if (controls.replaying.value) announcement.value = playing ? 'Playing' : 'Paused'
  },
)
watch(controls.replaying, (replaying) => {
  if (!replaying) announcement.value = `${props.sectionLabel} is live`
})
</script>

<style scoped>
.replay-panel {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 20px 28px 24px;
  overflow-y: auto;
}
.replay-panel-note {
  margin: 0;
  font-family: var(--font-primary);
  font-size: 11px;
  line-height: 1.5;
  color: var(--ink-secondary);
}
.replay-panel-announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
