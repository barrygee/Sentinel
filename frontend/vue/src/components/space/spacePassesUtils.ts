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

export interface AccPass {
    aos_utc:           string
    los_utc:           string
    aos_unix_ms:       number
    los_unix_ms:       number
    duration_s:        number
    max_elevation_deg: number
    max_el_utc:        string
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
