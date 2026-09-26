import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import MapThemeControl from './MapThemeControl.vue'
import { useThemeStore } from '@/stores/theme'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Stub the fetch the theme store's hydrateLightMapThemeFromDb uses. */
function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

describe('MapThemeControl', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    delete document.documentElement.dataset.mapTheme
    setActivePinia(createPinia())
    stubFetch({}) // hydrate is a no-op: the store keeps its default (dark)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the switch off, reflecting the dark default', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('leaves the interface alone — the chrome has its own control', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')

    // The two palettes are independent: a light basemap must not drag the
    // panels with it (`ThemeControl` owns those).
    expect(useThemeStore().mapTheme).toBe('light')
    expect(useThemeStore().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('switches the app to light at once and stages the DB write', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')

    // Mirrored immediately — the maps repaint while the panel is still open.
    expect(useThemeStore().mapTheme).toBe('light')
    expect(document.documentElement.dataset.mapTheme).toBe('light')
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')

    // ...but nothing is persisted until APPLY CHANGES runs the staged writer.
    expect(settingsApi.put).not.toHaveBeenCalled()
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'lightMapTheme', true)
  })

  it('switches back to dark and stages that too', async () => {
    stubFetch({ lightMapTheme: true })
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(useThemeStore().mapTheme).toBe('dark')
    const staged = wrapper.emitted('stage')!
    await (staged[staged.length - 1]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'lightMapTheme', false)
  })

  it('hydrates the switch from the DB on mount', async () => {
    stubFetch({ lightMapTheme: true })
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(useThemeStore().mapTheme).toBe('light')
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    stubFetch({ lightMapTheme: true })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('names the switch for assistive technology', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-label')).toBe('Use the light basemap')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
