// Shared parsing for the /api/air/adsb/point/{lat}/{lon}/{radius} response.
//
// Both AdsbLiveControl (rendering) and the app-level background alerts service
// (useAirAlertsService) consume this endpoint. Keeping the altitude parsing and
// military classification here ensures both interpret the raw feed identically —
// previously this logic was inline in AdsbLiveControl only.

export interface AdsbApiEntry {
    hex?: string; flight?: string; r?: string; t?: string;
    lat?: number; lon?: number; alt_baro?: number | string;
    alt_geom?: number; gs?: number; ias?: number; mach?: number;
    track?: number; baro_rate?: number;
    nav_altitude_mcp?: number; nav_altitude_fms?: number; nav_heading?: number;
    category?: string; emergency?: string; squawk?: string; rssi?: number;
    military?: boolean;
}

// Normalised aircraft used by detection logic (landing/departure + overhead).
export interface ParsedAircraft {
    hex: string
    lat: number
    lon: number
    alt: number
    gs: number
    flight: string
    r: string
    military: boolean
}

export function parseAlt(alt_baro: number | string | null | undefined): number {
    if (alt_baro === 'ground' || alt_baro === '' || alt_baro == null) return 0
    const alt = typeof alt_baro === 'number' ? alt_baro : parseFloat(alt_baro as string) || 0
    return alt < 0 ? 0 : alt
}

// Military classification: an explicit flag, or the hex falling in a known
// military ICAO allocation block. Ground/airfield (LAAD) entries are excluded.
export function isMilitary(hex: string, military: boolean | undefined, t: string | undefined): boolean {
    if (t === 'LAAD') return false
    if (military === true) return true
    const hexInt = parseInt(hex, 16)
    return (hexInt >= 0x43C000 && hexInt <= 0x43FFFF)
        || (hexInt >= 0xAE0000 && hexInt <= 0xAFFFFF)
}

// Map the raw API `ac` array to normalised aircraft, applying the same filters
// AdsbLiveControl uses (must have lat/lon; drop category A0/B0/C0 ground noise).
export function parseAircraftList(ac: AdsbApiEntry[]): ParsedAircraft[] {
    const out: ParsedAircraft[] = []
    for (const a of ac) {
        if (a.lat == null || a.lon == null) continue
        if (['A0', 'B0', 'C0'].includes((a.category || '').toUpperCase())) continue
        const hex = a.hex || ''
        if (!hex) continue
        out.push({
            hex,
            lat: a.lat,
            lon: a.lon,
            alt: parseAlt(a.alt_baro ?? null),
            gs: a.gs ?? 0,
            flight: (a.flight || '').trim(),
            r: a.r || '',
            military: isMilitary(hex, a.military, a.t),
        })
    }
    return out
}
