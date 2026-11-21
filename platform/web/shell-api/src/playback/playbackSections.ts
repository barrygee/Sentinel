/**
 * The sections that record movement history and can replay it, and the small
 * constants every part of replay shares (store, frame player, timeline bar).
 */

/** Sections with a history recorder (`<id>.historyEnabled`) and a replay mode. */
export const PLAYBACK_SECTIONS = ['air', 'sea', 'land', 'space'] as const
export type PlaybackSectionId = (typeof PLAYBACK_SECTIONS)[number]

/** Replay speeds the timeline offers, as multiples of real time. */
export const PLAYBACK_RATES = [1, 10, 60, 300] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

export const DAY_MS = 24 * 60 * 60 * 1000
export const DEFAULT_RETENTION_DAYS = 7
export const MIN_RETENTION_DAYS = 1
export const MAX_RETENTION_DAYS = 7

/** Where a fresh replay starts: an hour back, so there is movement to play straight away. */
export const DEFAULT_REPLAY_OFFSET_MS = 60 * 60 * 1000

/** The retention setting as whole days in 1–7, mirroring the backend's clamp. */
export function clampRetentionDays(value: unknown): number {
  const days = typeof value === 'number' ? Math.trunc(value) : Number.NaN
  if (!Number.isFinite(days)) return DEFAULT_RETENTION_DAYS
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, days))
}

export function isPlaybackSection(sectionId: string): sectionId is PlaybackSectionId {
  return (PLAYBACK_SECTIONS as readonly string[]).includes(sectionId)
}
