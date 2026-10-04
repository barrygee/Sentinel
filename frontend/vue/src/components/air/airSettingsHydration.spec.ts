import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAirStore } from '@/stores/air'
import { hydrateAirFromSettings } from './airSettingsHydration'

// Air's boot hydration (moved out of main.ts): its map layers and the aircraft
// label fields, adopted from the boot settings payload before the first render.
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  setActivePinia(createPinia())
  fetchSpy = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('hydrateAirFromSettings', () => {
  it('adopts the stored map layers', () => {
    const airStore = useAirStore()
    const hydrateMapLayers = vi.spyOn(airStore, 'hydrateMapLayers')

    hydrateAirFromSettings({ air: { mapLayers: { names: true } } })

    expect(hydrateMapLayers).toHaveBeenCalledWith({ names: true })
  })

  it('adopts stored label fields over the defaults, per kind', () => {
    const airStore = useAirStore()

    hydrateAirFromSettings({
      air: { labelDataPoints: { civil: { altitude: true }, mil: { callsign: false } } },
    })

    expect(airStore.adsbTagFields.civil).toMatchObject({ callsign: true, altitude: true })
    expect(airStore.adsbTagFields.mil).toMatchObject({ callsign: false, aircraftType: true })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([
    ['missing', {}],
    ['not an object', { labelDataPoints: 'all' }],
    ['an array', { labelDataPoints: [] }],
    ['missing a kind', { labelDataPoints: { civil: {} } }],
  ])('seeds the defaults into the settings when the stored fields are %s', (_label, air) => {
    hydrateAirFromSettings({ air })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe('/api/settings/air/labelDataPoints')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body)
    expect(body.value.civil.callsign).toBe(true)
    expect(body.value.mil.aircraftType).toBe(true)
  })

  it('swallows a failed seed write', async () => {
    fetchSpy.mockRejectedValue(new Error('offline'))
    expect(() => hydrateAirFromSettings({})).not.toThrow()
    await Promise.resolve()
  })
})
