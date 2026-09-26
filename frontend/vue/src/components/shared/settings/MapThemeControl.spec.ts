import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
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

/** Stub the fetch the theme store's hydrateMapThemeFromDb uses. */
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

  it('offers all three basemap palettes', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(wrapper.findAll('[role="radio"]').map((pill) => pill.text().trim())).toEqual([
      'DARK',
      'LIGHT',
      'COLOUR',
    ])
  })

  it('starts on DARK, reflecting the default', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('DARK')
  })

  it('leaves the interface alone — the chrome has its own control', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await segment(wrapper, 'LIGHT').trigger('click')

    // The two palettes are independent: a light basemap must not drag the
    // panels with it (`ThemeControl` owns those).
    expect(useThemeStore().mapTheme).toBe('light')
    expect(useThemeStore().theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('repaints the map at once and stages the DB write', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await segment(wrapper, 'COLOUR').trigger('click')

    // Mirrored immediately — the maps reload the style while the panel is open.
    expect(useThemeStore().mapTheme).toBe('colour')
    expect(document.documentElement.dataset.mapTheme).toBe('colour')
    expect(checkedLabel(wrapper)).toBe('COLOUR')

    // ...but nothing is persisted until APPLY CHANGES runs the staged writer.
    expect(settingsApi.put).not.toHaveBeenCalled()
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'mapTheme', 'colour')
  })

  it('switches back to dark and stages that too', async () => {
    stubFetch({ mapTheme: 'colour' })
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await segment(wrapper, 'DARK').trigger('click')

    expect(useThemeStore().mapTheme).toBe('dark')
    const staged = wrapper.emitted('stage')!
    await (staged[staged.length - 1]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'mapTheme', 'dark')
  })

  it('ignores a click on the segment already selected', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    await segment(wrapper, 'DARK').trigger('click')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('hydrates the selection from the DB on mount', async () => {
    stubFetch({ mapTheme: 'colour' })
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(useThemeStore().mapTheme).toBe('colour')
    expect(checkedLabel(wrapper)).toBe('COLOUR')
  })

  it('hydrates from the pre-colour boolean when that is all the config has', async () => {
    stubFetch({ lightMapTheme: true })
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('LIGHT')
  })

  it('re-syncs when a new config is uploaded', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('DARK')
    stubFetch({ mapTheme: 'light' })
    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()
    expect(checkedLabel(wrapper)).toBe('LIGHT')
  })

  it('names the group for assistive technology', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Basemap palette')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(MapThemeControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
