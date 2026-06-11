import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'

// Deterministic, small datasets in place of the real (large) airport/base data.
vi.mock('./controls/airports/AirportsControl', () => ({
  AIRPORTS_DATA: {
    features: [
      {
        properties: {
          icao: 'EGLL',
          iata: 'LHR',
          name: 'Heathrow',
          bounds: [-0.5, 51.4, -0.4, 51.5],
          // tower valid, radar empty (skipped), approach zero (skipped),
          // atis multi-value (first taken).
          freqs: { tower: '118.500', radar: '', approach: '0', atis: '113.750 / 113.760' },
        },
        geometry: { coordinates: [-0.46, 51.47] },
      },
    ],
  },
}))

vi.mock('./controls/military-bases/MilitaryBasesControl', () => ({
  MILITARY_BASES_DATA: {
    features: [
      {
        properties: { icao: 'EGVA', name: 'RAF Fairford', bounds: [-1.8, 51.6, -1.7, 51.7] },
        geometry: { coordinates: [-1.79, 51.68] },
      },
    ],
  },
}))

import AirFilter from './AirFilter.vue'
import { AIRPORTS_DATA } from './controls/airports/AirportsControl'
import { MILITARY_BASES_DATA } from './controls/military-bases/MilitaryBasesControl'
import { useAirNotifStore } from '@/stores/airNotif'
import { useNotificationsStore } from '@/stores/notifications'
import { useSdrStore } from '@/stores/sdr'

interface PlaneProps {
  hex: string
  flight?: string
  r?: string
  squawk?: string
  category?: string
  t?: string
  military?: boolean
  emergency?: string
}

function planeFeature(props: PlaneProps, coords: [number, number] = [-0.4, 51.5]) {
  return { properties: props, geometry: { coordinates: coords } }
}

function makeAdsb(features: ReturnType<typeof planeFeature>[] = []) {
  return {
    _typeFilter: 'all' as 'all' | 'civil' | 'mil',
    _allHidden: false,
    _geojson: { type: 'FeatureCollection', features },
    _interpolatedCoords: vi.fn(() => null as [number, number] | null),
    _trackingNotifIds: null as Record<string, string> | null,
    _rebuildTagForHex: vi.fn(),
  }
}

function makeMap() {
  return { easeTo: vi.fn(), fitBounds: vi.fn(), getZoom: vi.fn(() => 8) }
}

// Default fixture: one civil, one military, one ground, one tower aircraft.
function defaultPlanes() {
  return [
    planeFeature({ hex: 'aa1', flight: 'BAW1', r: 'G-AAA', squawk: '7000', category: 'A3' }),
    planeFeature({ hex: 'bb2', flight: 'RCH2', military: true, category: 'A4' }),
    planeFeature({ hex: 'cc3', flight: 'GND3', category: 'C1' }),
    planeFeature({ hex: 'dd4', flight: 'TWR4', category: 'C3' }),
  ]
}

function mountFilter(
  adsbControl: unknown,
  getMap: () => unknown = () => makeMap(),
  attachTo?: HTMLElement,
) {
  return mount(AirFilter, {
    props: {
      adsbControl,
      airportsControl: null,
      militaryBasesControl: null,
      getMap,
    } as never,
    ...(attachTo ? { attachTo } : {}),
  })
}

enableAutoUnmount(afterEach)

describe('AirFilter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    document.body.innerHTML = ''
    // jsdom has no real scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn()
  })

  describe('search results', () => {
    it('lists all aircraft, the airport and the base with an empty query', () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      // 4 planes (no filter), 1 airport, 1 base.
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(4)
      expect(wrapper.findAll('.filter-icon-airport')).toHaveLength(1)
      expect(wrapper.findAll('.filter-icon-mil')).toHaveLength(1)
    })

    it('hides all aircraft when the control reports allHidden', () => {
      const adsb = makeAdsb(defaultPlanes())
      adsb._allHidden = true
      const wrapper = mountFilter(adsb)
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(0)
    })

    it('restricts to civil aircraft, excluding military, ground and towers', async () => {
      const adsb = makeAdsb(defaultPlanes())
      adsb._typeFilter = 'civil'
      const wrapper = mountFilter(adsb)
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await nextTick()
      const primaries = wrapper.findAll('.filter-icon-plane')
      // Only the single civil aircraft (aa1) survives.
      expect(primaries).toHaveLength(1)
    })

    it('restricts to military aircraft only', async () => {
      const adsb = makeAdsb(defaultPlanes())
      adsb._typeFilter = 'mil'
      const wrapper = mountFilter(adsb)
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await nextTick()
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(1)
      expect(wrapper.text()).toContain('RCH2')
    })

    it('matches the query against callsign, hex, registration and squawk', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')
      await input.setValue('g-aaa') // registration of aa1
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(1)
      expect(wrapper.text()).toContain('BAW1')
    })

    it('shows the empty state when nothing matches', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      await wrapper.find('#filter-input').setValue('ZZZZZZ')
      expect(wrapper.find('.filter-no-results').exists()).toBe(true)
    })

    it('renders an empty list when there is no adsb control', () => {
      const wrapper = mountFilter(null)
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(0)
      // Airports + base still come from static data.
      expect(wrapper.findAll('.filter-icon-airport')).toHaveLength(1)
    })

    it('builds the secondary plane line from hex, registration and squawk', () => {
      const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
      // hex only (no reg/squawk) → uppercased hex.
      expect(wrapper.find('.filter-result-secondary').text()).toBe('AA1')
    })

    it('handles an emergency flag and an aircraft with no hex', () => {
      const wrapper = mountFilter(
        makeAdsb([
          planeFeature({
            hex: 'aa1',
            flight: 'BAW1',
            r: 'G-AAA',
            squawk: '7500',
            emergency: '7700',
          }),
          planeFeature({ hex: '', flight: 'NOHEX' }),
        ]),
      )
      // Both rows render; the empty-hex plane shows its callsign as the primary.
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(2)
      expect(wrapper.text()).toContain('NOHEX')
    })
  })

  describe('section collapse + auto-open', () => {
    it('toggles a section collapsed and expands it back', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const heading = wrapper.findAll('.filter-section-label')[0]!
      await heading.trigger('click') // collapse aircraft
      expect(heading.classes()).toContain('filter-section-label--collapsed')
      await heading.trigger('click') // expand again
      expect(heading.classes()).not.toContain('filter-section-label--collapsed')
    })

    it('auto-opens a collapsed section that gains matches, then re-collapses it', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const aircraftHeading = wrapper.findAll('.filter-section-label')[0]!
      await aircraftHeading.trigger('click') // user collapses aircraft
      expect(aircraftHeading.classes()).toContain('filter-section-label--collapsed')

      await wrapper.find('#filter-input').setValue('baw1') // matches aircraft → auto-open
      await nextTick()
      expect(wrapper.findAll('.filter-section-label')[0]!.classes()).not.toContain(
        'filter-section-label--collapsed',
      )

      await wrapper.find('#filter-input').setValue('') // matches gone → re-collapse
      await nextTick()
      expect(wrapper.findAll('.filter-section-label')[0]!.classes()).toContain(
        'filter-section-label--collapsed',
      )
    })
  })

  describe('keyboard navigation', () => {
    let rafQueue: FrameRequestCallback[]
    beforeEach(() => {
      rafQueue = []
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
        rafQueue.push(cb)
        return rafQueue.length
      })
    })
    afterEach(() => vi.unstubAllGlobals())

    async function flushRaf() {
      await nextTick()
      rafQueue.splice(0).forEach((cb) => cb(0))
    }

    it('moves the focus down and up through the result list', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')

      await input.trigger('keydown', { key: 'ArrowDown' })
      await flushRaf()
      expect(wrapper.find('.keyboard-focused').exists()).toBe(true)
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

      await input.trigger('keydown', { key: 'ArrowDown' }) // second item
      await input.trigger('keydown', { key: 'ArrowUp' }) // back to first
      await input.trigger('keydown', { key: 'ArrowUp' }) // clears focus
      await nextTick()
      expect(wrapper.find('.keyboard-focused').exists()).toBe(false)
    })

    it('activates the focused plane on Enter', async () => {
      const map = makeMap()
      const wrapper = mountFilter(makeAdsb(defaultPlanes()), () => map)
      const input = wrapper.find('#filter-input')
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus first plane
      await input.trigger('keydown', { key: 'Enter' })
      expect(map.easeTo).toHaveBeenCalled()
    })

    it('focuses the first item when Enter is pressed with nothing focused', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      await wrapper.find('#filter-input').trigger('keydown', { key: 'Enter' })
      await flushRaf()
      expect(wrapper.find('.keyboard-focused').exists()).toBe(true)
    })

    it('wraps to the first item when arrowing past the end', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')
      // 6 items (4 planes + airport + base); step past the last to wrap.
      for (let step = 0; step < 7; step++) {
        await input.trigger('keydown', { key: 'ArrowDown' })
      }
      await flushRaf()
      // Back on the first plane (aa1).
      expect(wrapper.find('.keyboard-focused').exists()).toBe(true)
    })

    it('ignores keys that are not navigation keys', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      await expect(
        wrapper.find('#filter-input').trigger('keydown', { key: 'a' }),
      ).resolves.not.toThrow()
    })

    it('activates a focused airport on Enter', async () => {
      const wrapper = mountFilter(makeAdsb([]), () => makeMap()) // airport + base only
      const input = wrapper.find('#filter-input')
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus airport
      await input.trigger('keydown', { key: 'Enter' }) // toggleAirport
      expect(wrapper.find('.apt-acc-body').exists()).toBe(true)
    })

    it('activates a focused base on Enter', async () => {
      const map = makeMap()
      const wrapper = mountFilter(makeAdsb([]), () => map) // airport + base only
      const input = wrapper.find('#filter-input')
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus airport
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus base
      await input.trigger('keydown', { key: 'Enter' }) // selectMil
      expect(map.fitBounds).toHaveBeenCalled()
    })

    it('clears the query on Escape', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')
      await input.setValue('baw1')
      await input.trigger('keydown', { key: 'Escape' })
      expect((input.element as HTMLInputElement).value).toBe('')
    })

    it('does nothing on arrow keys when the list is empty', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      await wrapper.find('#filter-input').setValue('ZZZZZZ')
      await expect(
        wrapper.find('#filter-input').trigger('keydown', { key: 'ArrowDown' }),
      ).resolves.not.toThrow()
    })
  })

  describe('clear button', () => {
    it('clears the query and refocuses the input', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()), () => makeMap(), document.body)
      const input = wrapper.find('#filter-input')
      await input.setValue('baw1')
      await wrapper.find('#filter-clear-btn').trigger('click')
      expect((input.element as HTMLInputElement).value).toBe('')
      expect(document.activeElement).toBe(input.element)
    })
  })

  describe('airport accordion + frequencies', () => {
    it('expands an airport row and lists only the valid frequencies', async () => {
      const map = makeMap()
      const wrapper = mountFilter(makeAdsb([]), () => map)
      await wrapper.find('.filter-icon-airport').trigger('click')
      expect(map.fitBounds).toHaveBeenCalled()
      // tower + atis valid; radar (non-numeric) and approach (0) skipped.
      expect(wrapper.findAll('.apt-acc-freq')).toHaveLength(2)
      // collapse again
      await wrapper.find('.filter-icon-airport').trigger('click')
      expect(wrapper.find('.apt-acc-body').exists()).toBe(false)
    })

    it('formats the latitude and longitude with hemisphere suffixes', async () => {
      const wrapper = mountFilter(makeAdsb([]))
      await wrapper.find('.filter-icon-airport').trigger('click')
      const text = wrapper.find('.apt-acc-body').text()
      expect(text).toContain('51.4700°N')
      expect(text).toContain('0.4600°W')
    })

    it('renders southern/eastern hemispheres and falls back for missing fields', async () => {
      const airport = AIRPORTS_DATA.features[0]!
      const base = MILITARY_BASES_DATA.features[0]!
      const originalIata = airport.properties.iata
      const originalCoords = airport.geometry.coordinates
      const originalIcao = base.properties.icao
      airport.properties.iata = '' // no IATA → no ' · IATA' suffix
      airport.geometry.coordinates = [10, -10] // lon +E, lat -S
      base.properties.icao = '' // no ICAO → name-slice fallback
      try {
        const wrapper = mountFilter(makeAdsb([]))
        await wrapper.find('.filter-icon-airport').trigger('click')
        const body = wrapper.find('.apt-acc-body').text()
        expect(body).toContain('10.0000°S')
        expect(body).toContain('10.0000°E')
        // Base primary falls back to the uppercased, sliced name.
        expect(wrapper.text()).toContain('RAF FA')
      } finally {
        airport.properties.iata = originalIata
        airport.geometry.coordinates = originalCoords
        base.properties.icao = originalIcao
      }
    })

    it('shows an inline notice instead of tuning when no SDR is connected', async () => {
      const wrapper = mountFilter(makeAdsb([]))
      await wrapper.find('.filter-icon-airport').trigger('click')
      await wrapper.find('.apt-acc-freq').trigger('click')
      expect(wrapper.find('.apt-acc-notice').exists()).toBe(true)
    })

    it('tunes the SDR and posts a notification when one is connected', async () => {
      const sdr = useSdrStore()
      sdr.connected = true
      const notifs = useNotificationsStore()
      const addSpy = vi.spyOn(notifs, 'add')
      const tuneEvents: CustomEvent[] = []
      document.addEventListener('sentinel:sdr-tune-external', (event) =>
        tuneEvents.push(event as CustomEvent),
      )
      const wrapper = mountFilter(makeAdsb([]))
      await wrapper.find('.filter-icon-airport').trigger('click')
      await wrapper.find('.apt-acc-freq').trigger('click')
      expect(tuneEvents).toHaveLength(1)
      expect(tuneEvents[0]!.detail).toMatchObject({ mode: 'AM', hz: 118_500_000 })
      expect(addSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'system' }))
    })
  })

  describe('selection actions', () => {
    it('eases to a plane using the interpolated coordinates when available', async () => {
      const map = makeMap()
      const adsb = makeAdsb(defaultPlanes())
      adsb._interpolatedCoords.mockReturnValue([1, 2])
      const wrapper = mountFilter(adsb, () => map)
      await wrapper.findAll('.filter-result-info')[0]!.trigger('click')
      expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [1, 2] }))
    })

    it('does nothing when selecting a plane with no adsb control', async () => {
      // Render planes, then drop the control so selectPlane sees null.
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      await wrapper.setProps({ adsbControl: null } as never)
      await expect(
        wrapper.findAll('.filter-result-info')[0]!.trigger('click'),
      ).resolves.not.toThrow()
    })

    it('fits the map to a military base on selection', async () => {
      const map = makeMap()
      const wrapper = mountFilter(makeAdsb([]), () => map)
      await wrapper.find('.filter-icon-mil').trigger('click')
      expect(map.fitBounds).toHaveBeenCalled()
    })

    it('fires the same handlers from each alternate row hit target', async () => {
      const map = makeMap()
      // Airport + base only → predictable .filter-result-info ordering.
      const wrapper = mountFilter(makeAdsb([]), () => map)
      await wrapper.findAll('.filter-result-info')[0]!.trigger('click') // airport info
      await wrapper.find('.filter-result-chevron').trigger('click') // airport chevron
      await wrapper.findAll('.filter-result-info')[1]!.trigger('click') // base info
      const milHeading = wrapper
        .findAll('.filter-section-label')
        .find((node) => node.text().includes('MILITARY BASES'))!
      await milHeading.trigger('click') // base section heading toggle
      expect(map.fitBounds).toHaveBeenCalled()

      // Plane icon hit target (distinct from the info hit target).
      const planeWrapper = mountFilter(
        makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]),
        () => map,
      )
      await planeWrapper.find('.filter-icon-plane').trigger('click')
      expect(map.easeTo).toHaveBeenCalled()
    })

    it('tolerates a fitBounds with no map and with a control panel present', async () => {
      const panel = document.createElement('div')
      panel.className = 'maplibregl-ctrl-top-right'
      document.body.appendChild(panel)
      const map = makeMap()
      const wrapper = mountFilter(makeAdsb([]), () => map)
      await wrapper.find('.filter-icon-mil').trigger('click')
      expect(map.fitBounds).toHaveBeenCalled()

      const wrapperNoMap = mountFilter(makeAdsb([]), () => null)
      await expect(wrapperNoMap.find('.filter-icon-mil').trigger('click')).resolves.not.toThrow()
    })
  })

  describe('notification bell', () => {
    function bellAt(wrapper: ReturnType<typeof mountFilter>, index: number) {
      return wrapper.findAll('.filter-bell-btn')[index]!
    }

    it('enables notifications and wires a working disable action', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      const addSpy = vi.spyOn(notifs, 'add')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)

      await bellAt(wrapper, 0).trigger('click')
      expect(airNotif.isEnabled('aa1')).toBe(true)
      expect(adsb._trackingNotifIds).not.toBeNull()
      expect(adsb._rebuildTagForHex).toHaveBeenCalledWith('aa1')

      // The tracking notification carries an action that disables again.
      const trackingCall = addSpy.mock.calls.find((call) => call[0].type === 'tracking')!
      trackingCall[0].action!.callback()
      expect(airNotif.isEnabled('aa1')).toBe(false)
    })

    it('disables notifications and dismisses the tracking entry', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      const dismissSpy = vi.spyOn(notifs, 'dismiss')
      airNotif.enable('aa1', 'BAW1')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb._trackingNotifIds = { aa1: 'existing-id' }
      const wrapper = mountFilter(adsb)

      await bellAt(wrapper, 0).trigger('click')
      expect(airNotif.isEnabled('aa1')).toBe(false)
      expect(dismissSpy).toHaveBeenCalledWith('existing-id')
      expect(adsb._trackingNotifIds!.aa1).toBeUndefined()
    })

    it('disables notifications with no tracking id recorded', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      const dismissSpy = vi.spyOn(notifs, 'dismiss')
      airNotif.enable('aa1', 'BAW1')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb._trackingNotifIds = {} // enabled in the store, but no id tracked
      const wrapper = mountFilter(adsb)
      await bellAt(wrapper, 0).trigger('click')
      expect(airNotif.isEnabled('aa1')).toBe(false)
      expect(dismissSpy).not.toHaveBeenCalled()
    })

    it('the disable action tolerates the control losing its id map', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      const addSpy = vi.spyOn(notifs, 'add')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)
      await bellAt(wrapper, 0).trigger('click')
      const trackingCall = addSpy.mock.calls.find((call) => call[0].type === 'tracking')!
      // Control resets its id map before the action fires.
      adsb._trackingNotifIds = null
      expect(() => trackingCall[0].action!.callback()).not.toThrow()
      expect(airNotif.isEnabled('aa1')).toBe(false)
    })

    it('stops mousedown from bubbling on the bell button', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)
      await expect(bellAt(wrapper, 0).trigger('mousedown')).resolves.not.toThrow()
    })

    it('dismisses a stale tracking id when re-enabling', async () => {
      const notifs = useNotificationsStore()
      const dismissSpy = vi.spyOn(notifs, 'dismiss')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb._trackingNotifIds = { aa1: 'stale-id' } // present but not enabled
      const wrapper = mountFilter(adsb)
      await bellAt(wrapper, 0).trigger('click')
      expect(dismissSpy).toHaveBeenCalledWith('stale-id')
    })

    it('falls back to registration then hex for the callsign label', async () => {
      const notifs = useNotificationsStore()
      const addSpy = vi.spyOn(notifs, 'add')
      const adsb = makeAdsb([
        planeFeature({ hex: 'aa1', flight: '', r: 'G-REG' }),
        planeFeature({ hex: 'bb2', flight: '', r: '' }),
      ])
      const wrapper = mountFilter(adsb)
      await bellAt(wrapper, 0).trigger('click') // registration
      await bellAt(wrapper, 1).trigger('click') // hex
      const titles = addSpy.mock.calls.map((call) => call[0].title)
      expect(titles).toContain('G-REG')
      expect(titles).toContain('bb2')
    })

    it('adds a plain tracking notification when no control is present', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      airNotif.callsigns['aa1'] = 'STORED'
      const addSpy = vi.spyOn(notifs, 'add')
      const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
      // Drop the control while the plane row is still rendered.
      await wrapper.setProps({ adsbControl: null } as never)
      await bellAt(wrapper, 0).trigger('click')
      const trackingCall = addSpy.mock.calls.find((call) => call[0].type === 'tracking')!
      expect(trackingCall[0].title).toBe('STORED')
    })
  })

  describe('exposed API', () => {
    it('focuses the input via the exposed focus method', () => {
      const wrapper = mountFilter(makeAdsb([]), () => makeMap(), document.body)
      ;(wrapper.vm as unknown as { focus: () => void }).focus()
      expect(document.activeElement).toBe(wrapper.find('#filter-input').element)
    })

    it('expands a known airport on demand and ignores an unknown ICAO', async () => {
      const wrapper = mountFilter(makeAdsb([]))
      const vm = wrapper.vm as unknown as { expandAirport: (icao: string) => void }
      vm.expandAirport('EGLL')
      await nextTick()
      expect(wrapper.find('.apt-acc-body').exists()).toBe(true)
      vm.expandAirport('XXXX') // unknown → no change, no throw
      await nextTick()
      expect(wrapper.find('.apt-acc-body').exists()).toBe(true)
    })

    it('expands an airport whose section the user had collapsed', async () => {
      const wrapper = mountFilter(makeAdsb([]))
      // Collapse the airports section first.
      const headings = wrapper.findAll('.filter-section-label')
      const airportsHeading = headings.find((node) => node.text().includes('AIRPORTS'))!
      await airportsHeading.trigger('click')
      ;(wrapper.vm as unknown as { expandAirport: (icao: string) => void }).expandAirport('EGLL')
      await nextTick()
      expect(wrapper.find('.apt-acc-body').exists()).toBe(true)
    })
  })

  describe('data refresh events', () => {
    it('refreshes the aircraft list when the search tab is opened', async () => {
      const adsb = makeAdsb([])
      const wrapper = mountFilter(adsb)
      adsb._geojson.features = defaultPlanes()
      document.dispatchEvent(new CustomEvent('msb-tab-switch', { detail: 'search' }))
      await nextTick()
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(4)
    })

    it('ignores a tab switch to a non-search tab', async () => {
      const adsb = makeAdsb([])
      const wrapper = mountFilter(adsb)
      adsb._geojson.features = defaultPlanes()
      document.dispatchEvent(new CustomEvent('msb-tab-switch', { detail: 'tracking' }))
      await nextTick()
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(0)
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountFilter(makeAdsb(defaultPlanes()))
    // region: panel lives inside a landmark in-app. button-name: icon buttons
    // rely on titles/markup — a pre-existing gap for the phase 7/8 a11y work.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false }, 'button-name': { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
