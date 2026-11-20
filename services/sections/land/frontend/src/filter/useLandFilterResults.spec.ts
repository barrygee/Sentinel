import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useLandFilterResults } from './useLandFilterResults'
import { useLandStore, type AprsStation } from '../stores/land'
import { useRepeatersStore } from '../stores/repeaters'
import type { RepeaterChannel, RepeaterStation } from '../types/repeaters'

function station(overrides: Partial<AprsStation> = {}): AprsStation {
  return {
    callsign: 'M0ABC-9',
    latitude: 51.5,
    longitude: -0.1,
    symbol: '/>',
    comment: 'Rolling north',
    course: 90,
    speed: 30,
    altitude: 120,
    path: 'WIDE1-1',
    raw: null,
    last_heard_ms: new Date(2026, 10, 20, 9, 5, 7).getTime(),
    ...overrides,
  }
}

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.65,
    rxMhz: 145.05,
    modes: ['A'],
    ctcssHz: 118.8,
    dmrColourCode: null,
    heightMagl: 30,
    erpDbw: 10,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function repeater(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NM',
    latitude: 54.9,
    longitude: -1.6,
    locator: 'IO94FX',
    location: 'NEWCASTLE',
    postcode: 'NE1',
    region: 'NE',
    keeper: 'G0ABC',
    channels: [channel()],
    ...overrides,
  }
}

describe('useLandFilterResults', () => {
  let landStore: ReturnType<typeof useLandStore>
  let repeatersStore: ReturnType<typeof useRepeatersStore>

  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    // Filter changes persist through the settings API; keep them off the network.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    landStore = useLandStore()
    repeatersStore = useRepeatersStore()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('repeatersOn', () => {
    it('is on only while the layer is on and the directory has loaded', () => {
      const results = useLandFilterResults()
      expect(results.repeatersOn.value).toBe(false)
      landStore.setRepeatersLayerVisible(true)
      expect(results.repeatersOn.value).toBe(false)
      repeatersStore.stations = [repeater()]
      expect(results.repeatersOn.value).toBe(true)
      landStore.setRepeatersLayerVisible(false)
      expect(results.repeatersOn.value).toBe(false)
    })
  })

  describe('search box wording', () => {
    it('describes the pane generically when no layer is on', () => {
      const results = useLandFilterResults()
      expect(results.listboxLabel.value).toBe('Land map items')
      expect(results.inputLabel.value).toBe('Filter Land map items by name or callsign')
      expect(results.placeholder.value).toBe('CALLSIGN · SYMBOL · PATH · COMMENT')
    })

    it('names the APRS fields when only stations are listed', () => {
      landStore.setAprsLayerVisible(true)
      const results = useLandFilterResults()
      expect(results.listboxLabel.value).toBe('APRS stations')
      expect(results.inputLabel.value).toBe(
        'Filter APRS stations by callsign, symbol, path or comment',
      )
      expect(results.placeholder.value).toBe('CALLSIGN · SYMBOL · PATH · COMMENT')
    })

    it('names the repeater fields when only repeaters are listed', () => {
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater()]
      const results = useLandFilterResults()
      expect(results.listboxLabel.value).toBe('repeaters')
      expect(results.inputLabel.value).toBe('Filter repeaters by name or callsign')
      expect(results.placeholder.value).toBe('CALLSIGN · TOWN · BAND · MODE')
    })

    it('names both sets when both are listed', () => {
      landStore.setAprsLayerVisible(true)
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater()]
      const results = useLandFilterResults()
      expect(results.listboxLabel.value).toBe('APRS stations and repeaters')
      expect(results.inputLabel.value).toBe(
        'Filter APRS stations and repeaters by name or callsign',
      )
      expect(results.placeholder.value).toBe('CALLSIGN · TOWN · BAND · MODE')
    })
  })

  describe('items', () => {
    it('lists no stations while the APRS layer is off, whatever has been heard', () => {
      landStore.aprsStations = [station()]
      expect(useLandFilterResults().items.value).toEqual([])
    })

    it('lists every heard station, ungrouped, when they are the only set', () => {
      landStore.setAprsLayerVisible(true)
      landStore.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const items = useLandFilterResults().items.value
      expect(items.map((item) => item.key)).toEqual(['M0ABC-9', 'MB7UMS'])
      expect(items.every((item) => item.groupLabel === undefined)).toBe(true)
    })

    it('narrows stations by the trimmed, case-folded search text', () => {
      landStore.setAprsLayerVisible(true)
      landStore.aprsStations = [station(), station({ callsign: 'MB7UMS', comment: null })]
      landStore.setSearchQuery('  ROLLING  ')
      expect(useLandFilterResults().items.value.map((item) => item.key)).toEqual(['M0ABC-9'])
    })

    it('lists every in-view repeater after the stations, with the stations under a heading', () => {
      landStore.setAprsLayerVisible(true)
      landStore.setRepeatersLayerVisible(true)
      landStore.aprsStations = [station()]
      repeatersStore.stations = [repeater(), repeater({ callsign: 'GB3DU' })]
      const items = useLandFilterResults().items.value
      expect(items.map((item) => item.key)).toEqual(['M0ABC-9', 'rpt:GB3NM', 'rpt:GB3DU'])
      expect(items[0]!.groupLabel).toBe('APRS STATIONS')
      expect(items[1]!.groupLabel).toBeUndefined()
    })

    it('narrows repeaters by the search text', () => {
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater(), repeater({ callsign: 'GB3DU', location: 'DURHAM' })]
      landStore.setSearchQuery(' Durham ')
      expect(useLandFilterResults().items.value.map((item) => item.key)).toEqual(['rpt:GB3DU'])
    })

    it('lists only the repeaters inside the map viewport', () => {
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [
        repeater(),
        repeater({ callsign: 'GB3SO', latitude: 50.9, longitude: -1.4 }),
      ]
      repeatersStore.setViewportBounds({ west: -2, east: -1, south: 54, north: 55 })
      expect(useLandFilterResults().items.value.map((item) => item.key)).toEqual(['rpt:GB3NM'])
    })

    it('lists no repeaters while the layer is off', () => {
      repeatersStore.stations = [repeater()]
      expect(useLandFilterResults().items.value).toEqual([])
    })

    it('follows the stores as they change', async () => {
      landStore.setAprsLayerVisible(true)
      const results = useLandFilterResults()
      expect(results.items.value).toEqual([])
      landStore.aprsStations = [station()]
      await nextTick()
      expect(results.items.value.map((item) => item.key)).toEqual(['M0ABC-9'])
    })
  })

  describe('emptyMessage', () => {
    it('points to the tabs when no layer is on', () => {
      expect(useLandFilterResults().emptyMessage.value).toBe(
        'No layers on — use the tabs to add one',
      )
    })

    it('says nothing is in view when only repeaters are on and none are in the viewport', () => {
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater()]
      repeatersStore.setViewportBounds({ west: 10, east: 11, south: 10, north: 11 })
      expect(useLandFilterResults().emptyMessage.value).toBe('Nothing in view — repeaters')
    })

    it('says nothing matches when repeaters are in view but the search hides them', () => {
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater()]
      landStore.setSearchQuery('zzzz')
      expect(useLandFilterResults().emptyMessage.value).toBe('Nothing matches')
    })

    it('says nothing matches when stations are listed too, even with no repeater in view', () => {
      landStore.setAprsLayerVisible(true)
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater()]
      repeatersStore.setViewportBounds({ west: 10, east: 11, south: 10, north: 11 })
      expect(useLandFilterResults().emptyMessage.value).toBe('Nothing matches')
    })

    it('says nothing has been heard when the APRS list is empty', () => {
      landStore.setAprsLayerVisible(true)
      expect(useLandFilterResults().emptyMessage.value).toBe('No APRS stations heard')
    })

    it('says no station matches when stations are heard but the search hides them', () => {
      landStore.setAprsLayerVisible(true)
      landStore.aprsStations = [station()]
      landStore.setSearchQuery('zzzz')
      expect(useLandFilterResults().emptyMessage.value).toBe('No stations match')
    })
  })

  describe('row lookups', () => {
    it('finds the repeater a repeater row key names', () => {
      repeatersStore.stations = [repeater(), repeater({ callsign: 'GB3DU' })]
      const { repeaterFor } = useLandFilterResults()
      expect(repeaterFor('rpt:GB3DU')?.callsign).toBe('GB3DU')
      expect(repeaterFor('rpt:GB3XX')).toBeUndefined()
    })

    it('never treats an APRS row key as a repeater, even when the callsigns match', () => {
      repeatersStore.stations = [repeater()]
      expect(useLandFilterResults().repeaterFor('GB3NM')).toBeUndefined()
    })

    it('finds a heard station by callsign', () => {
      landStore.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const { stationFor } = useLandFilterResults()
      expect(stationFor('MB7UMS')?.callsign).toBe('MB7UMS')
      expect(stationFor('G4XYZ')).toBeUndefined()
    })
  })
})
