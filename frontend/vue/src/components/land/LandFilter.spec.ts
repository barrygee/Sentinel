import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandFilter from './LandFilter.vue'
import { useLandStore, type AprsStation } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import LandCameraDetails from './LandCameraDetails.vue'
import type { CameraFeature, FeedWithStatus } from '@/types/landFeeds'

function station(overrides: Partial<AprsStation> = {}): AprsStation {
  return {
    callsign: 'M0ABC-9',
    latitude: 51.5,
    longitude: -0.1,
    symbol: '/>',
    comment: 'rolling',
    course: 90,
    speed: 30,
    altitude: 120,
    path: 'WIDE1-1',
    raw: 'M0ABC-9>APRS:!x',
    last_heard_ms: new Date(2026, 6, 25, 21, 33, 47).getTime(),
    ...overrides,
  }
}

describe('LandFilter', () => {
  let store: ReturnType<typeof useLandStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    // The store polls on demand elsewhere; this pane only reads the snapshot.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }),
    )
    store = useLandStore()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('station list', () => {
    it('lists every heard station by callsign, symbol and heard time', () => {
      store.aprsStations = [station(), station({ callsign: 'MB7UMS', symbol: '/#' })]
      const wrapper = mount(LandFilter)
      const rows = wrapper.findAll('.bfp-result-item')
      expect(rows).toHaveLength(2)
      expect(rows[0]!.find('.bfp-result-primary').text()).toBe('M0ABC-9')
      expect(rows[0]!.find('.bfp-result-secondary').text()).toBe('Car · 21:33:47')
      expect(rows[1]!.find('.bfp-result-secondary').text()).toContain('Digipeater')
    })

    it('tells the operator when nothing has been heard', () => {
      expect(mount(LandFilter).find('.bfp-no-results').text()).toBe('No APRS stations heard')
    })

    it('distinguishes "nothing heard" from "nothing matches the search"', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      store.setSearchQuery('ZZZZ')
      await flushPromises()
      expect(wrapper.find('.bfp-no-results').text()).toBe('No stations match')
    })

    it('drops a station from the list as soon as it ages out of the snapshot', async () => {
      store.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const wrapper = mount(LandFilter)
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(2)

      // The retention window expires the station server-side; the next poll
      // simply omits it, and the list must follow the map immediately.
      store.aprsStations = [station({ callsign: 'MB7UMS' })]
      await flushPromises()
      const rows = wrapper.findAll('.bfp-result-item')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.find('.bfp-result-primary').text()).toBe('MB7UMS')
    })

    it('adds a newly heard station to the list', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      store.aprsStations = [station(), station({ callsign: 'NEW-1' })]
      await flushPromises()
      expect(wrapper.text()).toContain('NEW-1')
    })
  })

  describe('parity with the map', () => {
    it('empties the list when the APRS layer is hidden', async () => {
      store.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const wrapper = mount(LandFilter)
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(2)

      // Hiding the layer clears the map, so the list must not keep listing
      // stations that are no longer plotted.
      store.setAprsLayerVisible(false)
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(0)
      expect(wrapper.find('.bfp-no-results').text()).toBe('APRS layer hidden')
    })

    it('restores the list when the layer is shown again', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      store.setAprsLayerVisible(false)
      await flushPromises()
      store.setAprsLayerVisible(true)
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(1)
    })

    it('reports the layer as hidden even while a search is active', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      store.setSearchQuery('M0ABC')
      store.setAprsLayerVisible(false)
      await flushPromises()
      expect(wrapper.find('.bfp-no-results').text()).toBe('APRS layer hidden')
    })
  })

  describe('search', () => {
    beforeEach(() => {
      store.aprsStations = [
        station({ callsign: 'M0ABC-9', symbol: '/>', comment: 'rolling', path: 'WIDE1-1' }),
        station({ callsign: 'MB7UMS', symbol: '/#', comment: 'tyneside', path: 'WIDE2-2' }),
      ]
    })

    it('matches on callsign', async () => {
      const wrapper = mount(LandFilter)
      store.setSearchQuery('mb7')
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(1)
      expect(wrapper.text()).toContain('MB7UMS')
    })

    it('matches on the decoded symbol type', async () => {
      const wrapper = mount(LandFilter)
      store.setSearchQuery('digipeater')
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(1)
      expect(wrapper.text()).toContain('MB7UMS')
    })

    it('matches on comment and on path', async () => {
      const wrapper = mount(LandFilter)
      store.setSearchQuery('rolling')
      await flushPromises()
      expect(wrapper.text()).toContain('M0ABC-9')

      store.setSearchQuery('WIDE2')
      await flushPromises()
      expect(wrapper.text()).toContain('MB7UMS')
      expect(wrapper.text()).not.toContain('M0ABC-9')
    })

    it('ignores case and surrounding whitespace', async () => {
      const wrapper = mount(LandFilter)
      store.setSearchQuery('  MB7ums  ')
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(1)
    })

    it('shows every station for an empty query', async () => {
      const wrapper = mount(LandFilter)
      store.setSearchQuery('')
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(2)
    })

    it('tolerates stations with no comment or path', async () => {
      store.aprsStations = [station({ comment: null, path: null })]
      const wrapper = mount(LandFilter)
      store.setSearchQuery('M0ABC')
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(1)
    })

    it('writes edits back to the store so the query survives navigation', async () => {
      const wrapper = mount(LandFilter)
      await wrapper.find('input').setValue('MB7')
      expect(store.searchQuery).toBe('MB7')
    })
  })

  describe('expanded station', () => {
    it('shows every APRS field, including the raw frame', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()

      const text = wrapper.find('.bfp-accordion-body').text()
      expect(text).toContain('M0ABC-9')
      expect(text).toContain('21:33:47')
      expect(text).toContain('51.50000')
      expect(text).toContain('-0.10000')
      expect(text).toContain('120 M')
      expect(text).toContain('90°')
      expect(text).toContain('30 KM/H')
      expect(text).toContain('WIDE1-1')
      expect(text).toContain('rolling')

      // The raw frame is reference material, so it starts collapsed.
      expect(wrapper.find('.land-filter-raw-body').exists()).toBe(false)
      await wrapper.find('.land-filter-raw-toggle').trigger('click')
      expect(wrapper.find('.land-filter-raw-body').text()).toBe('M0ABC-9>APRS:!x')
    })

    it('keeps the raw frame collapsed until asked for, and labels the control', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()

      const toggle = wrapper.find('.land-filter-raw-toggle')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(toggle.text()).toContain('RAW')

      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      // The control names the region it opens, for assistive tech.
      expect(toggle.attributes('aria-controls')).toBe(
        wrapper.find('.land-filter-raw-body').attributes('id'),
      )

      await toggle.trigger('click')
      expect(wrapper.find('.land-filter-raw-body').exists()).toBe(false)
    })

    it('points the raw chevron the same way as the row chevron', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()

      // Right when closed, down when open — the convention the row above uses.
      const chevron = wrapper.find('.land-filter-raw-chevron')
      expect(chevron.classes()).not.toContain('open')
      await wrapper.find('.land-filter-raw-toggle').trigger('click')
      expect(wrapper.find('.land-filter-raw-chevron').classes()).toContain('open')
    })

    it('does not collapse the station row when the raw frame is toggled', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()
      await wrapper.find('.land-filter-raw-toggle').trigger('click')
      // The toggle sits inside the row, whose own click collapses it.
      expect(store.searchExpandedCallsign).toBe('M0ABC-9')
      expect(wrapper.find('.bfp-accordion-body').exists()).toBe(true)
    })

    it('closes the raw frame again when a different station is opened', async () => {
      store.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()
      await wrapper.find('.land-filter-raw-toggle').trigger('click')
      expect(wrapper.find('.land-filter-raw-body').exists()).toBe(true)

      store.setSearchExpandedCallsign('MB7UMS')
      await flushPromises()
      expect(wrapper.find('.land-filter-raw-body').exists()).toBe(false)
    })

    it('shows the symbol as its icon, still named for assistive tech', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()

      // The same glyph the map draws, rather than the word for it — but the
      // type is still announced, so nothing is lost by dropping the text.
      const symbol = wrapper.find('.bfp-accordion-body .aprs-symbol')
      expect(symbol.exists()).toBe(true)
      expect(symbol.attributes('aria-label')).toBe('Car')
      expect(wrapper.find('.bfp-accordion-body').text()).not.toContain('Car')
    })

    it('shows all fields even when they are hidden on the map label', async () => {
      // The accordion is the full record; the label fields are display-only.
      store.setAprsLabelFields({
        time: false,
        callsign: false,
        symbol: false,
        symbolText: false,
        latitude: false,
        longitude: false,
        course: false,
        speed: false,
        altitude: false,
        path: false,
        comment: false,
      })
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()
      const text = wrapper.find('.bfp-accordion-body').text()
      expect(text).toContain('30 KM/H')
      expect(text).toContain('WIDE1-1')
    })

    it('dashes the fields the packet did not carry', async () => {
      store.aprsStations = [
        station({
          course: null,
          speed: null,
          altitude: null,
          path: null,
          comment: null,
          raw: null,
        }),
      ]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()
      const text = wrapper.find('.bfp-accordion-body').text()
      expect(text).not.toContain('KM/H')
      expect(text.match(/—/g)!.length).toBeGreaterThanOrEqual(5)
      // …including the raw frame, once its disclosure is opened.
      await wrapper.find('.land-filter-raw-toggle').trigger('click')
      expect(wrapper.find('.land-filter-raw-body').text()).toBe('—')
    })

    it('records the expansion on the store so it survives a remount', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      expect(store.searchExpandedCallsign).toBe('M0ABC-9')

      const remounted = mount(LandFilter)
      await flushPromises()
      expect(remounted.find('.bfp-accordion-body').exists()).toBe(true)
    })

    it('collapses when the expanded station ages out', async () => {
      store.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      expect(store.searchExpandedCallsign).toBe('M0ABC-9')

      store.aprsStations = [station({ callsign: 'MB7UMS' })]
      await flushPromises()
      expect(store.searchExpandedCallsign).toBe('')
      expect(wrapper.find('.bfp-accordion-body').exists()).toBe(false)
    })

    it('keeps the expansion while the station is still being heard', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      store.aprsStations = [station({ latitude: 51.6 })]
      await flushPromises()
      expect(store.searchExpandedCallsign).toBe('M0ABC-9')
      expect(wrapper.find('.bfp-accordion-body').exists()).toBe(true)
    })

    it('leaves an already-empty expansion alone when the list changes', async () => {
      store.aprsStations = [station()]
      mount(LandFilter)
      store.aprsStations = []
      await flushPromises()
      expect(store.searchExpandedCallsign).toBe('')
    })
  })

  describe('map hand-off', () => {
    it('expands the station clicked on the map', async () => {
      store.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const wrapper = mount(LandFilter)
      document.dispatchEvent(
        new CustomEvent('aprs-station-selected', { detail: { callsign: 'MB7UMS' } }),
      )
      await flushPromises()
      expect(store.searchExpandedCallsign).toBe('MB7UMS')
      expect(wrapper.find('#land-filter-row-MB7UMS').classes()).toContain('bfp-expanded')
    })

    it('stops listening once the pane is unmounted', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      wrapper.unmount()
      document.dispatchEvent(
        new CustomEvent('aprs-station-selected', { detail: { callsign: 'M0ABC-9' } }),
      )
      await flushPromises()
      expect(store.searchExpandedCallsign).toBe('')
    })
  })

  it('uses the app accent, matching the Air and Space filter panes', () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    expect(wrapper.find('.bfp-results').attributes('style')).toContain(
      '--bfp-accent: var(--color-accent)',
    )
  })

  describe('accessibility', () => {
    it('has no violations listing stations', async () => {
      // `region` is disabled: the pane is teleported into the sidebar's
      // landmark, which an isolated mount cannot provide.
      store.aprsStations = [station(), station({ callsign: 'MB7UMS' })]
      const wrapper = mount(LandFilter)
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })

    it('has no violations with a station expanded', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      await wrapper.find('.bfp-result-item').trigger('click')
      await flushPromises()
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })

    it('names the search field for screen readers', () => {
      expect(mount(LandFilter).find('input').attributes('aria-label')).toBe(
        'Filter APRS stations by callsign, symbol, path or comment',
      )
    })
  })
})

describe('LandFilter — traffic cameras', () => {
  let store: ReturnType<typeof useLandStore>
  let feedsStore: ReturnType<typeof useLandFeedsStore>

  function feed(overrides: Partial<FeedWithStatus>): FeedWithStatus {
    return {
      id: 'durham-cc',
      name: 'Durham County Council',
      category: 'traffic-cameras',
      provider: 'durham',
      url: 'https://example.test',
      enabled: true,
      refreshSeconds: 60,
      datasets: [],
      bbox: null,
      location: null,
      auth: { type: 'none' },
      status: {
        lastFetchAt: null,
        lastError: null,
        featureCount: 0,
        credentialConfigured: false,
        running: true,
      },
      ...overrides,
    }
  }

  function camera(
    id: string,
    sourceId: string,
    overrides: Partial<CameraFeature['properties']> = {},
    coordinates: [number, number] = [-1.58, 54.78],
  ): CameraFeature {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates },
      properties: {
        kind: 'camera',
        id: `${sourceId}:${id}`,
        name: id,
        description: '',
        view: null,
        updatedAt: null,
        state: 'live',
        imageUrl: null,
        clipUrl: null,
        externalUrl: null,
        sourceId,
        sourceName: sourceId === 'durham-cc' ? 'Durham County Council' : 'TfL JamCams',
        attribution: sourceId === 'durham-cc' ? 'OGL v3.0' : 'Powered by TfL Open Data',
        ...overrides,
      },
    }
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }),
    )
    store = useLandStore()
    feedsStore = useLandFeedsStore()
    store.setTrafficCamerasLayerVisible(true)
    feedsStore.feeds = [
      feed({ id: 'durham-cc' }),
      feed({ id: 'tfl-jamcams', name: 'TfL JamCams', refreshSeconds: 300 }),
    ]
    feedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [
          camera('Framwellgate Peth', 'durham-cc', { view: 'View towards the City Centre' }),
          camera('Milburngate', 'durham-cc', { state: 'offline' }),
        ],
      },
      'tfl-jamcams': {
        type: 'FeatureCollection',
        features: [camera('A406 Billet Upass E', 'tfl-jamcams', { view: 'West' }, [-0.01, 51.6])],
      },
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lists cameras after the stations, grouped per source with count and licence line', () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    const headings = wrapper.findAll('.bfp-group-heading')
    expect(headings.map((heading) => heading.find('.bfp-group-heading-label').text())).toEqual([
      'APRS STATIONS',
      'Durham County Council',
      'TfL JamCams',
    ])
    expect(headings[1]!.find('.bfp-group-heading-meta').text()).toBe('2')
    expect(headings[1]!.find('.bfp-group-heading-note').text()).toBe('OGL v3.0')
    const rows = wrapper.findAll('.bfp-result-item')
    expect(rows).toHaveLength(4)
    expect(rows[1]!.find('.bfp-result-primary').text()).toBe('Framwellgate Peth')
    expect(rows[1]!.find('.bfp-result-secondary').text()).toBe(
      'View towards the City Centre · LIVE',
    )
    expect(rows[2]!.find('.bfp-result-secondary').text()).toBe('OFFLINE')
    expect(rows[1]!.attributes('id')).toBe('land-filter-row-cam-durham-cc-Framwellgate-Peth')
    expect(wrapper.find('input').attributes('placeholder')).toBe(
      'CALLSIGN · CAMERA · ROAD · SOURCE',
    )
  })

  it('reports "x of y in view" when the viewport hides part of a source', () => {
    feedsStore.setViewportBounds({ west: -2, east: -1, south: 54, north: 55 })
    const wrapper = mount(LandFilter)
    const headings = wrapper.findAll('.bfp-group-heading')
    expect(headings[0]!.find('.bfp-group-heading-meta').text()).toBe('2')
    // London is out of view: its heading is not rendered because it has no rows,
    // but the durham heading counts against the full total.
    expect(headings).toHaveLength(1)
  })

  it('omits the licence line for a source whose cameras carry no attribution', () => {
    feedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [camera('Framwellgate Peth', 'durham-cc', { attribution: '' })],
      },
    }
    const wrapper = mount(LandFilter)
    expect(wrapper.find('.bfp-group-heading-note').exists()).toBe(false)
  })

  it('gives stations no group heading while no camera source is enabled', () => {
    feedsStore.feeds = []
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    expect(wrapper.findAll('.bfp-group-heading')).toHaveLength(0)
    expect(wrapper.find('input').attributes('placeholder')).toBe(
      'CALLSIGN · SYMBOL · PATH · COMMENT',
    )
  })

  it('matches cameras on name, view, source and description', async () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    for (const [needle, expected] of [
      ['billet', ['A406 Billet Upass E']],
      ['city centre', ['Framwellgate Peth']],
      ['tfl', ['A406 Billet Upass E']],
      ['zzz', []],
    ] as Array<[string, string[]]>) {
      store.setSearchQuery(needle)
      await flushPromises()
      const cameraRows = wrapper
        .findAll('.bfp-result-item')
        .map((row) => row.find('.bfp-result-primary').text())
        .filter((name) => name !== 'M0ABC-9')
      expect(cameraRows).toEqual(expected)
    }
    expect(wrapper.find('.bfp-no-results').text()).toBe('No stations or cameras match')
  })

  it('tells the operator when nothing is in view with the APRS layer off', () => {
    store.setAprsLayerVisible(false)
    feedsStore.setViewportBounds({ west: 10, east: 11, south: 10, north: 11 })
    expect(mount(LandFilter).find('.bfp-no-results').text()).toBe('No traffic cameras in view')
  })

  it("expands a camera row into LandCameraDetails with the feed's cadence, and SHOW ON MAP flies there", async () => {
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-cam-tfl-jamcams-A406-Billet-Upass-E').trigger('click')
    const details = wrapper.findComponent(LandCameraDetails)
    expect(details.exists()).toBe(true)
    expect(details.props('refreshSeconds')).toBe(300)
    expect(store.searchExpandedCallsign).toBe('tfl-jamcams:A406 Billet Upass E')
    const dispatched = vi.spyOn(document, 'dispatchEvent')
    details.vm.$emit('locate', 'tfl-jamcams:A406 Billet Upass E')
    const event = dispatched.mock.calls[0]![0] as CustomEvent<{ featureId: string }>
    expect(event.type).toBe('land-camera-selected')
    expect(event.detail.featureId).toBe('tfl-jamcams:A406 Billet Upass E')
  })

  it('keeps a camera row open across an APRS poll, but collapses it when the camera leaves the feed', async () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-cam-durham-cc-Milburngate').trigger('click')
    expect(store.searchExpandedCallsign).toBe('durham-cc:Milburngate')
    store.aprsStations = [station({ callsign: 'MB7UMS' })]
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('durham-cc:Milburngate')
    feedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [camera('Framwellgate Peth', 'durham-cc')],
      },
    }
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('')
  })

  it('leaves an expanded station (or nothing) alone when the camera sources change', async () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    feedsStore.setViewportBounds({ west: -2, east: -1, south: 54, north: 55 })
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('')
    await wrapper.find('#land-filter-row-M0ABC-9').trigger('click')
    feedsStore.featuresByFeed = {}
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('M0ABC-9')
  })

  it('still collapses an expanded station that ages out while cameras are listed', async () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-M0ABC-9').trigger('click')
    expect(store.searchExpandedCallsign).toBe('M0ABC-9')
    store.aprsStations = []
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('')
  })

  it('has no accessibility violations with grouped camera rows, one expanded', async () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter, { attachTo: document.body })
    await wrapper.find('#land-filter-row-cam-durham-cc-Framwellgate-Peth').trigger('click')
    expect(
      await axe(wrapper.element.parentElement!, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
