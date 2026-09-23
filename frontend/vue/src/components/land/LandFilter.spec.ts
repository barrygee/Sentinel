import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandFilter from './LandFilter.vue'
import { useLandStore, type AprsStation } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import { useRepeatersStore } from '@/stores/repeaters'
import { useSdrStore, type SdrStoredFrequency } from '@/stores/sdr'
import { useNotificationsStore } from '@/stores/notifications'
import LandCameraDetails from './LandCameraDetails.vue'
import LandRepeaterDetails from './LandRepeaterDetails.vue'
import LandRepeaterFilters from './LandRepeaterFilters.vue'
import { repeaterSearchKey } from '@/constants/repeaters'
import type { CameraFeature, FeedWithStatus } from '@/types/landFeeds'
import type { RepeaterChannel, RepeaterStation } from '@/types/repeaters'

/**
 * Mount the pane and unfold every group heading — the Land pane starts its
 * camera / station groups collapsed, and most assertions here are about the
 * rows inside them.
 */
async function mountWithGroupsOpen(options: { attachTo?: Element } = {}) {
  const wrapper = mount(LandFilter, options)
  for (const heading of wrapper.findAll('.bfp-group-heading')) await heading.trigger('click')
  return wrapper
}

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
    // Every Land layer now starts OFF (the store lights exactly one from the
    // persisted `land.defaultLayers`), so the APRS cases switch it on
    // explicitly — the pane lists only what the map is drawing.
    store.setAprsLayerVisible(true)
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
      // stations that are no longer plotted. With no other layer on, the pane
      // says how to get one back rather than reporting an empty data set.
      store.setAprsLayerVisible(false)
      await flushPromises()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(0)
      expect(wrapper.find('.bfp-no-results').text()).toBe('No layers on — use the tabs to add one')
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

    it('reports no layers on even while a search is active', async () => {
      store.aprsStations = [station()]
      const wrapper = mount(LandFilter)
      store.setSearchQuery('M0ABC')
      store.setAprsLayerVisible(false)
      await flushPromises()
      expect(wrapper.find('.bfp-no-results').text()).toBe('No layers on — use the tabs to add one')
    })

    it('names the search field generically when no layer is on', async () => {
      const wrapper = mount(LandFilter)
      store.setAprsLayerVisible(false)
      await flushPromises()
      expect(wrapper.find('input').attributes('aria-label')).toBe(
        'Filter Land map items by name or callsign',
      )
      expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
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
      // Every APRS value renders inside the wrapper that uppercases and
      // resizes it; the camera and repeater accordions are outside it.
      expect(wrapper.find('.bfp-accordion-body .land-filter-station').exists()).toBe(true)

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
      '--bfp-accent: var(--accent-text)',
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

// ── traffic cameras ────────────────────────────────────────────────────────

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

describe('LandFilter — traffic cameras', () => {
  let store: ReturnType<typeof useLandStore>
  let feedsStore: ReturnType<typeof useLandFeedsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }),
    )
    store = useLandStore()
    // Both flags are set directly: the map draws one layer at a time, but the
    // pane is built to list several sets at once (group headings, the joined
    // search label), so those branches need both on.
    store.setAprsLayerVisible(true)
    store.setTrafficCamerasLayerVisible(true)
    feedsStore = useLandFeedsStore()
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

  it('lists cameras after the stations, grouped per source under a plain heading', async () => {
    store.aprsStations = [station()]
    const wrapper = await mountWithGroupsOpen()
    const headings = wrapper.findAll('.bfp-group-heading')
    expect(headings.map((heading) => heading.find('.bfp-group-heading-label').text())).toEqual([
      'APRS STATIONS',
      'Durham County Council',
      'TfL JamCams',
    ])
    // The in-view count and licence line were deliberately dropped so each
    // source folds into one clean row.
    expect(headings[1]!.find('.bfp-group-heading-meta').exists()).toBe(false)
    expect(headings[1]!.find('.bfp-group-heading-note').exists()).toBe(false)
    const rows = wrapper.findAll('.bfp-result-item')
    expect(rows).toHaveLength(4)
    expect(rows[1]!.find('.bfp-result-primary').text()).toBe('Framwellgate Peth')
    expect(rows[1]!.find('.bfp-result-secondary').text()).toBe(
      'View towards the City Centre · LIVE',
    )
    expect(rows[2]!.find('.bfp-result-secondary').text()).toBe('OFFLINE')
    expect(rows[1]!.attributes('id')).toBe('land-filter-row-cam-durham-cc-Framwellgate-Peth')
    expect(wrapper.find('input').attributes('placeholder')).toBe('CALLSIGN · CAMERA · ROAD')
  })

  it('starts every group folded shut, with the headings alone showing', () => {
    store.aprsStations = [station()]
    const wrapper = mount(LandFilter)
    const headings = wrapper.findAll('.bfp-group-heading')
    expect(headings).toHaveLength(3)
    expect(headings.map((heading) => heading.attributes('aria-expanded'))).toEqual([
      'false',
      'false',
      'false',
    ])
    expect(wrapper.findAll('.bfp-result-item')).toHaveLength(0)
  })

  it('names each camera row for assistive tech with its source and state', async () => {
    const wrapper = await mountWithGroupsOpen()
    const option = wrapper.find('#land-filter-opt-cam-durham-cc-Milburngate')
    expect(option.attributes('aria-label')).toBe(
      'Traffic camera Milburngate, Durham County Council, offline',
    )
  })

  it('lists only the cameras inside the map viewport', async () => {
    feedsStore.setViewportBounds({ west: -2, east: -1, south: 54, north: 55 })
    const wrapper = await mountWithGroupsOpen()
    const headings = wrapper.findAll('.bfp-group-heading')
    // London is out of view, so the TfL heading is not rendered at all.
    expect(headings).toHaveLength(1)
    expect(headings[0]!.find('.bfp-group-heading-label').text()).toBe('Durham County Council')
    expect(wrapper.findAll('.bfp-result-item')).toHaveLength(2)
  })

  it('names the search field for both sets once cameras are listed', async () => {
    store.aprsStations = [station()]
    const wrapper = await mountWithGroupsOpen()
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      'Filter APRS stations and traffic cameras by name or callsign',
    )
    expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe(
      'APRS stations and traffic cameras',
    )
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
    expect(wrapper.find('.bfp-no-results').text()).toBe('Nothing matches')
  })

  it('tells the operator when nothing is in view with the APRS layer off', () => {
    store.setAprsLayerVisible(false)
    feedsStore.setViewportBounds({ west: 10, east: 11, south: 10, north: 11 })
    expect(mount(LandFilter).find('.bfp-no-results').text()).toBe(
      'Nothing in view — traffic cameras',
    )
  })

  it("expands a camera row into LandCameraDetails with the feed's cadence, and the preview flies there", async () => {
    const wrapper = await mountWithGroupsOpen()
    await wrapper.find('#land-filter-row-cam-tfl-jamcams-A406-Billet-Upass-E').trigger('click')
    const details = wrapper.findComponent(LandCameraDetails)
    expect(details.exists()).toBe(true)
    expect(details.props('refreshSeconds')).toBe(300)
    expect(store.searchExpandedCallsign).toBe('tfl-jamcams:A406 Billet Upass E')
    const dispatched = vi.spyOn(document, 'dispatchEvent')
    details.vm.$emit('preview', 'tfl-jamcams:A406 Billet Upass E')
    const event = dispatched.mock.calls[0]![0] as CustomEvent<{ featureId: string }>
    // The old single `land-camera-selected` event was split in two; the pane's
    // preview still opens the popup on the map (CAMERA_PREVIEW_EVENT).
    expect(event.type).toBe('land-preview-camera')
    expect(event.detail.featureId).toBe('tfl-jamcams:A406 Billet Upass E')
  })

  it("falls back to LandCameraDetails' own cadence when the feed is gone", async () => {
    const wrapper = await mountWithGroupsOpen()
    // The feed row has been removed from Settings but its snapshot is still in
    // the store, so no refreshSeconds can be resolved for the row.
    feedsStore.feeds = [feed({ id: 'durham-cc' })]
    await flushPromises()
    await wrapper.find('#land-filter-row-cam-durham-cc-Milburngate').trigger('click')
    expect(wrapper.findComponent(LandCameraDetails).props('refreshSeconds')).toBe(60)
  })

  it('keeps a camera row open across an APRS poll, but collapses it when the camera leaves the feed', async () => {
    store.aprsStations = [station()]
    const wrapper = await mountWithGroupsOpen()
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
    const wrapper = await mountWithGroupsOpen()
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
    const wrapper = await mountWithGroupsOpen()
    await wrapper.find('#land-filter-row-M0ABC-9').trigger('click')
    expect(store.searchExpandedCallsign).toBe('M0ABC-9')
    store.aprsStations = []
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('')
  })

  it('has no accessibility violations with grouped camera rows, one expanded', async () => {
    store.aprsStations = [station()]
    const wrapper = await mountWithGroupsOpen({ attachTo: document.body })
    await wrapper.find('#land-filter-row-cam-durham-cc-Framwellgate-Peth').trigger('click')
    expect(
      await axe(wrapper.element.parentElement!, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})

// ── UK repeater directory ──────────────────────────────────────────────────

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

function storedFrequency(frequencyHz: number): SdrStoredFrequency {
  return { id: 1, group_id: null, label: 'GB3NM 2M OUT', frequency_hz: frequencyHz, mode: 'NFM' }
}

describe('LandFilter — repeaters', () => {
  let store: ReturnType<typeof useLandStore>
  let repeatersStore: ReturnType<typeof useRepeatersStore>
  let sdrStore: ReturnType<typeof useSdrStore>
  let notificationsStore: ReturnType<typeof useNotificationsStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stations: [] }) }),
    )
    store = useLandStore()
    // The repeaters layer starts off like every other Land layer; switch it on
    // so the pane lists the directory the map is drawing.
    store.selectLayer('repeaters')
    repeatersStore = useRepeatersStore()
    repeatersStore.stations = [repeater()]
    sdrStore = useSdrStore()
    notificationsStore = useNotificationsStore()
    // The pane pulls the Frequency Manager list once so the bookmarks are
    // right from the first open; keep it off the network.
    vi.spyOn(sdrStore, 'loadFrequencies').mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lists every filtered repeater in view, with the filter chips above them', () => {
    const wrapper = mount(LandFilter)
    expect(wrapper.findComponent(LandRepeaterFilters).exists()).toBe(true)
    const rows = wrapper.findAll('.bfp-result-item')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.find('.bfp-result-primary').text()).toBe('GB3NM')
    expect(rows[0]!.find('.bfp-result-secondary').text()).toBe('NEWCASTLE · 2M · FM')
    expect(rows[0]!.attributes('id')).toBe('land-filter-row-rpt-GB3NM')
    expect(wrapper.find('#land-filter-opt-rpt-GB3NM').attributes('aria-label')).toBe(
      'Repeater GB3NM, NEWCASTLE, 2M, FM',
    )
    expect(wrapper.find('input').attributes('placeholder')).toBe('CALLSIGN · TOWN · BAND · MODE')
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      'Filter repeaters by name or callsign',
    )
  })

  it('marks an off-air site in the row and its accessible name, withheld location and all', () => {
    repeatersStore.stations = [
      repeater({
        callsign: 'GB3XX',
        location: null,
        channels: [channel({ status: 'NOT OPERATIONAL', band: '70CM', modes: ['M', 'A'] })],
      }),
    ]
    const wrapper = mount(LandFilter)
    expect(wrapper.find('.bfp-result-secondary').text()).toBe('70CM · FM · DMR · OFF AIR')
    expect(wrapper.find('#land-filter-opt-rpt-GB3XX').attributes('aria-label')).toBe(
      'Repeater GB3XX, location withheld, 70CM, FM · DMR, not operational',
    )
  })

  it('hides the chips and the list when the layer is off', async () => {
    const wrapper = mount(LandFilter)
    store.setRepeatersLayerVisible(false)
    await flushPromises()
    expect(wrapper.findComponent(LandRepeaterFilters).exists()).toBe(false)
    expect(wrapper.findAll('.bfp-result-item')).toHaveLength(0)
    expect(wrapper.find('.bfp-no-results').text()).toBe('No layers on — use the tabs to add one')
  })

  it('shows no repeater list until the directory has loaded', () => {
    repeatersStore.stations = []
    const wrapper = mount(LandFilter)
    expect(wrapper.findComponent(LandRepeaterFilters).exists()).toBe(false)
    expect(wrapper.find('.bfp-no-results').text()).toBe('No layers on — use the tabs to add one')
  })

  it('matches a repeater on callsign, town, locator, band and mode', async () => {
    repeatersStore.stations = [
      repeater(),
      repeater({
        callsign: 'GB3DU',
        location: 'DURHAM',
        locator: 'IO94GS',
        channels: [channel({ band: '70CM', modes: ['M'] })],
      }),
    ]
    const wrapper = mount(LandFilter)
    for (const [needle, expected] of [
      ['gb3du', ['GB3DU']],
      ['newcastle', ['GB3NM']],
      ['io94gs', ['GB3DU']],
      ['70cm', ['GB3DU']],
      ['dmr', ['GB3DU']],
      ['zzz', []],
    ] as Array<[string, string[]]>) {
      store.setSearchQuery(needle)
      await flushPromises()
      expect(
        wrapper.findAll('.bfp-result-item').map((row) => row.find('.bfp-result-primary').text()),
      ).toEqual(expected)
    }
    expect(wrapper.find('.bfp-no-results').text()).toBe('Nothing matches')
  })

  it('tolerates a site whose register entry withheld the town and locator', async () => {
    repeatersStore.stations = [repeater({ location: null, locator: null })]
    const wrapper = mount(LandFilter)
    store.setSearchQuery('gb3nm')
    await flushPromises()
    expect(wrapper.findAll('.bfp-result-item')).toHaveLength(1)
  })

  it('says nothing is in view when the viewport holds no repeater', () => {
    repeatersStore.setViewportBounds({ west: 10, east: 11, south: 10, north: 11 })
    expect(mount(LandFilter).find('.bfp-no-results').text()).toBe('Nothing in view — repeaters')
  })

  it('lists all three sets together, stations first, with a joined label', async () => {
    store.setAprsLayerVisible(true)
    store.setTrafficCamerasLayerVisible(true)
    store.aprsStations = [station()]
    const feedsStore = useLandFeedsStore()
    feedsStore.feeds = [feed({ id: 'durham-cc' })]
    feedsStore.featuresByFeed = {
      'durham-cc': {
        type: 'FeatureCollection',
        features: [camera('Framwellgate Peth', 'durham-cc')],
      },
    }
    const wrapper = await mountWithGroupsOpen()
    expect(
      wrapper.findAll('.bfp-result-item').map((row) => row.find('.bfp-result-primary').text()),
    ).toEqual(['M0ABC-9', 'Framwellgate Peth', 'GB3NM'])
    expect(wrapper.find('input').attributes('aria-label')).toBe(
      'Filter APRS stations, traffic cameras and repeaters by name or callsign',
    )
    expect(wrapper.find('input').attributes('placeholder')).toBe(
      'CALLSIGN · CAMERA · ROAD · TOWN · BAND · MODE',
    )
  })

  it('expands a repeater row into its details, keeping an APRS callsign clash apart', async () => {
    store.setAprsLayerVisible(true)
    // A keeper beaconing from the site: same callsign, different row key.
    store.aprsStations = [station({ callsign: 'GB3NM' })]
    const wrapper = await mountWithGroupsOpen()
    await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
    expect(store.searchExpandedCallsign).toBe(repeaterSearchKey('GB3NM'))
    const details = wrapper.findComponent(LandRepeaterDetails)
    expect(details.exists()).toBe(true)
    expect(details.props('station').callsign).toBe('GB3NM')
    // The APRS row with the same callsign stays shut.
    expect(wrapper.find('#land-filter-row-GB3NM').classes()).not.toContain('bfp-expanded')
  })

  it('flies the map to a site when its position is clicked', async () => {
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
    const dispatched = vi.spyOn(document, 'dispatchEvent')
    await wrapper.find('.land-repeater-locate').trigger('click')
    const event = dispatched.mock.calls[0]![0] as CustomEvent<{ callsign: string }>
    expect(event.type).toBe('land-locate-repeater')
    expect(event.detail.callsign).toBe('GB3NM')
  })

  it('collapses an expanded repeater the filters have removed from the map', async () => {
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
    expect(store.searchExpandedCallsign).toBe(repeaterSearchKey('GB3NM'))

    // A band the site does not carry: the map drops the site, so the pane must
    // not keep its row open.
    repeatersStore.filters = { bands: ['23CM'], modes: [], status: 'all' }
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('')
  })

  it('collapses an expanded repeater when the layer itself goes off', async () => {
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
    store.setRepeatersLayerVisible(false)
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('')
  })

  it('keeps an expanded repeater open while it still passes the filters', async () => {
    repeatersStore.stations = [repeater(), repeater({ callsign: 'GB3DU' })]
    const wrapper = mount(LandFilter)
    await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
    repeatersStore.filters = { bands: ['2M'], modes: [], status: 'all' }
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe(repeaterSearchKey('GB3NM'))
  })

  it('leaves a non-repeater expansion alone when the repeater filters change', async () => {
    store.setAprsLayerVisible(true)
    store.aprsStations = [station()]
    const wrapper = await mountWithGroupsOpen()
    await wrapper.find('#land-filter-row-M0ABC-9').trigger('click')
    repeatersStore.filters = { bands: ['23CM'], modes: [], status: 'all' }
    await flushPromises()
    expect(store.searchExpandedCallsign).toBe('M0ABC-9')
  })

  describe('tuning the SDR', () => {
    it('tunes the output frequency and notifies, switching digital decode off for FM', async () => {
      sdrStore.connected = true
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
      const tuned = vi.fn()
      document.addEventListener('sentinel:sdr-tune-external', tuned)

      await wrapper.find('[title="Tune to 145.6500 NFM"]').trigger('click')

      const event = tuned.mock.calls[0]![0] as CustomEvent<{
        hz: number
        mode: string
        satName: string
        digital: boolean
      }>
      expect(event.detail).toEqual({
        hz: 145_650_000,
        mode: 'NFM',
        satName: 'GB3NM 2M output',
        digital: false,
      })
      expect(notificationsStore.items[0]).toMatchObject({
        title: 'GB3NM 2M OUTPUT',
        detail: 'Tuned 145.6500 MHz NFM',
      })
      document.removeEventListener('sentinel:sdr-tune-external', tuned)
    })

    it('tunes the input frequency and switches digital decode on for a DMR channel', async () => {
      sdrStore.connected = true
      repeatersStore.stations = [repeater({ channels: [channel({ modes: ['M'] })] })]
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
      const tuned = vi.fn()
      document.addEventListener('sentinel:sdr-tune-external', tuned)

      await wrapper.find('[title="Tune to 145.0500 NFM"]').trigger('click')

      const event = tuned.mock.calls[0]![0] as CustomEvent<{
        hz: number
        satName: string
        digital: boolean
      }>
      expect(event.detail.hz).toBe(145_050_000)
      expect(event.detail.satName).toBe('GB3NM 2M input')
      expect(event.detail.digital).toBe(true)
      expect(notificationsStore.items[0]!.detail).toBe('Tuned 145.0500 MHz NFM · digital decode on')
      document.removeEventListener('sentinel:sdr-tune-external', tuned)
    })

    it('asks for an SDR instead of tuning when none is connected, and clears the hint once one is', async () => {
      sdrStore.connected = false
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
      const tuned = vi.fn()
      document.addEventListener('sentinel:sdr-tune-external', tuned)

      await wrapper.find('[title="Connect an SDR to tune"]').trigger('click')
      expect(tuned).not.toHaveBeenCalled()
      // Announced, not just styled — the hint is a live status region.
      expect(wrapper.find('[role="status"]').text()).toBe('Connect an SDR before tuning')
      expect(notificationsStore.items).toHaveLength(0)

      sdrStore.connected = true
      await flushPromises()
      await wrapper.find('[title="Tune to 145.6500 NFM"]').trigger('click')
      expect(tuned).toHaveBeenCalledOnce()
      await flushPromises()
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      document.removeEventListener('sentinel:sdr-tune-external', tuned)
    })
  })

  describe('saving a repeater frequency', () => {
    it('files the output under a REPEATERS group, with the site details as notes', async () => {
      const groupSpy = vi.spyOn(sdrStore, 'ensureFrequencyGroup').mockResolvedValue(7)
      const saveSpy = vi
        .spyOn(sdrStore, 'saveFrequency')
        .mockResolvedValue(storedFrequency(145_650_000))
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')

      await wrapper
        .find('[aria-label="Save 145.6500 NFM to the frequency manager"]')
        .trigger('click')
      await flushPromises()

      expect(groupSpy).toHaveBeenCalledWith('Repeaters')
      expect(saveSpy).toHaveBeenCalledWith({
        label: 'GB3NM 2M OUT',
        frequency_hz: 145_650_000,
        mode: 'NFM',
        notes: 'NEWCASTLE · FM · Access 118.8 Hz · ukrepeater.net (RSGB ETCC)',
        group_ids: [7],
      })
      expect(notificationsStore.items[0]).toMatchObject({
        title: 'GB3NM 2M OUT',
        detail: 'Saved 145.6500 MHz NFM to the frequency manager',
      })
    })

    it('omits the access note (and the town) when the register carries neither', async () => {
      repeatersStore.stations = [
        repeater({
          location: null,
          channels: [channel({ ctcssHz: null, dmrColourCode: null })],
        }),
      ]
      vi.spyOn(sdrStore, 'ensureFrequencyGroup').mockResolvedValue(7)
      const saveSpy = vi
        .spyOn(sdrStore, 'saveFrequency')
        .mockResolvedValue(storedFrequency(145_050_000))
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')

      await wrapper
        .find('[aria-label="Save 145.0500 NFM to the frequency manager"]')
        .trigger('click')
      await flushPromises()

      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          label: 'GB3NM 2M IN',
          notes: 'FM · ukrepeater.net (RSGB ETCC)',
        }),
      )
    })

    it('says so rather than failing silently when the save cannot be filed', async () => {
      vi.spyOn(sdrStore, 'ensureFrequencyGroup').mockRejectedValue(new Error('offline'))
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')

      await wrapper
        .find('[aria-label="Save 145.6500 NFM to the frequency manager"]')
        .trigger('click')
      await flushPromises()

      expect(notificationsStore.items[0]).toMatchObject({
        title: 'GB3NM 2M OUT',
        detail: 'Could not save the frequency — is the backend reachable?',
      })
    })

    it('shows a stored frequency as saved and removes it again on click', async () => {
      sdrStore.frequencies = [storedFrequency(145_650_000)]
      const removeSpy = vi.spyOn(sdrStore, 'removeStoredFrequency').mockResolvedValue(undefined)
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')

      const bookmark = wrapper.find('[aria-label="Remove 145.6500 NFM from the frequency manager"]')
      expect(bookmark.attributes('aria-pressed')).toBe('true')
      // The input of the same channel is not stored, so its bookmark is empty.
      expect(
        wrapper.find('[aria-label="Save 145.0500 NFM to the frequency manager"]').exists(),
      ).toBe(true)

      await bookmark.trigger('click')
      await flushPromises()
      expect(removeSpy).toHaveBeenCalledWith(145_650_000)
      expect(notificationsStore.items[0]).toMatchObject({
        title: 'GB3NM 2M OUT',
        detail: 'Removed 145.6500 MHz from the frequency manager',
      })
    })

    it('says so when the removal cannot be completed', async () => {
      sdrStore.frequencies = [storedFrequency(145_050_000)]
      vi.spyOn(sdrStore, 'removeStoredFrequency').mockRejectedValue(new Error('offline'))
      const wrapper = mount(LandFilter)
      await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')

      await wrapper
        .find('[aria-label="Remove 145.0500 NFM from the frequency manager"]')
        .trigger('click')
      await flushPromises()

      expect(notificationsStore.items[0]).toMatchObject({
        title: 'GB3NM 2M IN',
        detail: 'Could not remove the frequency — is the backend reachable?',
      })
    })

    it('loads the frequency manager list once, and not at all when already loaded', () => {
      const loadSpy = vi.spyOn(sdrStore, 'loadFrequencies').mockResolvedValue(undefined)
      mount(LandFilter)
      expect(loadSpy).toHaveBeenCalledOnce()

      loadSpy.mockClear()
      sdrStore.frequencies = [storedFrequency(145_650_000)]
      mount(LandFilter)
      expect(loadSpy).not.toHaveBeenCalled()
    })
  })

  it('has no accessibility violations with a repeater expanded', async () => {
    sdrStore.connected = true
    const wrapper = mount(LandFilter, { attachTo: document.body })
    await wrapper.find('#land-filter-row-rpt-GB3NM').trigger('click')
    expect(
      await axe(wrapper.element.parentElement!, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
