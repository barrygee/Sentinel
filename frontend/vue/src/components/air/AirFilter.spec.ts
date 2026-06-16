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
  alt_baro?: number
  gs?: number
  track?: number
  baro_rate?: number
}

function planeFeature(props: PlaneProps, coords: [number, number] = [-0.4, 51.5]) {
  return { properties: props, geometry: { coordinates: coords } }
}

function makeAdsb(features: ReturnType<typeof planeFeature>[] = []) {
  return {
    _typeFilter: 'all' as 'all' | 'civil' | 'mil',
    _allHidden: false,
    _followEnabled: false,
    _selectedHex: null as string | null,
    _geojson: { type: 'FeatureCollection', features },
    _interpolatedCoords: vi.fn(() => null as [number, number] | null),
    _trackingNotifIds: null as Record<string, string> | null,
    _rebuildTagForHex: vi.fn(),
    toggleFollowByHex: vi.fn(),
    isFollowingHex: vi.fn(() => false),
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

// The track/notify/centre controls live inside an aircraft row's expanded
// accordion, so a row must be opened (clicked) before they exist.
async function openPlane(wrapper: ReturnType<typeof mountFilter>, optionIndex = 0) {
  await wrapper.findAll('.filter-result-option')[optionIndex]!.trigger('click')
}
function accordionButton(
  wrapper: ReturnType<typeof mountFilter>,
  kind: 'track' | 'notify' | 'centre',
) {
  const index = { track: 0, notify: 1, centre: 2 }[kind]
  return wrapper.findAll('.acft-acc-btn')[index]!
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
    it('lists only aircraft (excluding ground vehicles and towers), the airport and the base', () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      // 2 aircraft (the C1 ground vehicle and C3 tower are excluded), 1 airport, 1 base.
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(2)
      expect(wrapper.text()).toContain('BAW1')
      expect(wrapper.text()).toContain('RCH2')
      expect(wrapper.text()).not.toContain('GND3')
      expect(wrapper.text()).not.toContain('TWR4')
      expect(wrapper.findAll('.filter-icon-airport')).toHaveLength(1)
      expect(wrapper.findAll('.filter-icon-mil')).toHaveLength(1)
    })

    it('excludes ground vehicles and towers even in the ALL filter mode', () => {
      const adsb = makeAdsb([
        planeFeature({ hex: 'aa1', flight: 'BAW1', category: 'A3' }), // aircraft
        planeFeature({ hex: 'gg1', flight: 'CAR1', category: 'C1' }), // ground vehicle
        planeFeature({ hex: 'gg2', flight: 'SVC2', category: 'C2' }), // service vehicle
        planeFeature({ hex: 'tw1', flight: 'OBS3', category: 'C5' }), // static obstacle
        planeFeature({ hex: 'tw2', flight: 'TOWER', t: 'TWR' }), // tower by type
      ])
      adsb._typeFilter = 'all'
      const wrapper = mountFilter(adsb)
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(1)
      expect(wrapper.text()).toContain('BAW1')
      for (const excluded of ['CAR1', 'SVC2', 'OBS3', 'TOWER']) {
        expect(wrapper.text()).not.toContain(excluded)
      }
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

    it('exposes the section disclosure state via aria-expanded', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const heading = wrapper.findAll('.filter-section-label')[0]!
      // Sections start expanded.
      expect(heading.attributes('aria-expanded')).toBe('true')
      await heading.trigger('click') // collapse
      expect(heading.attributes('aria-expanded')).toBe('false')
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
      // 4 items (2 aircraft + airport + base); step past the last to wrap.
      for (let step = 0; step < 5; step++) {
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

  describe('combobox / listbox semantics', () => {
    it('marks the input as a combobox controlling the listbox', () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')
      expect(input.attributes('role')).toBe('combobox')
      expect(input.attributes('aria-autocomplete')).toBe('list')
      expect(input.attributes('aria-expanded')).toBe('true')
      expect(input.attributes('aria-controls')).toBe('filter-listbox')
    })

    it('exposes the rows as options the listbox owns via aria-owns', () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const listbox = wrapper.find('#filter-listbox')
      expect(listbox.attributes('role')).toBe('listbox')
      const owned = listbox.attributes('aria-owns') ?? ''
      // 2 aircraft + 1 airport + 1 base, each a real option id the listbox owns.
      expect(owned).toContain('filter-opt-plane-0')
      expect(owned).toContain('filter-opt-airport-0')
      expect(owned).toContain('filter-opt-mil-0')
      const options = wrapper.findAll('[role="option"]')
      expect(options).toHaveLength(4)
      expect(options[0]!.attributes('id')).toBe('filter-opt-plane-0')
      expect(options[0]!.attributes('aria-selected')).toBe('false')
    })

    it('hides the listbox and reports collapsed when there are no results', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      await wrapper.find('#filter-input').setValue('ZZZZZZ')
      expect(wrapper.find('#filter-listbox').exists()).toBe(false)
      const input = wrapper.find('#filter-input')
      expect(input.attributes('aria-expanded')).toBe('false')
      expect(input.attributes('aria-controls')).toBeUndefined()
    })

    it('points aria-activedescendant at the focused option and marks it selected', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus first plane
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBe('filter-opt-plane-0')
      expect(wrapper.find('#filter-opt-plane-0').attributes('aria-selected')).toBe('true')
    })

    it('drops aria-activedescendant when the focused row is collapsed out of view', async () => {
      const wrapper = mountFilter(makeAdsb(defaultPlanes()))
      const input = wrapper.find('#filter-input')
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus first plane
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBe('filter-opt-plane-0')
      // Collapse every section — the focused plane is no longer rendered, so the
      // activedescendant must not dangle at a removed option id.
      for (const heading of wrapper.findAll('.filter-section-label')) {
        await heading.trigger('click')
      }
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBeUndefined()
    })

    it('drops aria-activedescendant when the focused aircraft leaves the data', async () => {
      const adsb = makeAdsb(defaultPlanes())
      const wrapper = mountFilter(adsb)
      const input = wrapper.find('#filter-input')
      await input.trigger('keydown', { key: 'ArrowDown' }) // focus first plane (aa1)
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBe('filter-opt-plane-0')
      // Refresh with the focused aircraft gone while its section stays open: the
      // stale key matches no rendered option.
      adsb._geojson.features = [planeFeature({ hex: 'ee5', flight: 'XYZ5', category: 'A3' })]
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await nextTick()
      expect(input.attributes('aria-activedescendant')).toBeUndefined()
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

  describe('notification bell (in accordion)', () => {
    it('enables notifications and wires a working disable action', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      const addSpy = vi.spyOn(notifs, 'add')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)

      await openPlane(wrapper)
      await accordionButton(wrapper, 'notify').trigger('click')
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

      await openPlane(wrapper)
      await accordionButton(wrapper, 'notify').trigger('click')
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
      await openPlane(wrapper)
      await accordionButton(wrapper, 'notify').trigger('click')
      expect(airNotif.isEnabled('aa1')).toBe(false)
      expect(dismissSpy).not.toHaveBeenCalled()
    })

    it('the disable action tolerates the control losing its id map', async () => {
      const notifs = useNotificationsStore()
      const airNotif = useAirNotifStore()
      const addSpy = vi.spyOn(notifs, 'add')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      await accordionButton(wrapper, 'notify').trigger('click')
      const trackingCall = addSpy.mock.calls.find((call) => call[0].type === 'tracking')!
      // Control resets its id map before the action fires.
      adsb._trackingNotifIds = null
      expect(() => trackingCall[0].action!.callback()).not.toThrow()
      expect(airNotif.isEnabled('aa1')).toBe(false)
    })

    it('dismisses a stale tracking id when re-enabling', async () => {
      const notifs = useNotificationsStore()
      const dismissSpy = vi.spyOn(notifs, 'dismiss')
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb._trackingNotifIds = { aa1: 'stale-id' } // present but not enabled
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      await accordionButton(wrapper, 'notify').trigger('click')
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
      await openPlane(wrapper, 0) // registration row
      await accordionButton(wrapper, 'notify').trigger('click')
      await openPlane(wrapper, 1) // hex row (the only accordion now open)
      await accordionButton(wrapper, 'notify').trigger('click')
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
      await openPlane(wrapper)
      // Drop the control while the plane row is still expanded.
      await wrapper.setProps({ adsbControl: null } as never)
      await accordionButton(wrapper, 'notify').trigger('click')
      const trackingCall = addSpy.mock.calls.find((call) => call[0].type === 'tracking')!
      expect(trackingCall[0].title).toBe('STORED')
    })

    it('reflects the disabled (strike-through) icon when notifications are off', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      // Off by default: the strike-through line is rendered and the control is inactive.
      expect(accordionButton(wrapper, 'notify').find('line').exists()).toBe(true)
      expect(accordionButton(wrapper, 'notify').classes()).not.toContain('acft-acc-btn--active')
      await accordionButton(wrapper, 'notify').trigger('click')
      expect(accordionButton(wrapper, 'notify').find('line').exists()).toBe(false)
      expect(accordionButton(wrapper, 'notify').classes()).toContain('acft-acc-btn--active')
    })
  })

  describe('track button (in accordion)', () => {
    it('delegates to the control and marks the row active when now following', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb.isFollowingHex.mockReturnValue(true)
      const wrapper = mountFilter(adsb)

      await openPlane(wrapper)
      const button = accordionButton(wrapper, 'track')
      expect(button.attributes('aria-label')).toBe('Track aircraft')
      await button.trigger('click')

      expect(adsb.toggleFollowByHex).toHaveBeenCalledWith('aa1')
      expect(adsb.isFollowingHex).toHaveBeenCalledWith('aa1')
      expect(accordionButton(wrapper, 'track').classes()).toContain('acft-acc-btn--active')
      expect(accordionButton(wrapper, 'track').attributes('aria-label')).toBe('Untrack aircraft')
    })

    it('clears the active state when the control reports it stopped following', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb.isFollowingHex.mockReturnValue(false)
      const wrapper = mountFilter(adsb)

      await openPlane(wrapper)
      await accordionButton(wrapper, 'track').trigger('click')

      expect(adsb.toggleFollowByHex).toHaveBeenCalledWith('aa1')
      expect(accordionButton(wrapper, 'track').classes()).not.toContain('acft-acc-btn--active')
      expect(accordionButton(wrapper, 'track').attributes('aria-label')).toBe('Track aircraft')
    })

    it('does nothing when no adsb control is present', async () => {
      const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
      await openPlane(wrapper)
      await wrapper.setProps({ adsbControl: null } as never)
      await expect(accordionButton(wrapper, 'track').trigger('click')).resolves.not.toThrow()
    })

    it('reflects the control already following an aircraft on a data refresh', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      adsb._followEnabled = true
      adsb._selectedHex = 'aa1'
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      document.dispatchEvent(new CustomEvent('adsb-filter-change'))
      await wrapper.vm.$nextTick()
      expect(accordionButton(wrapper, 'track').classes()).toContain('acft-acc-btn--active')
    })
  })

  describe('aircraft live-telemetry accordion', () => {
    function cellValues(wrapper: ReturnType<typeof mountFilter>) {
      return wrapper.findAll('.acft-acc-body .apt-acc-cell-value').map((node) => node.text())
    }

    it('expands on row click and shows formatted live telemetry', async () => {
      const adsb = makeAdsb([
        planeFeature(
          {
            hex: 'aa1',
            flight: 'BAW1',
            r: 'G-EUUU',
            t: 'A320',
            category: 'A3',
            squawk: '1000',
            alt_baro: 35000,
            gs: 450,
            track: 270,
            baro_rate: 1216,
          },
          [-0.4, 51.5],
        ),
      ])
      const wrapper = mountFilter(adsb)
      expect(wrapper.find('.acft-acc-body').exists()).toBe(false)

      await openPlane(wrapper)
      expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
      const values = cellValues(wrapper)
      expect(values).toEqual([
        '51.5000°N',
        '0.4000°W',
        '270°',
        '35,000 ft',
        '450 kt',
        '+1,216 fpm',
        'A320',
        'G-EUUU',
        'A3',
        '1000',
      ])
    })

    it('shows GND for ground altitude and a negative climb rate', async () => {
      const adsb = makeAdsb([
        planeFeature({ hex: 'aa1', flight: 'BAW1', alt_baro: 0, baro_rate: -640 }),
      ])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      const values = cellValues(wrapper)
      expect(values).toContain('GND') // alt_baro 0 → on the ground
      expect(values).toContain('-640 fpm') // descent: no leading +
    })

    it('renders em dashes for missing and non-finite fields', async () => {
      // No alt/gs/track/type/reg/category/squawk, and a non-finite vertical rate.
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1', baro_rate: NaN })])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      const values = cellValues(wrapper)
      // HDG, ALT, SPD, VERTICAL (NaN), TYPE, REG, CATEGORY, SQUAWK all dash out;
      // only LAT/LON (from geometry) have values.
      expect(values.filter((value) => value === '—')).toHaveLength(8)
    })

    it('collapses the accordion when the open row is clicked again', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
      await openPlane(wrapper)
      expect(wrapper.find('.acft-acc-body').exists()).toBe(false)
    })

    it('updates the live values on each data poll', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1', alt_baro: 10000 })])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      expect(cellValues(wrapper)).toContain('10,000 ft')

      // Mutate the feed and emit the poll event the component listens for.
      ;(adsb._geojson.features[0]!.properties as PlaneProps).alt_baro = 12000
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await wrapper.vm.$nextTick()
      expect(cellValues(wrapper)).toContain('12,000 ft')
    })

    it('keeps the row with last-known data and flags SIGNAL LOST on feed dropout', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1', alt_baro: 10000 })])
      const wrapper = mountFilter(adsb)
      await openPlane(wrapper)
      expect(wrapper.find('.acft-acc-signal-lost').exists()).toBe(false)

      // Aircraft leaves the feed.
      adsb._geojson.features = []
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await wrapper.vm.$nextTick()

      // Row + accordion remain (pinned snapshot), values retained, dropout flagged.
      expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
      expect(wrapper.find('.acft-acc-body').classes()).toContain('acft-acc-body--stale')
      expect(wrapper.find('.acft-acc-signal-lost').text()).toBe('SIGNAL LOST')
      expect(cellValues(wrapper)).toContain('10,000 ft')
    })

    it('removes the lost row after the signal-lost grace period elapses', async () => {
      vi.useFakeTimers()
      try {
        const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1', alt_baro: 10000 })])
        const wrapper = mountFilter(adsb)
        await openPlane(wrapper)

        // Aircraft leaves the feed across two consecutive polls (the second must
        // not start a second removal timer).
        adsb._geojson.features = []
        document.dispatchEvent(new CustomEvent('adsb-data-update'))
        await wrapper.vm.$nextTick()
        document.dispatchEvent(new CustomEvent('adsb-data-update'))
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.acft-acc-signal-lost').exists()).toBe(true)

        // After the grace window the row (and its accordion) are gone.
        vi.advanceTimersByTime(15000)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.acft-acc-body').exists()).toBe(false)
        expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('keeps the row and cancels removal if the aircraft returns within the grace window', async () => {
      vi.useFakeTimers()
      try {
        const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1', alt_baro: 10000 })])
        const wrapper = mountFilter(adsb)
        await openPlane(wrapper)

        adsb._geojson.features = []
        document.dispatchEvent(new CustomEvent('adsb-data-update'))
        await wrapper.vm.$nextTick()
        vi.advanceTimersByTime(10000) // still within the grace window

        // Aircraft reappears in the feed.
        adsb._geojson.features = [planeFeature({ hex: 'aa1', flight: 'BAW1', alt_baro: 11000 })]
        document.dispatchEvent(new CustomEvent('adsb-data-update'))
        await wrapper.vm.$nextTick()

        // Advancing past the original deadline must not remove the now-live row.
        vi.advanceTimersByTime(15000)
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
        expect(wrapper.find('.acft-acc-signal-lost').exists()).toBe(false)
        expect(cellValues(wrapper)).toContain('11,000 ft')
      } finally {
        vi.useRealTimers()
      }
    })

    it('centres the map on the aircraft via the centre button', async () => {
      const map = makeMap()
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' }, [1, 2])])
      adsb._interpolatedCoords.mockReturnValue([3, 4])
      const wrapper = mountFilter(adsb, () => map)
      await openPlane(wrapper)
      // Opening already eased once; clear and assert the explicit centre click.
      map.easeTo.mockClear()
      await accordionButton(wrapper, 'centre').trigger('click')
      expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [3, 4] }))
    })

    it('centre button falls back to snapshot coordinates without interpolation', async () => {
      const map = makeMap()
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' }, [5, 6])])
      adsb._interpolatedCoords.mockReturnValue(null)
      const wrapper = mountFilter(adsb, () => map)
      await openPlane(wrapper)
      map.easeTo.mockClear()
      await accordionButton(wrapper, 'centre').trigger('click')
      expect(map.easeTo).toHaveBeenCalledWith(expect.objectContaining({ center: [5, 6] }))
    })

    it('centre button is a no-op without a control', async () => {
      const map = makeMap()
      const wrapper = mountFilter(
        makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]),
        () => map,
      )
      await openPlane(wrapper)
      await wrapper.setProps({ adsbControl: null } as never)
      map.easeTo.mockClear()
      await accordionButton(wrapper, 'centre').trigger('click')
      expect(map.easeTo).not.toHaveBeenCalled()
    })

    it('centre button tolerates a missing map', async () => {
      const adsb = makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })])
      const wrapper = mountFilter(adsb, () => null)
      await openPlane(wrapper)
      await expect(accordionButton(wrapper, 'centre').trigger('click')).resolves.not.toThrow()
    })
  })

  describe('row ordering', () => {
    // Returns [primary, secondary] text for each rendered aircraft row, in order.
    function planeRows(wrapper: ReturnType<typeof mountFilter>) {
      return wrapper
        .findAll('.filter-result-item')
        .filter((item) => item.find('.filter-icon-plane').exists())
        .map((item) => [
          item.find('.filter-result-primary').text(),
          item.find('.filter-result-secondary').text(),
        ])
    }

    it('orders rows stably by callsign then hex, regardless of feed order', async () => {
      const adsb = makeAdsb([
        planeFeature({ hex: 'zzz', flight: 'SHARED' }),
        planeFeature({ hex: 'mmm', flight: 'ALPHA1' }),
        planeFeature({ hex: 'aaa', flight: 'SHARED' }),
      ])
      const wrapper = mountFilter(adsb)
      // ALPHA1 sorts first; the two SHARED callsigns tie and break by hex (aaa < zzz).
      expect(planeRows(wrapper)).toEqual([
        ['ALPHA1', 'MMM'],
        ['SHARED', 'AAA'],
        ['SHARED', 'ZZZ'],
      ])

      // Next poll returns the same aircraft in a different feed order.
      adsb._geojson.features = [
        planeFeature({ hex: 'aaa', flight: 'SHARED' }),
        planeFeature({ hex: 'zzz', flight: 'SHARED' }),
        planeFeature({ hex: 'mmm', flight: 'ALPHA1' }),
      ]
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await nextTick()
      // Rendered order is unchanged — driven by identity, not feed order.
      expect(planeRows(wrapper)).toEqual([
        ['ALPHA1', 'MMM'],
        ['SHARED', 'AAA'],
        ['SHARED', 'ZZZ'],
      ])
    })

    it('falls back to hex for ordering when a callsign is absent', () => {
      const adsb = makeAdsb([
        planeFeature({ hex: 'bbb', flight: 'WELL01' }),
        planeFeature({ hex: 'aaa', flight: '' }), // no callsign → ordered by hex 'aaa'
      ])
      const wrapper = mountFilter(adsb)
      // 'aaa' (hex fallback) sorts before 'WELL01'; the row primary shows the raw
      // hex while the secondary shows it upper-cased.
      expect(planeRows(wrapper)).toEqual([
        ['aaa', 'AAA'],
        ['WELL01', 'BBB'],
      ])
    })

    it('pins the selected aircraft to the top, and keeps it there as the list churns', async () => {
      const adsb = makeAdsb([
        planeFeature({ hex: 'aaa', flight: 'AAA1' }),
        planeFeature({ hex: 'mmm', flight: 'MMM1' }),
        planeFeature({ hex: 'zzz', flight: 'ZZZ1' }),
      ])
      const wrapper = mountFilter(adsb)
      // Sorted order is AAA1, MMM1, ZZZ1; expand the last one.
      await wrapper.findAll('.filter-result-option')[2]!.trigger('click')
      // It jumps to the top; the rest stay in sorted order below it.
      expect(planeRows(wrapper).map((row) => row[0])).toEqual(['ZZZ1', 'AAA1', 'MMM1'])

      // A new aircraft that would sort first arrives — the pinned row stays put.
      adsb._geojson.features = [
        planeFeature({ hex: 'mmm', flight: 'MMM1' }),
        planeFeature({ hex: 'aaa', flight: 'AAA1' }),
        planeFeature({ hex: 'zzz', flight: 'ZZZ1' }),
        planeFeature({ hex: 'bbb', flight: 'AAA0' }),
      ]
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await nextTick()
      expect(planeRows(wrapper).map((row) => row[0])).toEqual(['ZZZ1', 'AAA0', 'AAA1', 'MMM1'])
    })

    it('keeps the pinned row at the top (via snapshot) when it drops out of the feed', async () => {
      const adsb = makeAdsb([
        planeFeature({ hex: 'aaa', flight: 'AAA1' }),
        planeFeature({ hex: 'mmm', flight: 'MMM1' }),
        planeFeature({ hex: 'zzz', flight: 'ZZZ1' }),
      ])
      const wrapper = mountFilter(adsb)
      await wrapper.findAll('.filter-result-option')[1]!.trigger('click') // expand MMM1
      expect(planeRows(wrapper).map((row) => row[0])).toEqual(['MMM1', 'AAA1', 'ZZZ1'])

      // The pinned aircraft drops out; the other two remain live.
      adsb._geojson.features = [
        planeFeature({ hex: 'aaa', flight: 'AAA1' }),
        planeFeature({ hex: 'zzz', flight: 'ZZZ1' }),
      ]
      document.dispatchEvent(new CustomEvent('adsb-data-update'))
      await nextTick()
      // SIGNAL LOST shows, and the snapshot stays pinned to the top.
      expect(wrapper.find('.acft-acc-signal-lost').exists()).toBe(true)
      expect(planeRows(wrapper).map((row) => row[0])).toEqual(['MMM1', 'AAA1', 'ZZZ1'])
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

    it('expands an aircraft by hex (map click), ignoring unknown hexes and ground vehicles', async () => {
      const wrapper = mountFilter(
        makeAdsb([
          planeFeature({ hex: 'aa1', flight: 'BAW1' }),
          planeFeature({ hex: 'gg1', flight: 'CAR1', category: 'C1' }), // ground vehicle
        ]),
      )
      const vm = wrapper.vm as unknown as { expandAircraft: (hex: string) => void }
      // A ground vehicle is not a listed aircraft → no accordion opens.
      vm.expandAircraft('gg1')
      await nextTick()
      expect(wrapper.find('.acft-acc-body').exists()).toBe(false)
      // An unknown hex is a no-op.
      vm.expandAircraft('zzz')
      await nextTick()
      expect(wrapper.find('.acft-acc-body').exists()).toBe(false)
      // A real aircraft opens its accordion.
      vm.expandAircraft('aa1')
      await nextTick()
      expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
    })

    it('clears an active search so the clicked aircraft is in the list', async () => {
      const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
      await wrapper.find('#filter-input').setValue('ZZZZZZ') // filters everything out
      ;(wrapper.vm as unknown as { expandAircraft: (hex: string) => void }).expandAircraft('aa1')
      await nextTick()
      expect((wrapper.find('#filter-input').element as HTMLInputElement).value).toBe('')
      expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
    })

    it('expands an aircraft whose section the user had collapsed', async () => {
      const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
      const headings = wrapper.findAll('.filter-section-label')
      const aircraftHeading = headings.find((node) => node.text().includes('AIRCRAFT'))!
      await aircraftHeading.trigger('click') // collapse aircraft
      ;(wrapper.vm as unknown as { expandAircraft: (hex: string) => void }).expandAircraft('aa1')
      await nextTick()
      expect(wrapper.find('.acft-acc-body').exists()).toBe(true)
    })
  })

  describe('scroll-into-view on expand', () => {
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

    it('scrolls the open (pinned) accordion into view when a list row is clicked', async () => {
      const wrapper = mountFilter(
        makeAdsb([
          planeFeature({ hex: 'aa1', flight: 'AAA1' }),
          planeFeature({ hex: 'bb2', flight: 'BBB2' }),
        ]),
      )
      await wrapper.findAll('.filter-result-option')[1]!.trigger('click') // open BBB2
      await flushRaf()
      // The open row is pinned to the top and scrolled into view.
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })

    it('scrolls into view when an aircraft is expanded from a map click', async () => {
      const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
      ;(wrapper.vm as unknown as { expandAircraft: (hex: string) => void }).expandAircraft('aa1')
      await flushRaf()
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })
  })

  describe('data refresh events', () => {
    it('refreshes the aircraft list when the search tab is opened', async () => {
      const adsb = makeAdsb([])
      const wrapper = mountFilter(adsb)
      adsb._geojson.features = defaultPlanes()
      document.dispatchEvent(new CustomEvent('msb-tab-switch', { detail: 'search' }))
      await nextTick()
      // Only the 2 aircraft show; the ground vehicle and tower are excluded.
      expect(wrapper.findAll('.filter-icon-plane')).toHaveLength(2)
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
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations with an aircraft accordion expanded', async () => {
    const wrapper = mountFilter(makeAdsb([planeFeature({ hex: 'aa1', flight: 'BAW1' })]))
    await openPlane(wrapper)
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
