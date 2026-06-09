import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SpaceTleSatListControl from './SpaceTleSatListControl.vue'

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    statusText: 'Bad',
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const SATS = [
  { norad_id: '25544', name: 'ISS (ZARYA)', category: 'space_station', updated_at: Date.now() },
  { norad_id: '40000', name: 'NoCat Sat', category: null, updated_at: 0 },
  { norad_id: '50000', name: 'Mystery', category: 'made_up_cat', updated_at: Date.now() },
]

describe('SpaceTleSatListControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({ satellites: SATS })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and lists every satellite with a count line', async () => {
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    expect(wrapper.findAll('.tle-satlist-row')).toHaveLength(3)
    expect(wrapper.find('.tle-satlist-count').text()).toBe('3 of 3 satellites')
    // The uncategorised satellite renders an em dash for category and age.
    expect(wrapper.text()).toContain('—')
    // An unknown category falls back to its raw key.
    expect(wrapper.text()).toContain('made_up_cat')
  })

  it('shows an error message when the request fails', async () => {
    stubFetch({}, false)
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    expect(wrapper.find('.tle-satlist-loading').text()).toContain('Failed to load')
  })

  it('filters by name', async () => {
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    await wrapper.find('input').setValue('zarya')
    expect(wrapper.findAll('.tle-satlist-row')).toHaveLength(1)
    expect(wrapper.find('.tle-satlist-count').text()).toBe('1 of 3 satellites')
  })

  it('filters by NORAD id', async () => {
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    await wrapper.find('input').setValue('40000')
    expect(wrapper.findAll('.tle-satlist-row')).toHaveLength(1)
  })

  it('filters by category label and can match nothing', async () => {
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    await wrapper.find('input').setValue('station')
    expect(wrapper.findAll('.tle-satlist-row')).toHaveLength(1)
    await wrapper.find('input').setValue('nonexistent-query')
    expect(wrapper.findAll('.tle-satlist-row')).toHaveLength(0)
    expect(wrapper.find('.tle-satlist-count').text()).toBe('0 of 3 satellites')
  })

  it('reloads when a tle:refreshStatus event fires', async () => {
    const fetchMock = stubFetch({ satellites: SATS })
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    fetchMock.mockClear()
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/space/tle/list')
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SpaceTleSatListControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false }, label: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
