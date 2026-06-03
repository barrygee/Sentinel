// Persistence for per-satellite pass notifications ("ping me ~10 min before
// this satellite next passes overhead").
//
// Previously each enabled satellite was stored as its own localStorage key
// `passNotifEnabled_{norad}` = '1', with NO name (the name only ever existed in
// memory on the active SatelliteControl). To fire pass alerts for ALL enabled
// satellites from any section, the app-level service needs the name too — so we
// store a single JSON map `space_pass_notifs` = { [norad]: { name } } and
// migrate the old per-key flags on first load (name falls back to the norad id
// until the satellite is next selected, which refreshes it).

const LS_KEY = 'space_pass_notifs'
const OLD_PREFIX = 'passNotifEnabled_'

export interface PassNotifEntry { name: string }
export type PassNotifMap = Record<string, PassNotifEntry>

function _read(): PassNotifMap {
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw) {
            const obj = JSON.parse(raw) as unknown
            if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj as PassNotifMap
        }
    } catch {}
    return {}
}

function _write(map: PassNotifMap): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)) } catch {}
}

let _migrated = false
function _migrate(): void {
    if (_migrated) return
    _migrated = true
    try {
        const existing = _read()
        let changed = false
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key || !key.startsWith(OLD_PREFIX)) continue
            if (localStorage.getItem(key) !== '1') continue
            const norad = key.slice(OLD_PREFIX.length)
            if (!existing[norad]) {
                existing[norad] = { name: norad === '25544' ? 'ISS' : norad }
                changed = true
            }
        }
        if (changed) _write(existing)
        // Remove the old keys once folded into the JSON map.
        const toRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith(OLD_PREFIX)) toRemove.push(key)
        }
        toRemove.forEach(k => { try { localStorage.removeItem(k) } catch {} })
    } catch {}
}

export function getAllPassNotifs(): PassNotifMap {
    _migrate()
    return _read()
}

export function isPassNotifEnabled(noradId: string): boolean {
    _migrate()
    return noradId in _read()
}

export function setPassNotifEnabled(noradId: string, enabled: boolean, name?: string): void {
    _migrate()
    const map = _read()
    if (enabled) {
        map[noradId] = { name: name || map[noradId]?.name || (noradId === '25544' ? 'ISS' : noradId) }
    } else {
        delete map[noradId]
    }
    _write(map)
}

// Refresh the cached display name for a satellite (e.g. when it's selected),
// without changing its enabled state.
export function updatePassNotifName(noradId: string, name: string): void {
    if (!name) return
    _migrate()
    const map = _read()
    if (map[noradId] && map[noradId].name !== name) {
        map[noradId] = { name }
        _write(map)
    }
}
