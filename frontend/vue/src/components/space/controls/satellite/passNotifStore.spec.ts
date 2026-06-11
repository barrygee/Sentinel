import { describe, it, expect, vi } from 'vitest'

const LS_KEY = 'space_pass_notifs'

// The module memoises a one-shot `_migrated` flag at load time, so each test
// imports a fresh copy after seeding localStorage. The global beforeEach in
// src/test/setup.ts clears localStorage before this body runs.
async function loadStore() {
  vi.resetModules()
  return import('./passNotifStore')
}

function seed(map: Record<string, unknown>): void {
  localStorage.setItem(LS_KEY, JSON.stringify(map))
}

function readRaw(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
}

describe('getAllPassNotifs / _read', () => {
  it('returns the stored map when it is a valid object', async () => {
    seed({ '111': { name: 'Sat', bell: true } })
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({ '111': { name: 'Sat', bell: true } })
  })

  it('returns an empty map when nothing is stored', async () => {
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({})
  })

  it('returns an empty map when the stored value is not valid JSON', async () => {
    localStorage.setItem(LS_KEY, '{not json')
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({})
  })

  it('ignores a stored JSON array (not an object map)', async () => {
    localStorage.setItem(LS_KEY, '[1,2,3]')
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({})
  })

  it('ignores a stored JSON primitive (not an object)', async () => {
    localStorage.setItem(LS_KEY, '42')
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({})
  })

  it('ignores a stored JSON null', async () => {
    localStorage.setItem(LS_KEY, 'null')
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({})
  })
})

describe('_migrate (legacy per-key flags)', () => {
  it('folds an old passNotifEnabled_ flag into the JSON map with bell:true', async () => {
    localStorage.setItem('passNotifEnabled_40000', '1')
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({ '40000': { name: '40000', bell: true } })
    // The legacy key is removed once folded in.
    expect(localStorage.getItem('passNotifEnabled_40000')).toBeNull()
  })

  it('uses the ISS display name for the well-known 25544 id', async () => {
    localStorage.setItem('passNotifEnabled_25544', '1')
    const store = await loadStore()
    expect(store.getAllPassNotifs()['25544']).toEqual({ name: 'ISS (ZARYA)', bell: true })
  })

  it('ignores a legacy key whose value is not "1"', async () => {
    localStorage.setItem('passNotifEnabled_50000', '0')
    const store = await loadStore()
    expect(store.getAllPassNotifs()['50000']).toBeUndefined()
    // A non-"1" legacy key is still cleaned up.
    expect(localStorage.getItem('passNotifEnabled_50000')).toBeNull()
  })

  it('ignores unrelated localStorage keys', async () => {
    localStorage.setItem('some_other_key', 'value')
    localStorage.setItem('passNotifEnabled_60000', '1')
    const store = await loadStore()
    expect(store.getAllPassNotifs()).toEqual({ '60000': { name: '60000', bell: true } })
    expect(localStorage.getItem('some_other_key')).toBe('value')
  })

  it('does not overwrite an existing JSON-map entry from a legacy key', async () => {
    seed({ '70000': { name: 'Keep Me', bell: true, autoTune: true } })
    localStorage.setItem('passNotifEnabled_70000', '1')
    const store = await loadStore()
    expect(store.getAllPassNotifs()['70000']).toEqual({
      name: 'Keep Me',
      bell: true,
      autoTune: true,
    })
  })

  it('heals a bare { name } entry to bell:false (treated as off)', async () => {
    seed({ '80000': { name: 'Bare' } })
    const store = await loadStore()
    expect(store.getAllPassNotifs()['80000']).toEqual({ name: 'Bare', bell: false })
    expect(store.isPassNotifEnabled('80000')).toBe(false)
  })

  it('leaves an already-healed map untouched (no rewrite needed)', async () => {
    seed({ '90000': { name: 'Done', bell: true } })
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    const store = await loadStore()
    store.getAllPassNotifs()
    // No legacy keys and every entry has an explicit bell → nothing rewritten.
    expect(setSpy).not.toHaveBeenCalled()
    setSpy.mockRestore()
  })

  it('only migrates once even across many calls', async () => {
    localStorage.setItem('passNotifEnabled_11111', '1')
    const store = await loadStore()
    store.getAllPassNotifs()
    // Re-add a legacy key; a second call must not re-run migration.
    localStorage.setItem('passNotifEnabled_22222', '1')
    expect(store.getAllPassNotifs()['22222']).toBeUndefined()
  })
})

describe('isPassNotifEnabled', () => {
  it('is false when there is no entry', async () => {
    const store = await loadStore()
    expect(store.isPassNotifEnabled('123')).toBe(false)
  })

  it('is true when the entry has bell on', async () => {
    seed({ '123': { name: 'Sat', bell: true } })
    const store = await loadStore()
    expect(store.isPassNotifEnabled('123')).toBe(true)
  })

  it('is false when the entry has bell explicitly off', async () => {
    seed({ '123': { name: 'Sat', bell: false, autoTune: true } })
    const store = await loadStore()
    expect(store.isPassNotifEnabled('123')).toBe(false)
  })
})

describe('setPassNotifEnabled', () => {
  it('enables with the supplied name', async () => {
    const store = await loadStore()
    store.setPassNotifEnabled('123', true, 'My Sat')
    expect(readRaw()['123']).toEqual({ name: 'My Sat', bell: true })
  })

  it('keeps the existing name when none is supplied', async () => {
    seed({ '123': { name: 'Existing', bell: false } })
    const store = await loadStore()
    store.setPassNotifEnabled('123', true)
    expect(readRaw()['123']).toMatchObject({ name: 'Existing', bell: true })
  })

  it('falls back to the default name for an unknown new satellite', async () => {
    const store = await loadStore()
    store.setPassNotifEnabled('44444', true)
    expect(readRaw()['44444']).toEqual({ name: '44444', bell: true })
  })

  it('falls back to the ISS name for 25544', async () => {
    const store = await loadStore()
    store.setPassNotifEnabled('25544', true)
    expect(readRaw()['25544']).toEqual({ name: 'ISS (ZARYA)', bell: true })
  })

  it('disabling clears bell and prunes an otherwise-empty entry', async () => {
    seed({ '123': { name: 'Sat', bell: true } })
    const store = await loadStore()
    store.setPassNotifEnabled('123', false)
    expect(readRaw()['123']).toBeUndefined()
  })

  it('disabling keeps an entry that still has auto-tune on', async () => {
    seed({ '123': { name: 'Sat', bell: true, autoTune: true } })
    const store = await loadStore()
    store.setPassNotifEnabled('123', false)
    expect(readRaw()['123']).toMatchObject({ bell: false, autoTune: true })
  })

  it('disabling a satellite with no entry is a no-op', async () => {
    const store = await loadStore()
    store.setPassNotifEnabled('123', false)
    expect(readRaw()['123']).toBeUndefined()
  })
})

describe('auto-tune toggles', () => {
  it('isAutoTuneEnabled is false without an entry and true when set', async () => {
    seed({ '123': { name: 'Sat', bell: false, autoTune: true } })
    const store = await loadStore()
    expect(store.isAutoTuneEnabled('123')).toBe(true)
    expect(store.isAutoTuneEnabled('999')).toBe(false)
  })

  it('enabling for a brand-new satellite leaves the bell off', async () => {
    const store = await loadStore()
    store.setAutoTuneEnabled('123', true, { name: 'Sat', downlinkHz: 145e6, downlinkMode: 'FM' })
    expect(readRaw()['123']).toEqual({
      name: 'Sat',
      bell: false,
      autoTune: true,
      downlinkHz: 145e6,
      downlinkMode: 'FM',
    })
  })

  it('enabling preserves an existing bell flag and caches downlink fallbacks', async () => {
    seed({ '123': { name: 'Sat', bell: true, downlinkHz: 100, downlinkMode: 'USB' } })
    const store = await loadStore()
    store.setAutoTuneEnabled('123', true)
    expect(readRaw()['123']).toEqual({
      name: 'Sat',
      bell: true,
      autoTune: true,
      downlinkHz: 100,
      downlinkMode: 'USB',
    })
  })

  it('enabling falls back to the default name when none is known', async () => {
    const store = await loadStore()
    store.setAutoTuneEnabled('77777', true)
    expect(readRaw()['77777']).toMatchObject({ name: '77777', autoTune: true })
  })

  it('disabling clears auto-tune and record, and prunes an empty entry', async () => {
    seed({ '123': { name: 'Sat', bell: false, autoTune: true, record: true } })
    const store = await loadStore()
    store.setAutoTuneEnabled('123', false)
    expect(readRaw()['123']).toBeUndefined()
  })

  it('disabling keeps an entry whose bell is still on', async () => {
    seed({ '123': { name: 'Sat', bell: true, autoTune: true } })
    const store = await loadStore()
    store.setAutoTuneEnabled('123', false)
    expect(readRaw()['123']).toMatchObject({ bell: true, autoTune: false, record: false })
  })

  it('disabling a satellite with no entry is a no-op', async () => {
    const store = await loadStore()
    store.setAutoTuneEnabled('123', false)
    expect(readRaw()['123']).toBeUndefined()
  })
})

describe('record-on-pass toggles', () => {
  it('isRecordOnPassEnabled reflects the stored flag', async () => {
    seed({ '123': { name: 'Sat', bell: false, autoTune: true, record: true } })
    const store = await loadStore()
    expect(store.isRecordOnPassEnabled('123')).toBe(true)
    expect(store.isRecordOnPassEnabled('999')).toBe(false)
  })

  it('enabling forces auto-tune on and caches the downlink', async () => {
    const store = await loadStore()
    store.setRecordOnPassEnabled('123', true, {
      name: 'Sat',
      downlinkHz: 437e6,
      downlinkMode: 'FM',
    })
    expect(readRaw()['123']).toEqual({
      name: 'Sat',
      bell: false,
      autoTune: true,
      record: true,
      downlinkHz: 437e6,
      downlinkMode: 'FM',
    })
  })

  it('enabling preserves an existing bell and downlink fallbacks', async () => {
    seed({ '123': { name: 'Sat', bell: true, downlinkHz: 1, downlinkMode: 'CW' } })
    const store = await loadStore()
    store.setRecordOnPassEnabled('123', true)
    expect(readRaw()['123']).toMatchObject({
      bell: true,
      autoTune: true,
      record: true,
      downlinkHz: 1,
      downlinkMode: 'CW',
    })
  })

  it('enabling falls back to the default name', async () => {
    const store = await loadStore()
    store.setRecordOnPassEnabled('88888', true)
    expect(readRaw()['88888']).toMatchObject({ name: '88888', record: true })
  })

  it('disabling clears record and prunes an otherwise-empty entry', async () => {
    seed({ '123': { name: 'Sat', bell: false, record: true } })
    const store = await loadStore()
    store.setRecordOnPassEnabled('123', false)
    expect(readRaw()['123']).toBeUndefined()
  })

  it('disabling keeps an entry with auto-tune still on', async () => {
    seed({ '123': { name: 'Sat', bell: false, autoTune: true, record: true } })
    const store = await loadStore()
    store.setRecordOnPassEnabled('123', false)
    expect(readRaw()['123']).toMatchObject({ autoTune: true, record: false })
  })

  it('disabling a satellite with no entry is a no-op', async () => {
    const store = await loadStore()
    store.setRecordOnPassEnabled('123', false)
    expect(readRaw()['123']).toBeUndefined()
  })
})

describe('updatePassNotifName', () => {
  it('ignores an empty name', async () => {
    seed({ '123': { name: 'Old', bell: true } })
    const store = await loadStore()
    store.updatePassNotifName('123', '')
    expect(readRaw()['123']).toMatchObject({ name: 'Old' })
  })

  it('refreshes the display name without touching other flags', async () => {
    seed({ '123': { name: 'Old', bell: true, autoTune: true } })
    const store = await loadStore()
    store.updatePassNotifName('123', 'New Name')
    expect(readRaw()['123']).toEqual({ name: 'New Name', bell: true, autoTune: true })
  })

  it('does not rewrite when the name is unchanged', async () => {
    seed({ '123': { name: 'Same', bell: true } })
    const store = await loadStore()
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    store.updatePassNotifName('123', 'Same')
    expect(setSpy).not.toHaveBeenCalled()
    setSpy.mockRestore()
  })

  it('does nothing when the satellite has no entry', async () => {
    const store = await loadStore()
    const setSpy = vi.spyOn(Storage.prototype, 'setItem')
    store.updatePassNotifName('123', 'New')
    expect(setSpy).not.toHaveBeenCalled()
    expect(readRaw()['123']).toBeUndefined()
    setSpy.mockRestore()
  })
})

describe('_write resilience', () => {
  it('swallows a localStorage write failure', async () => {
    const store = await loadStore()
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => store.setPassNotifEnabled('123', true, 'Sat')).not.toThrow()
    setSpy.mockRestore()
  })
})
