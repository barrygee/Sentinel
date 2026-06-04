// Pure helpers used by SpacePasses.vue. No Vue / no DOM.
import {
    SATELLITE_CATEGORY_SHORT_LABELS,
    formatPassCountdown,
} from '../../utils/satelliteUtils'

export interface SatPass {
    norad_id:          string
    name:              string
    category:          string | null
    aos_utc:           string
    los_utc:           string
    aos_unix_ms:       number
    los_unix_ms:       number
    duration_s:        number
    max_elevation_deg: number
    max_el_utc:        string
    uplink_hz?:        number | null
    uplink_mode?:      string | null
    downlink_hz?:      number | null
    downlink_mode?:    string | null
    ctcss_hz?:         number | null
    transponder_type?: string | null
    beacon_hz?:        number | null
    packet_info?:      string | null
    radio_status?:     string | null
    radio_notes?:      string | null
}

export interface SkyPoint {
    az: number
    el: number
}

export interface AccPass {
    aos_utc:           string
    los_utc:           string
    aos_unix_ms:       number
    los_unix_ms:       number
    duration_s:        number
    max_elevation_deg: number
    max_el_utc:        string
    sky_track?:        SkyPoint[]
}

export function passKey(p: SatPass): string {
    return `${p.norad_id}_${p.aos_unix_ms}`
}

export function passSecondary(pass: SatPass): string {
    const cat = pass.category ? (SATELLITE_CATEGORY_SHORT_LABELS[pass.category] || pass.category.toUpperCase()) : ''
    return cat ? `${cat} · NORAD ${pass.norad_id}` : `NORAD ${pass.norad_id}`
}

export function isInProgress(pass: SatPass, nowMs: number = Date.now()): boolean {
    return nowMs >= pass.aos_unix_ms && nowMs <= pass.los_unix_ms
}

export function aosText(pass: SatPass, nowMs: number = Date.now()): string {
    if (isInProgress(pass, nowMs)) return 'IN PROGRESS'
    const ms = pass.aos_unix_ms - nowMs
    return ms < 3_600_000
        ? formatPassCountdown(ms)
        : new Date(pass.aos_unix_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function accPassIsNow(ap: AccPass, nowMs: number): boolean {
    return nowMs >= ap.aos_unix_ms && nowMs <= ap.los_unix_ms
}

export interface AutoTuneConflict {
    noradId: string
    name:    string
    aosMs:   number
    losMs:   number
}

// Auto-tune is lock-in: when two armed sats are overhead at once, the radio (one
// tuner) holds whichever pass it acquired first and skips the later one. This
// flags, for a candidate sat the user is arming, which *other already-armed*
// sats have an upcoming pass that time-overlaps the candidate's — so the UI can
// warn that one of the two passes won't be tuned. Pure: pass in the full pass
// list (all sats) and an `isArmed` predicate. Returns one entry per conflicting
// sat (the earliest overlapping window), sorted by AOS.
export function findAutoTuneConflicts(
    candidateNoradId: string,
    passes: SatPass[],
    isArmed: (noradId: string) => boolean,
    nowMs: number = Date.now(),
): AutoTuneConflict[] {
    const mine = passes.filter(p => p.norad_id === candidateNoradId && p.los_unix_ms > nowMs)
    if (mine.length === 0) return []
    const byNorad = new Map<string, AutoTuneConflict>()
    for (const other of passes) {
        if (other.norad_id === candidateNoradId) continue
        if (other.los_unix_ms <= nowMs) continue
        if (!isArmed(other.norad_id)) continue
        // Standard interval overlap against any of the candidate's passes.
        const overlaps = mine.some(m =>
            m.aos_unix_ms < other.los_unix_ms && other.aos_unix_ms < m.los_unix_ms)
        if (!overlaps) continue
        const existing = byNorad.get(other.norad_id)
        if (!existing || other.aos_unix_ms < existing.aosMs) {
            byNorad.set(other.norad_id, {
                noradId: other.norad_id,
                name: other.name || other.norad_id,
                aosMs: other.aos_unix_ms,
                losMs: other.los_unix_ms,
            })
        }
    }
    return [...byNorad.values()].sort((a, b) => a.aosMs - b.aosMs)
}
