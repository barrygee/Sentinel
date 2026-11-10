import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SpaceTleOnlineControl from './SpaceTleOnlineControl.vue'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

const LS_KEY = 'sentinel_space_onlineUrl'
const ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'

function stubFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok, statusText: 'Bad', json: async () => payload })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function urlInput(wrapper: ReturnType<typeof mount>) {
  return wrapper.find('input[type="url"]')
}

describe('SpaceTleOnlineControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
    stubFetch({ inserted: 4, updated: 1 })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults the URL to the active Celestrak feed', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    expect((urlInput(wrapper).element as HTMLInputElement).value).toBe(ACTIVE_URL)
  })

  it('migrates a legacy saved URL', async () => {
    localStorage.setItem(
      LS_KEY,
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE',
    )
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    const value = (urlInput(wrapper).element as HTMLInputElement).value
    expect(value).toContain('GROUP=active')
    expect(value).toContain('FORMAT=tle')
    expect(localStorage.getItem(LS_KEY)).toBe(value)
  })

  it('falls back to the active URL when localStorage throws', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    expect((urlInput(wrapper).element as HTMLInputElement).value).toBe(ACTIVE_URL)
  })

  it('overrides the category URLs from the backend on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      onlineUrls: { active: 'https://mirror.example/active.tle' },
    })
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    expect((urlInput(wrapper).element as HTMLInputElement).value).toBe(
      'https://mirror.example/active.tle',
    )
    expect(localStorage.getItem(LS_KEY)).toBe('https://mirror.example/active.tle')
  })

  it('leaves defaults intact when the backend has no TLE URLs', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ unrelated: true })
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    expect((urlInput(wrapper).element as HTMLInputElement).value).toBe(ACTIVE_URL)
  })

  it('ignores a non-object onlineUrls value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ onlineUrls: 'nope' })
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    expect((urlInput(wrapper).element as HTMLInputElement).value).toBe(ACTIVE_URL)
  })

  it('changes the URL when a different category is selected', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    await wrapper.find('.settings-dropdown-trigger').trigger('click')
    const military = wrapper.findAll('[role="option"]').find((i) => i.text() === 'Military')!
    await military.trigger('mousedown')
    expect((urlInput(wrapper).element as HTMLInputElement).value).toContain('GROUP=military')
    expect(wrapper.find('.settings-dropdown--open').exists()).toBe(false)
  })

  it('closes the category dropdown on blur', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    await wrapper.find('.settings-dropdown-trigger').trigger('click')
    expect(wrapper.find('.settings-dropdown--open').exists()).toBe(true)
    await wrapper.find('.settings-dropdown-trigger').trigger('blur')
    expect(wrapper.find('.settings-dropdown--open').exists()).toBe(false)
  })

  it('refuses to fetch when the URL is empty', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    await urlInput(wrapper).setValue('')
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge--error').text()).toBe('Enter a URL first')
  })

  it('fetches the TLE feed and reports the result', async () => {
    const refresh = vi.fn()
    document.addEventListener('tle:refreshStatus', refresh)
    const fetchMock = stubFetch({ inserted: 4, updated: 1 })
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(settingsApi.put).toHaveBeenCalledWith('space', 'onlineUrl', ACTIVE_URL)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/space/tle/fetch',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(wrapper.find('.tle-status-badge').text()).toContain('5 satellites loaded')
    expect(refresh).toHaveBeenCalled()
    document.removeEventListener('tle:refreshStatus', refresh)
  })

  it('reports zero counts when the response omits them', async () => {
    stubFetch({})
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge').text()).toBe('0 satellites loaded · 0 new · 0 updated')
  })

  it('surfaces a fetch error', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    stubFetch({ error: 'unreachable' }, false)
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge--error').text()).toBe('Error: unreachable')
  })

  it('falls back to the status text for an error with no message', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    stubFetch({}, false)
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.tle-status-badge--error').text()).toBe('Error: Bad')
  })

  it('chooses a category from the keyboard and shows its URL', async () => {
    const wrapper = mount(SpaceTleOnlineControl, { attachTo: document.body })
    await flushPromises()
    const trigger = wrapper.get('[role="combobox"]')
    expect(trigger.attributes('aria-label')).toBe('TLE category')
    await trigger.trigger('keydown', { key: 'ArrowDown' }) // opens on the current choice
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(trigger.text()).toBe('Amateur Radio')
    expect((urlInput(wrapper).element as HTMLInputElement).value).toContain('GROUP=amateur')
    wrapper.unmount()
  })

  it('leaves the category and URL alone when the menu is dismissed with Escape', async () => {
    const wrapper = mount(SpaceTleOnlineControl, { attachTo: document.body })
    await flushPromises()
    const urlBefore = (urlInput(wrapper).element as HTMLInputElement).value
    const trigger = wrapper.get('[role="combobox"]')
    await trigger.trigger('keydown', { key: 'Enter' })
    await trigger.trigger('keydown', { key: 'ArrowDown' })
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.text()).toBe('All Active (no category)')
    expect((urlInput(wrapper).element as HTMLInputElement).value).toBe(urlBefore)
    wrapper.unmount()
  })

  it('updates with the chosen category', async () => {
    const fetchMock = stubFetch({ inserted: 2, updated: 0 })
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    await wrapper.get('[role="combobox"]').trigger('click')
    await wrapper
      .findAll('[role="option"]')
      .find((option) => option.text() === 'Military')!
      .trigger('mousedown')
    await wrapper.find('.tle-action-btn--primary').trigger('click')
    await flushPromises()
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/space/tle'))!
    const body = JSON.parse(call[1].body as string)
    expect(body.category).toBe('military')
    expect(body.url).toContain('GROUP=military')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SpaceTleOnlineControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
