import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
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

/** The segment with this label, as the operator would click it. */
function segment(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('[role="radio"]').find((pill) => pill.text().trim() === label)
  if (!found) throw new Error(`no ${label} segment`)
  return found
}

/** Which segment is currently selected. */
function checkedLabel(wrapper: VueWrapper): string | undefined {
  return wrapper
    .findAll('[role="radio"]')
    .find((pill) => pill.attributes('aria-checked') === 'true')
    ?.text()
    .trim()
}

describe('ThemeControl', () => {
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

  it('offers exactly the two interface palettes', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(wrapper.findAll('[role="radio"]').map((pill) => pill.text().trim())).toEqual([
      'DARK',
      'LIGHT',
    ])
  })

  it('starts on DARK, reflecting the default', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('DARK')
  })

  it('leaves the basemap alone — the map has its own control', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    await segment(wrapper, 'LIGHT').trigger('click')

    // The two palettes are independent: turning the interface light must not
    // drag the basemap with it (`MapThemeControl` owns that).
    expect(useThemeStore().theme).toBe('light')
    expect(useThemeStore().mapTheme).toBe('dark')
    expect(document.documentElement.dataset.mapTheme).toBe('dark')
  })

  it('switches the interface at once and stages the DB write', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    await segment(wrapper, 'LIGHT').trigger('click')

    // Mirrored immediately — the panels repaint while the panel is still open.
    expect(useThemeStore().theme).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(checkedLabel(wrapper)).toBe('LIGHT')

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
    await segment(wrapper, 'DARK').trigger('click')

    expect(useThemeStore().theme).toBe('dark')
    const staged = wrapper.emitted('stage')!
    await (staged[staged.length - 1]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'lightTheme', false)
  })

  it('ignores a click on the segment already selected', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    await segment(wrapper, 'DARK').trigger('click')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('hydrates the selection from the DB on mount', async () => {
    stubFetch({ lightTheme: true })
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(useThemeStore().theme).toBe('light')
    expect(checkedLabel(wrapper)).toBe('LIGHT')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('DARK')
    stubFetch({ lightTheme: true })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('LIGHT')
  })

  it('names the group for assistive technology', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Interface palette')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ThemeControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
