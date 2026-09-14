import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'
import SeaFilter from './SeaFilter.vue'
import { useSeaStore, type SeaVessel } from '@/stores/sea'
import { useSdrStore } from '@/stores/sdr'
import { useNotificationsStore } from '@/stores/notifications'
import { PORTS_DATA } from './controls/ports/portsData'

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
    // The vessel-list tests want vessels alone; the ports overlay (on by
    // default) has its own describe block below.
    store.setOverlay('ports', false)
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

  describe('ports overlay', () => {
    beforeEach(() => {
      store.vessels = [vessel(), TRAWLER]
      store.setOverlay('ports', true)
    })

    it('lists every port after the vessels while the overlay is on, with wider prompts', async () => {
      const wrapper = mount(SeaFilter)
      const rows = wrapper.findAll('.bfp-result-item')
      expect(rows).toHaveLength(2 + PORTS_DATA.features.length)
      expect(rows[0]!.find('.bfp-result-primary').text()).toBe('PRIDE OF KENT')
      expect(rows[2]!.find('.bfp-result-primary').text()).toBe('SOUTHAMPTON')
      expect(rows[2]!.find('.bfp-result-secondary').text()).toBe('GBSOU')
      expect(rows[2]!.find('[role="option"]').attributes('aria-label')).toBe(
        'Southampton, port, GBSOU',
      )
      expect(wrapper.find('input').attributes('placeholder')).toBe(
        'NAME · MMSI · TYPE · DESTINATION · PORT',
      )
      expect(wrapper.find('input').attributes('aria-label')).toBe(
        'Filter vessels and ports by name, MMSI, type, destination or LOCODE',
      )
      expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe(
        'Live vessels and ports',
      )
      // Off again: the ports leave, the vessels and the vessel prompts stay.
      store.setOverlay('ports', false)
      await nextTick()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(2)
      expect(wrapper.find('[role="listbox"]').attributes('aria-label')).toBe('Live vessels')
    })

    it('is independent of the vessel category', async () => {
      const wrapper = mount(SeaFilter)
      store.setSeaFilterCategory('fishing')
      await nextTick()
      const names = wrapper.findAll('.bfp-result-primary').map((row) => row.text())
      expect(names[0]).toBe('OCEAN HARVESTER')
      expect(names).toContain('DOVER')
      expect(names).not.toContain('PRIDE OF KENT')
    })

    it('searches name and LOCODE alongside the vessels, and explains an empty list', async () => {
      const wrapper = mount(SeaFilter)
      store.setSearchQuery('iedub')
      await nextTick()
      expect(wrapper.findAll('.bfp-result-primary').map((row) => row.text())).toEqual(['DUBLIN'])
      store.setSearchQuery('dover')
      await nextTick()
      // The vessel bound for Dover and the port of Dover both match.
      expect(wrapper.findAll('.bfp-result-primary').map((row) => row.text())).toEqual([
        'PRIDE OF KENT',
        'DOVER',
      ])
      store.setSearchQuery('atlantis')
      await nextTick()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(0)
      expect(wrapper.text()).toContain('No vessels or ports match')
      // Even with the vessels layer off, the ports are still there to search.
      store.setOverlay('vessels', false)
      store.setSearchQuery('')
      await nextTick()
      expect(wrapper.findAll('.bfp-result-item')).toHaveLength(PORTS_DATA.features.length)
    })

    it('opens one row at a time, vessel or port, remembering each separately', async () => {
      store.setSearchExpandedMmsi('232012345')
      const wrapper = mount(SeaFilter)
      expect(wrapper.find('.bfp-expanded').text()).toContain('PRIDE OF KENT')
      await wrapper.findAll('.bfp-result-item')[2]!.trigger('click')
      expect(store.searchExpandedPort).toBe('GBSOU')
      expect(store.searchExpandedMmsi).toBe('')
      expect(wrapper.find('.bfp-expanded').text()).toContain('VHF CHANNELS')
      expect(wrapper.find('.bfp-expanded').text()).toContain('VTS · CH 12')
      expect(wrapper.find('.sea-filter-actions').exists()).toBe(false)
      // Opening a vessel closes the port.
      await wrapper.findAll('.bfp-result-item')[0]!.trigger('click')
      expect(store.searchExpandedMmsi).toBe('232012345')
      expect(store.searchExpandedPort).toBe('')
      expect(wrapper.find('.bfp-expanded').text()).toContain('SHOW ON MAP')
    })

    it('falls back to the vessel row when the ports go off with a port open', async () => {
      store.setSearchExpandedPort('GBSOU')
      store.setSearchExpandedMmsi('')
      const wrapper = mount(SeaFilter)
      expect(wrapper.find('.bfp-expanded').text()).toContain('SOUTHAMPTON')
      store.setOverlay('ports', false)
      await nextTick()
      expect(wrapper.find('.bfp-expanded').exists()).toBe(false)
    })

    it('opens the row for a port clicked on the map', async () => {
      store.setSearchExpandedMmsi('232012345')
      const wrapper = mount(SeaFilter)
      document.dispatchEvent(new CustomEvent('sea-open-port', { detail: { locode: 'GBDVR' } }))
      await nextTick()
      expect(store.searchExpandedPort).toBe('GBDVR')
      expect(store.searchExpandedMmsi).toBe('')
      expect(wrapper.find('.bfp-expanded').text()).toContain('DOVER')
      // …and a vessel click closes the port row again.
      document.dispatchEvent(new CustomEvent('sea-open-vessel', { detail: { mmsi: '232012345' } }))
      await nextTick()
      expect(store.searchExpandedPort).toBe('')
      expect(wrapper.find('.bfp-expanded').text()).toContain('PRIDE OF KENT')
    })

    it('asks for an SDR before tuning, then tunes the channel and notifies', async () => {
      const sdrStore = useSdrStore()
      const notificationsStore = useNotificationsStore()
      const tuneListener = vi.fn()
      document.addEventListener('sentinel:sdr-tune-external', tuneListener)
      store.setSearchExpandedPort('GBSOU')
      const wrapper = mount(SeaFilter)
      const channelButton = wrapper.find('.sea-port-channel')
      await channelButton.trigger('click')
      expect(tuneListener).not.toHaveBeenCalled()
      expect(wrapper.find('.sea-port-notice').exists()).toBe(true)
      // Another port's row shows no notice: it is keyed by LOCODE.
      store.setSearchExpandedPort('GBDVR')
      await nextTick()
      expect(wrapper.find('.sea-port-notice').exists()).toBe(false)
      store.setSearchExpandedPort('GBSOU')
      await nextTick()
      expect(wrapper.find('.sea-port-notice').exists()).toBe(true)

      sdrStore.setConnected(true)
      await nextTick()
      await wrapper.find('.sea-port-channel').trigger('click')
      expect(wrapper.find('.sea-port-notice').exists()).toBe(false)
      expect(tuneListener).toHaveBeenCalledOnce()
      expect((tuneListener.mock.calls[0]![0] as CustomEvent).detail).toEqual({
        hz: 156_600_000,
        mode: 'NFM',
        satName: 'Southampton VTS',
      })
      expect(notificationsStore.items[0]).toMatchObject({
        type: 'system',
        title: 'GBSOU VTS',
        detail: 'Tuned CH 12 156.600 NFM',
      })
      document.removeEventListener('sentinel:sdr-tune-external', tuneListener)
    })

    it('has no accessibility violations', async () => {
      store.setSearchExpandedPort('GBSOU')
      const wrapper = mount(SeaFilter, { attachTo: document.body })
      expect(await axe(wrapper.element)).toHaveNoViolations()
      wrapper.unmount()
    })
  })
})
