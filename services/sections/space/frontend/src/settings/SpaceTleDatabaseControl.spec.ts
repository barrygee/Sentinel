import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SpaceTleDatabaseControl from './SpaceTleDatabaseControl.vue'

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok, statusText: 'Bad', json: async () => payload })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const STATUS = {
  total: 4,
  uncategorised: 1,
  by_source: { celestrak: 3, manual: 1 },
  by_category: {
    space_station: { count: 3, last_updated: Date.now() },
    amateur: { count: 1, last_updated: 0 },
    // A category key absent from SATELLITE_CATEGORY_FULL_LABELS exercises the
    // raw-key fallback in the table.
    made_up_cat: { count: 2, last_updated: Date.now() },
  },
}

describe('SpaceTleDatabaseControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
    stubFetch(STATUS)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the status summary and a sorted category table', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('4 satellites · celestrak (3) · manual (1)')
    const names = wrapper.findAll('.tle-cat-name').map((node) => node.text())
    // Sorted by category key: amateur before space_station. The em dash marks
    // the zero last_updated row.
    expect(names[0]).toBe('Amateur Radio')
    expect(wrapper.text()).toContain('—')
  })

  it('shows "none" when there are no sources', async () => {
    stubFetch({ ...STATUS, by_source: {} })
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('4 satellites · none')
  })

  it('shows a failure message when the status request fails', async () => {
    stubFetch({}, false)
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('Failed to load TLE status')
  })

  it('requires a second click to clear all TLE data', async () => {
    const refresh = vi.fn()
    document.addEventListener('tle:refreshStatus', refresh)
    const fetchMock = stubFetch(STATUS)
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const clearAllBtn = wrapper.find('.tle-action-btn--danger')
    await clearAllBtn.trigger('click')
    expect(clearAllBtn.text()).toContain('CONFIRM')
    fetchMock.mockClear()
    await clearAllBtn.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/space/tle?confirm=true', { method: 'DELETE' })
    expect(refresh).toHaveBeenCalled()
    document.removeEventListener('tle:refreshStatus', refresh)
  })

  it('resets the clear-all confirmation after the timeout', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const clearAllBtn = wrapper.find('.tle-action-btn--danger')
    await clearAllBtn.trigger('click')
    expect(clearAllBtn.text()).toContain('CONFIRM')
    vi.advanceTimersByTime(4000)
    await flushPromises()
    expect(clearAllBtn.text()).toBe('CLEAR ALL TLE DATA')
  })

  it('surfaces a clear-all error', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const clearAllBtn = wrapper.find('.tle-action-btn--danger')
    await clearAllBtn.trigger('click')
    stubFetch({ error: 'nope' }, false)
    await clearAllBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('Error: nope')
  })

  it('falls back to the status text for a clear-all error with no message', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const clearAllBtn = wrapper.find('.tle-action-btn--danger')
    await clearAllBtn.trigger('click')
    stubFetch({}, false)
    await clearAllBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('Error: Bad')
  })

  it('moves the pending confirmation when a different category is clicked', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const buttons = wrapper.findAll('.tle-cat-clear')
    await buttons[0]!.trigger('click')
    expect(wrapper.findAll('.tle-cat-clear')[0]!.text()).toBe('CONFIRM?')
    await buttons[1]!.trigger('click')
    expect(wrapper.findAll('.tle-cat-clear')[1]!.text()).toBe('CONFIRM?')
    expect(wrapper.findAll('.tle-cat-clear')[0]!.text()).toBe('CLEAR')
  })

  it('requires a second click to clear a single category', async () => {
    const fetchMock = stubFetch(STATUS)
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const catClear = wrapper.find('.tle-cat-clear')
    await catClear.trigger('click')
    expect(catClear.text()).toBe('CONFIRM?')
    fetchMock.mockClear()
    await catClear.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/space/tle?confirm=true&category=amateur'),
      { method: 'DELETE' },
    )
  })

  it('resets the per-category confirmation after the timeout', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const catClear = wrapper.find('.tle-cat-clear')
    await catClear.trigger('click')
    expect(catClear.text()).toBe('CONFIRM?')
    vi.advanceTimersByTime(4000)
    await flushPromises()
    expect(catClear.text()).toBe('CLEAR')
  })

  it('surfaces a per-category clear error', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const catClear = wrapper.find('.tle-cat-clear')
    await catClear.trigger('click')
    stubFetch({ error: 'denied' }, false)
    await catClear.trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('Error: denied')
  })

  it('falls back to the status text for a per-category error with no message', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    const catClear = wrapper.find('.tle-cat-clear')
    await catClear.trigger('click')
    stubFetch({}, false)
    await catClear.trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-db-summary').text()).toBe('Error: Bad')
  })

  it('clears pending confirmation timers on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    await wrapper.find('.tle-action-btn--danger').trigger('click')
    await wrapper.find('.tle-cat-clear').trigger('click')
    clearSpy.mockClear()
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalledTimes(2)
  })

  it('reloads when a tle:refreshStatus event fires', async () => {
    const fetchMock = stubFetch(STATUS)
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    fetchMock.mockClear()
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/space/tle/status')
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SpaceTleDatabaseControl)
    await flushPromises()
    // axe relies on real timers internally — restore them before running it.
    vi.useRealTimers()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
