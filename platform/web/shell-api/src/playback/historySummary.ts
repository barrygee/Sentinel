/**
 * Helpers for the History & Replay setting's summary: the stretches recorded
 * so far (merged from the timeline coverage) and sizes in human units.
 */
import type { CoverageBucket } from '@sentinel/shell-api/playback/historyApi'

/** One unbroken stretch of recorded data. */
export interface RecordedPeriod {
  start: number
  end: number
  /** Which feeds recorded it: 'online', 'offgrid' or both. */
  sources: string[]
}

/**
 * Join coverage buckets into unbroken stretches, newest last. Buckets that
 * touch (one starts where the last ended) are one stretch; a bucket with no
 * data in between is a gap. Times are as fine as the coverage buckets
 * (a minute for short spans, a few minutes across a week).
 */
export function mergeCoveragePeriods(
  buckets: CoverageBucket[],
  bucketMs: number,
): RecordedPeriod[] {
  const ordered = [...buckets].sort((left, right) => left[0] - right[0])
  const periods: RecordedPeriod[] = []
  for (const [start, , source] of ordered) {
    const end = start + bucketMs
    const last = periods.at(-1)
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end)
      if (!last.sources.includes(source)) last.sources.push(source)
    } else {
      periods.push({ start, end, sources: [source] })
    }
  }
  for (const period of periods) period.sources.sort()
  return periods
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/** `18 NOV 05:10` in UTC. */
export function formatPeriodEdge(epochMs: number): string {
  const moment = new Date(epochMs)
  return `${twoDigits(moment.getUTCDate())} ${MONTHS[moment.getUTCMonth()]} ${twoDigits(moment.getUTCHours())}:${twoDigits(moment.getUTCMinutes())}`
}

/** `18 NOV 05:10 – 22 NOV 13:20 UTC`. */
export function formatPeriod(start: number, end: number): string {
  return `${formatPeriodEdge(start)} – ${formatPeriodEdge(end)} UTC`
}

/** `ONLINE`, `OFF GRID` or `ONLINE + OFF GRID`. */
export function formatSources(sources: string[]): string {
  return sources.map((source) => (source === 'offgrid' ? 'OFF GRID' : 'ONLINE')).join(' + ')
}

/** Bytes as KB / MB / GB (binary units, as the OS reports file sizes). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 KB'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}
