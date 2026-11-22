/**
 * Time formatting for the replay timeline. Always UTC, labelled so: replayed
 * movement is compared with logs, ATC and AIS times, which are all UTC.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function twoDigits(value: number): string {
  return String(value).padStart(2, '0')
}

/** `14 NOV 13:42:10 UTC` — the replayed moment. */
export function formatReplayMoment(epochMs: number): string {
  const moment = new Date(epochMs)
  return (
    `${twoDigits(moment.getUTCDate())} ${MONTHS[moment.getUTCMonth()]} ` +
    `${twoDigits(moment.getUTCHours())}:${twoDigits(moment.getUTCMinutes())}:` +
    `${twoDigits(moment.getUTCSeconds())} UTC`
  )
}

/** `14 November 2026, 13:42:10 UTC` — the screen-reader wording of the same moment. */
export function describeReplayMoment(epochMs: number): string {
  const moment = new Date(epochMs)
  const month = moment.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
  return (
    `${moment.getUTCDate()} ${month} ${moment.getUTCFullYear()}, ` +
    `${twoDigits(moment.getUTCHours())}:${twoDigits(moment.getUTCMinutes())}:` +
    `${twoDigits(moment.getUTCSeconds())} UTC`
  )
}

/** The `datetime-local` value (`YYYY-MM-DDTHH:MM`) for a moment, in UTC. */
export function toUtcInputValue(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 16)
}

/** A `datetime-local` value read as UTC, or null when blank or unreadable. */
export function fromUtcInputValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const epochMs = Date.parse(`${value}:00Z`)
  return Number.isNaN(epochMs) ? null : epochMs
}
