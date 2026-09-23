import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import ThemeControl from './ThemeControl.vue'
import { useThemeStore } from '@/stores/theme'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/** Stub the fetch the theme store's hydrateLightThemeFromDb uses. */
function stubFetch(payload: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => payload }))
}

describe('ThemeControl', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    setActivePinia(createPinia())
    stubFetch({}) // hydrate is a no-op: the store keeps its default (dark)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the switch off, reflecting the dark default', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
  })

  it('switches the app to light at once and stages the DB write', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')

    // Mirrored immediately — the maps repaint while the panel is still open.
    expect(useThemeStore().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')

    // ...but nothing is persisted until APPLY CHANGES runs the staged writer.
    expect(settingsApi.put).not.toHaveBeenCalled()
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'lightTheme', true)
  })

  it('switches back to dark and stages that too', async () => {
    stubFetch({ lightTheme: true })
    const wrapper = mount(ThemeControl)
    await flushPromises()
    await wrapper.find('[role="switch"]').trigger('click')
    expect(useThemeStore().theme).toBe('dark')
    const staged = wrapper.emitted('stage')!
    await (staged[staged.length - 1]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'lightTheme', false)
  })

  it('hydrates the switch from the DB on mount', async () => {
    stubFetch({ lightTheme: true })
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(useThemeStore().theme).toBe('light')
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('false')
    stubFetch({ lightTheme: true })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-checked')).toBe('true')
  })

  it('names the switch for assistive technology', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="switch"]').attributes('aria-label')).toBe(
      'Use the light theme for the maps and the interface',
    )
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
