import { defineStore } from 'pinia'
import { reactive } from 'vue'
import {
  clampRetentionDays,
  DAY_MS,
  DEFAULT_REPLAY_OFFSET_MS,
  DEFAULT_RETENTION_DAYS,
  PLAYBACK_RATES,
  PLAYBACK_SECTIONS,
  type PlaybackRate,
  type PlaybackSectionId,
} from '@sentinel/shell-api/playback/playbackSections'

/** One section's replay state. Each section replays on its own: Air in replay leaves Sea live. */
export interface SectionPlaybackState {
  /** `<id>.historyEnabled`: recording on, so the replay entry point shows. */
  historyEnabled: boolean
  /** `<id>.historyRetentionDays`, clamped to 1–7: how far back the timeline reaches. */
  retentionDays: number
  mode: 'live' | 'replay'
  /** The replayed moment (Unix ms). Meaningless while live. */
  cursorMs: number
  playing: boolean
  rate: PlaybackRate
  /**
   * Bumped on every jump (entering replay, a seek, a step). Feeds compare it
   * with the last one they drew, and on a change start their picture afresh
   * rather than animating every aircraft across the jump.
   */
  seekVersion: number
}

function freshSectionState(): SectionPlaybackState {
  return {
    historyEnabled: false,
    retentionDays: DEFAULT_RETENTION_DAYS,
    mode: 'live',
    cursorMs: 0,
    playing: false,
    rate: 1,
    seekVersion: 0,
  }
}

/**
 * Replay state for every history-recording section, and the clock their maps
 * read. Not persisted: a reload always comes back live.
 *
 * `now(section)` is the one clock a section's movement code should read in
 * place of `Date.now()` — the wall clock while live, the replayed moment in
 * replay — so dead reckoning, staleness and ageing all work unchanged on
 * recorded data.
 */
export const usePlaybackStore = defineStore('playback', () => {
  const sections = reactive(
    Object.fromEntries(
      PLAYBACK_SECTIONS.map((sectionId) => [sectionId, freshSectionState()]),
    ) as Record<PlaybackSectionId, SectionPlaybackState>,
  )

  function now(sectionId: PlaybackSectionId): number {
    const section = sections[sectionId]
    return section.mode === 'replay' ? section.cursorMs : Date.now()
  }

  function isReplaying(sectionId: PlaybackSectionId): boolean {
    return sections[sectionId].mode === 'replay'
  }

  /** The oldest moment the timeline reaches: now less the retention window. */
  function rangeStartMs(sectionId: PlaybackSectionId, wallClockMs: number = Date.now()): number {
    return wallClockMs - sections[sectionId].retentionDays * DAY_MS
  }

  function clampToRange(sectionId: PlaybackSectionId, moment: number): number {
    const wallClock = Date.now()
    return Math.min(wallClock, Math.max(rangeStartMs(sectionId, wallClock), moment))
  }

  /**
   * Apply a section's stored settings (boot, APPLY CHANGES, config-file edit).
   * Turning recording off while replaying drops back to live: the entry point
   * is about to disappear, and nothing new will be recorded to replay.
   */
  function applyHistorySettings(
    sectionId: PlaybackSectionId,
    namespace: Record<string, unknown> | undefined,
  ): void {
    const section = sections[sectionId]
    section.historyEnabled = namespace?.historyEnabled === true
    section.retentionDays = clampRetentionDays(namespace?.historyRetentionDays)
    if (!section.historyEnabled && section.mode === 'replay') exitReplay(sectionId)
  }

  function setHistoryEnabled(sectionId: PlaybackSectionId, enabled: boolean): void {
    sections[sectionId].historyEnabled = enabled
    if (!enabled && sections[sectionId].mode === 'replay') exitReplay(sectionId)
  }

  function setRetentionDays(sectionId: PlaybackSectionId, days: number): void {
    sections[sectionId].retentionDays = clampRetentionDays(days)
  }

  function enterReplay(sectionId: PlaybackSectionId, atMs?: number): void {
    const section = sections[sectionId]
    section.mode = 'replay'
    section.playing = false
    section.cursorMs = clampToRange(sectionId, atMs ?? Date.now() - DEFAULT_REPLAY_OFFSET_MS)
    section.seekVersion++
  }

  function exitReplay(sectionId: PlaybackSectionId): void {
    const section = sections[sectionId]
    section.mode = 'live'
    section.playing = false
  }

  /** Jump to a moment (clamped to the retention window). Does nothing while live. */
  function seek(sectionId: PlaybackSectionId, atMs: number): void {
    const section = sections[sectionId]
    if (section.mode !== 'replay') return
    section.cursorMs = clampToRange(sectionId, atMs)
    section.seekVersion++
  }

  function step(sectionId: PlaybackSectionId, deltaMs: number): void {
    seek(sectionId, sections[sectionId].cursorMs + deltaMs)
  }

  function setPlaying(sectionId: PlaybackSectionId, playing: boolean): void {
    if (sections[sectionId].mode === 'replay') sections[sectionId].playing = playing
  }

  function setRate(sectionId: PlaybackSectionId, rate: PlaybackRate): void {
    if ((PLAYBACK_RATES as readonly number[]).includes(rate)) sections[sectionId].rate = rate
  }

  /**
   * Move a playing section's cursor on by `realElapsedMs` of wall time times
   * its rate. Reaching the present returns it to live — playing into "now"
   * is the seamless way back.
   */
  function advance(sectionId: PlaybackSectionId, realElapsedMs: number): void {
    const section = sections[sectionId]
    if (section.mode !== 'replay' || !section.playing || realElapsedMs <= 0) return
    const next = section.cursorMs + realElapsedMs * section.rate
    if (next >= Date.now()) {
      exitReplay(sectionId)
      return
    }
    section.cursorMs = next
  }

  return {
    sections,
    now,
    isReplaying,
    rangeStartMs,
    applyHistorySettings,
    setHistoryEnabled,
    setRetentionDays,
    enterReplay,
    exitReplay,
    seek,
    step,
    setPlaying,
    setRate,
    advance,
  }
})

export type PlaybackStore = ReturnType<typeof usePlaybackStore>
