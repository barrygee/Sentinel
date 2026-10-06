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

// An entry can now carry two independent per-satellite toggles:
//  - bell      → "ping me ~5 min before this satellite next passes overhead"
//  - autoTune  → "tune the SDR to this satellite's downlink the moment a pass
//                 begins (AOS)" — see SatellitePassScheduler.
// Back-compat: entries written before auto-tune existed have NO `bell` key and
// mean "bell on" (their mere presence used to BE the bell flag). So `bell` is
// read as `!== false` and only ever written explicitly. `downlinkHz`/
// `downlinkMode` are cached at enable time so the app-level service can tune
// without re-fetching the satellite's radio data at AOS.
export interface PassNotifEntry {
  name: string
  bell?: boolean
  autoTune?: boolean
  // Record the pass to a recording when auto-tune fires at AOS. Only meaningful while
  // `autoTune` is also on — recording needs a live tune to capture. Setting it
  // forces `autoTune: true`; clearing `autoTune` also clears this.
  record?: boolean
  downlinkHz?: number
  downlinkMode?: string
}
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
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map))
  } catch {}
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
        // Genuine legacy bell entry — stamp bell:true explicitly so it no
        // longer relies on the fragile "no bell key = on" inference.
        existing[norad] = { name: norad === '25544' ? 'ISS (ZARYA)' : norad, bell: true }
        changed = true
      }
    }
    // Heal entries corrupted by the old updatePassNotifName, which replaced
    // the whole entry with { name } on satellite-select — dropping the bell
    // key so an auto-tune-only sat silently read as bell-on (phantom pass
    // notifications). A bare { name } entry (no bell/autoTune/downlink keys)
    // is treated as OFF, not on: any entry the user truly enabled is
    // re-stamped explicitly the next time they toggle it.
    for (const [norad, entry] of Object.entries(existing)) {
      if (entry.bell === undefined) {
        existing[norad] = { ...entry, bell: false }
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
    toRemove.forEach((k) => {
      try {
        localStorage.removeItem(k)
      } catch {}
    })
  } catch {}
}

export function getAllPassNotifs(): PassNotifMap {
  _migrate()
  return _read()
}

function _defaultName(noradId: string): string {
  return noradId === '25544' ? 'ISS (ZARYA)' : noradId
}

// Drop an entry once BOTH toggles are off, so a satellite the user has fully
// disabled doesn't linger in the map.
function _pruneIfEmpty(map: PassNotifMap, noradId: string): void {
  const e = map[noradId]
  if (e && e.bell === false && !e.autoTune && !e.record) delete map[noradId]
}

export function isPassNotifEnabled(noradId: string): boolean {
  _migrate()
  const e = _read()[noradId]
  // After _migrate() every entry has an explicit `bell` flag. The `!== false`
  // form is kept as a belt-and-braces default for any entry written before
  // migration ran in this tick.
  return !!e && e.bell !== false
}

export function setPassNotifEnabled(noradId: string, enabled: boolean, name?: string): void {
  _migrate()
  const map = _read()
  const existing = map[noradId]
  if (enabled) {
    map[noradId] = {
      ...existing,
      name: name || existing?.name || _defaultName(noradId),
      bell: true,
    }
  } else if (existing) {
    existing.bell = false
    _pruneIfEmpty(map, noradId)
  }
  _write(map)
}

export function isAutoTuneEnabled(noradId: string): boolean {
  _migrate()
  return !!_read()[noradId]?.autoTune
}

export function setAutoTuneEnabled(
  noradId: string,
  enabled: boolean,
  opts?: { name?: string; downlinkHz?: number; downlinkMode?: string },
): void {
  _migrate()
  const map = _read()
  const existing = map[noradId]
  if (enabled) {
    map[noradId] = {
      ...existing,
      name: opts?.name || existing?.name || _defaultName(noradId),
      // Preserve the existing bell flag; an entry created solely for
      // auto-tune is bell-off so it doesn't silently enable pass alerts.
      bell: existing ? existing.bell !== false : false,
      autoTune: true,
      downlinkHz: opts?.downlinkHz ?? existing?.downlinkHz,
      downlinkMode: opts?.downlinkMode ?? existing?.downlinkMode,
    }
  } else if (existing) {
    existing.autoTune = false
    // Record can't run without a tune — disabling auto-tune disarms record too.
    existing.record = false
    _pruneIfEmpty(map, noradId)
  }
  _write(map)
}

export function isRecordOnPassEnabled(noradId: string): boolean {
  _migrate()
  return !!_read()[noradId]?.record
}

export function setRecordOnPassEnabled(
  noradId: string,
  enabled: boolean,
  opts?: { name?: string; downlinkHz?: number; downlinkMode?: string },
): void {
  _migrate()
  const map = _read()
  const existing = map[noradId]
  if (enabled) {
    map[noradId] = {
      ...existing,
      name: opts?.name || existing?.name || _defaultName(noradId),
      // Preserve bell; recording implies auto-tune, so force it on.
      bell: existing ? existing.bell !== false : false,
      autoTune: true,
      record: true,
      downlinkHz: opts?.downlinkHz ?? existing?.downlinkHz,
      downlinkMode: opts?.downlinkMode ?? existing?.downlinkMode,
    }
  } else if (existing) {
    existing.record = false
    _pruneIfEmpty(map, noradId)
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
    // Preserve bell/autoTune/downlink — only refresh the display name.
    // (Previously this replaced the whole entry with { name }, which dropped
    // the `bell` key and so silently re-enabled pass alerts via the legacy
    // "no bell key = bell on" rule — the phantom-notification bug.)
    map[noradId] = { ...map[noradId], name }
    _write(map)
  }
}
