import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'
import SeaFilter from './SeaFilter.vue'
import { useSeaStore, type SeaVessel } from '@/stores/sea'

function vessel(overrides: Partial<SeaVessel> = {}): SeaVessel {
  return {
    mmsi: '232012345',
    name: 'PRIDE OF KENT',
    imo: '9015266',
    callsign: 'GBPK',
    type: '60',
    typeLabel: 'PASSENGER',
    family: 'passenger',
    destination: 'DOVER',
    lat: 51.07,
    lon: 1.42,
    sog: 18.4,
    cog: 122,
    heading: 121,
    navStatus: 0,
    lastPositionMs: Date.UTC(2026, 8, 12, 8, 41, 3),
    lastPositionUtc: '2026-09-12T08:41:03Z',
    ...overrides,
  }
}

const TRAWLER = vessel({
  mmsi: '235099999',
  name: 'OCEAN HARVESTER',
  typeLabel: '',
  family: 'fishing',
  destination: '',
  callsign: '',
})

describe('SeaFilter', () => {
  let store: ReturnType<typeof useSeaStore>

  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    store = useSeaStore()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists every plotted vessel by name, type and MMSI', () => {
    store.vessels = [vessel(), TRAWLER]
    const wrapper = mount(SeaFilter)
    const rows = wrapper.findAll('.bfp-result-item')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.find('.bfp-result-primary').text()).toBe('PRIDE OF KENT')
    expect(rows[0]!.find('.bfp-result-secondary').text()).toBe('PASSENGER · 232012345')
    // A vessel without static data is labelled by its family instead.
    expect(rows[1]!.find('.bfp-result-secondary').text()).toBe('FISHING · 235099999')
    expect(rows[1]!.find('[role="option"]').attributes('aria-label')).toBe(
      'OCEAN HARVESTER, FISHING, MMSI 235099999',
    )
  })

  it('follows the FILTER rail category', async () => {
    store.vessels = [vessel(), TRAWLER]
    const wrapper = mount(SeaFilter)
    store.setSeaFilterCategory('fishing')
    await nextTick()
    expect(wrapper.findAll('.bfp-result-primary').map((row) => row.text())).toEqual([
      'OCEAN HARVESTER',
    ])
  })

  it('searches name, MMSI, type, destination and callsign', async () => {
    store.vessels = [vessel(), TRAWLER]
    const wrapper = mount(SeaFilter)
    for (const [needle, expected] of [
      ['dover', ['PRIDE OF KENT']],
      ['2350', ['OCEAN HARVESTER']],
      ['passenger', ['PRIDE OF KENT']],
      ['gbpk', ['PRIDE OF KENT']],
      ['harvest', ['OCEAN HARVESTER']],
      ['  ', ['PRIDE OF KENT', 'OCEAN HARVESTER']],
    ] as const) {
      store.setSearchQuery(needle)
      await nextTick()
      expect(wrapper.findAll('.bfp-result-primary').map((row) => row.text())).toEqual(expected)
    }
  })

  it('explains an empty list', async () => {
    const wrapper = mount(SeaFilter)
    expect(wrapper.find('.bfp-no-results').text()).toBe('No vessels in view')
    store.feed = { ...store.feed, status: 'missing-key', error: 'no key' }
    await nextTick()
    expect(wrapper.find('.bfp-no-results').text()).toBe('No vessels — no key')
    store.feed = { ...store.feed, status: 'down', error: null }
    await nextTick()
    expect(wrapper.find('.bfp-no-results').text()).toBe('No vessels received')
    store.vessels = [vessel()]
    store.setSearchQuery('zzz')
    await nextTick()
    expect(wrapper.find('.bfp-no-results').text()).toBe('No vessels match')
    store.setOverlay('vessels', false)
    await nextTick()
    expect(wrapper.find('.bfp-no-results').text()).toBe('Vessels layer hidden')
  })

  it('expands a row into the vessel details with a SHOW ON MAP action', async () => {
    store.vessels = [vessel()]
    const wrapper = mount(SeaFilter)
    await wrapper.find('.bfp-result-item').trigger('click')
    expect(store.searchExpandedMmsi).toBe('232012345')
    expect(wrapper.text()).toContain('DOVER')
    const button = wrapper.find('.sea-filter-actions button')
    expect(button.text()).toBe('SHOW ON MAP')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    expect(wrapper.emitted('locate')).toEqual([['232012345']])
    store.setSelectedMmsi('232012345')
    await nextTick()
    expect(wrapper.find('.sea-filter-actions button').text()).toBe('SELECTED')
  })

  it('opens the row for a vessel clicked on the map', async () => {
    store.vessels = [vessel()]
    const wrapper = mount(SeaFilter)
    document.dispatchEvent(new CustomEvent('sea-open-vessel', { detail: { mmsi: '232012345' } }))
    await nextTick()
    expect(store.searchExpandedMmsi).toBe('232012345')
    expect(wrapper.find('.bfp-expanded').exists()).toBe(true)
  })

  it('collapses the row when its vessel leaves the snapshot', async () => {
    store.vessels = [vessel()]
    store.setSearchExpandedMmsi('232012345')
    mount(SeaFilter)
    store.vessels = [TRAWLER]
    await nextTick()
    expect(store.searchExpandedMmsi).toBe('')
    // …but an expanded vessel still present stays open.
    store.setSearchExpandedMmsi('235099999')
    store.vessels = [TRAWLER, vessel()]
    await nextTick()
    expect(store.searchExpandedMmsi).toBe('235099999')
  })

  it('has no accessibility violations', async () => {
    store.vessels = [vessel(), TRAWLER]
    store.setSearchExpandedMmsi('232012345')
    const wrapper = mount(SeaFilter, { attachTo: document.body })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
