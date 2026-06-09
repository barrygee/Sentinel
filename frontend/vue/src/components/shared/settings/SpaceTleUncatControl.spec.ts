import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SpaceTleUncatControl from './SpaceTleUncatControl.vue'

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok, statusText: 'Bad', json: async () => payload })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const SATS = [
  { norad_id: '111', name: 'Alpha' },
  { norad_id: '222', name: 'Beta' },
]

describe('SpaceTleUncatControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    stubFetch({ satellites: SATS })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists uncategorised satellites with a count line', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    expect(wrapper.findAll('.tle-uncat-row')).toHaveLength(2)
    expect(wrapper.find('.tle-uncat-count').text()).toBe('2 satellites have no category')
  })

  it('reports when everything is already categorised', async () => {
    stubFetch({ satellites: [] })
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    expect(wrapper.find('.tle-uncat-count').text()).toBe('All satellites are categorised')
    expect(wrapper.find('.tle-action-btn').exists()).toBe(false)
  })

  it('shows a failure message when the load fails', async () => {
    stubFetch({}, false)
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    expect(wrapper.find('.tle-uncat-count').text()).toBe('Failed to load')
  })

  it('opens and closes a satellite category dropdown', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    const selected = wrapper.find('.tle-dropdown-selected')
    await selected.trigger('mousedown')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(true)
    await selected.trigger('mousedown')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(false)
  })

  it('closes the dropdown on blur', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(true)
    await wrapper.find('.tle-dropdown').trigger('blur')
    expect(wrapper.find('.tle-dropdown--open').exists()).toBe(false)
  })

  it('assigns a category and shows its label', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    // Pick the "Military" option for the first satellite.
    const items = wrapper.findAll('.tle-dropdown-item')
    const military = items.find((item) => item.text() === 'Military')!
    await military.trigger('mousedown')
    expect(wrapper.find('.tle-dropdown-selected-text').text()).toBe('Military')
  })

  it('does nothing when SAVE ALL is clicked with no assignments', async () => {
    const fetchMock = stubFetch({ satellites: SATS })
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    fetchMock.mockClear()
    await wrapper.find('.tle-action-btn').trigger('click')
    await flushPromises()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('PATCHes the assignments and broadcasts a refresh on SAVE ALL', async () => {
    const refresh = vi.fn()
    document.addEventListener('tle:refreshStatus', refresh)
    const fetchMock = stubFetch({ satellites: SATS })
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    const military = wrapper.findAll('.tle-dropdown-item').find((i) => i.text() === 'Military')!
    await military.trigger('mousedown')
    fetchMock.mockClear()
    await wrapper.find('.tle-action-btn').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/space/tle/category',
      expect.objectContaining({ method: 'PATCH' }),
    )
    expect(refresh).toHaveBeenCalled()
    document.removeEventListener('tle:refreshStatus', refresh)
  })

  it('surfaces a save error', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    const military = wrapper.findAll('.tle-dropdown-item').find((i) => i.text() === 'Military')!
    await military.trigger('mousedown')
    stubFetch({ error: 'boom' }, false)
    await wrapper.find('.tle-action-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-uncat-count').text()).toBe('Error saving: boom')
  })

  it('falls back to the status text when the save error has no message', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    await wrapper.find('.tle-dropdown-selected').trigger('mousedown')
    const military = wrapper.findAll('.tle-dropdown-item').find((i) => i.text() === 'Military')!
    await military.trigger('mousedown')
    stubFetch({}, false)
    await wrapper.find('.tle-action-btn').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-uncat-count').text()).toBe('Error saving: Bad')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SpaceTleUncatControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
