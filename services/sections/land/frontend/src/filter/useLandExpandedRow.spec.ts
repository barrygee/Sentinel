import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useLandExpandedRow } from './useLandExpandedRow'
import { useLandStore, type AprsStation } from '../stores/land'
import { useRepeatersStore } from '../stores/repeaters'
import type { RepeaterChannel, RepeaterStation } from '../types/repeaters'

enableAutoUnmount(afterEach)

function station(callsign: string): AprsStation {
  return {
    callsign,
    latitude: 51.5,
    longitude: -0.1,
    symbol: '/>',
    comment: null,
    course: null,
    speed: null,
    altitude: null,
    path: null,
    raw: null,
    last_heard_ms: 0,
  }
}

function repeater(
  callsign: string,
  channelOverrides: Partial<RepeaterChannel> = {},
): RepeaterStation {
  return {
    callsign,
    latitude: 54.9,
    longitude: -1.6,
    locator: null,
    location: null,
    postcode: null,
    region: null,
    keeper: null,
    channels: [
      {
        id: 1,
        band: '2M',
        channel: 'RV52',
        txMhz: 145.65,
        rxMhz: 145.05,
        modes: ['A'],
        ctcssHz: null,
        dmrColourCode: null,
        heightMagl: null,
        erpDbw: null,
        status: 'OPERATIONAL',
        ...channelOverrides,
      },
    ],
  }
}

// Mounts the composable in a host component, so its document listener is live.
function setup() {
  return mount(
    defineComponent({
      setup() {
        useLandExpandedRow()
        return () => h('div')
      },
    }),
  )
}

describe('useLandExpandedRow', () => {
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

  describe('a station clicked on the map', () => {
    it('expands its row', () => {
      setup()
      document.dispatchEvent(
        new CustomEvent('aprs-station-selected', { detail: { callsign: 'M0ABC-9' } }),
      )
      expect(landStore.searchExpandedCallsign).toBe('M0ABC-9')
    })

    it('stops listening once the pane unmounts', () => {
      setup().unmount()
      document.dispatchEvent(
        new CustomEvent('aprs-station-selected', { detail: { callsign: 'M0ABC-9' } }),
      )
      expect(landStore.searchExpandedCallsign).toBe('')
    })
  })

  describe('APRS rows', () => {
    beforeEach(() => {
      landStore.aprsStations = [station('M0ABC-9'), station('MB7UMS')]
    })

    it('collapses the expanded station once it ages out of the snapshot', async () => {
      landStore.setSearchExpandedCallsign('M0ABC-9')
      setup()
      landStore.aprsStations = [station('MB7UMS')]
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('')
    })

    it('collapses it when the list drops it in place, not only when replaced', async () => {
      landStore.setSearchExpandedCallsign('M0ABC-9')
      setup()
      landStore.aprsStations.splice(0, 1)
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('')
    })

    it('keeps the expanded station open while it is still heard', async () => {
      landStore.setSearchExpandedCallsign('MB7UMS')
      setup()
      landStore.aprsStations = [station('MB7UMS')]
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('MB7UMS')
    })

    it('never shuts a repeater row on an APRS poll', async () => {
      landStore.setSearchExpandedCallsign('rpt:GB3NM')
      setup()
      landStore.aprsStations = [station('MB7UMS')]
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('rpt:GB3NM')
    })

    it('touches nothing when no row is expanded', async () => {
      setup()
      const setExpanded = vi.spyOn(landStore, 'setSearchExpandedCallsign')
      landStore.aprsStations = [station('MB7UMS')]
      await nextTick()
      expect(setExpanded).not.toHaveBeenCalled()
    })
  })

  describe('repeater rows', () => {
    beforeEach(() => {
      landStore.setRepeatersLayerVisible(true)
      repeatersStore.stations = [repeater('GB3NM'), repeater('GB7DN', { band: '70CM' })]
    })

    it('collapses the expanded repeater when the filters remove it from the map', async () => {
      landStore.setSearchExpandedCallsign('rpt:GB3NM')
      setup()
      repeatersStore.toggleBand('70CM')
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('')
    })

    it('keeps the expanded repeater open while the filters still show it', async () => {
      landStore.setSearchExpandedCallsign('rpt:GB7DN')
      setup()
      repeatersStore.toggleBand('70CM')
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('rpt:GB7DN')
    })

    it('collapses the expanded repeater when the repeaters layer is switched off', async () => {
      landStore.setSearchExpandedCallsign('rpt:GB3NM')
      setup()
      landStore.setRepeatersLayerVisible(false)
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('')
    })

    it('leaves an expanded APRS row alone when the repeater filters change', async () => {
      landStore.setSearchExpandedCallsign('M0ABC-9')
      landStore.aprsStations = [station('M0ABC-9')]
      setup()
      repeatersStore.toggleBand('70CM')
      landStore.setRepeatersLayerVisible(false)
      await nextTick()
      expect(landStore.searchExpandedCallsign).toBe('M0ABC-9')
    })
  })
})
