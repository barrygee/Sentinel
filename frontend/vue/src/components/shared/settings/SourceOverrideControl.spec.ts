import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SourceOverrideControl from './SourceOverrideControl.vue'
import { useAppStore } from '@sentinel/shell-api/stores/app'

vi.mock('@sentinel/shell-api/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

const NS = 'air'
const LS_KEY = `sentinel_${NS}_sourceOverride`

async function mountControl() {
  const wrapper = mount(SourceOverrideControl, { props: { ns: NS } })
  await flushPromises()
  return wrapper
}

function checkedLabel(wrapper: Awaited<ReturnType<typeof mountControl>>): string {
  return wrapper.find('[role="radio"][aria-checked="true"]').text()
}

function radio(wrapper: Awaited<ReturnType<typeof mountControl>>, label: string) {
  const match = wrapper.findAll('[role="radio"]').find((node) => node.text() === label)
  if (!match) throw new Error(`no ${label} radio`)
  return match
}

describe('SourceOverrideControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers exactly OFF GRID then ONLINE — no AUTO — as a named radio group', async () => {
    const wrapper = await mountControl()
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe(
      'AIR data source mode',
    )
    expect(wrapper.findAll('[role="radio"]').map((node) => node.text())).toEqual([
      'OFF GRID',
      'ONLINE',
    ])
  })

  it('with no mode of its own, shows the app-wide mode and no note', async () => {
    useAppStore().setConnectivityMode('offgrid')
    const wrapper = await mountControl()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
    expect(wrapper.find('.settings-source-override-note').exists()).toBe(false)
  })

  it("treats a cached legacy 'auto' as having no mode of its own", async () => {
    localStorage.setItem(LS_KEY, 'auto')
    const wrapper = await mountControl()
    expect(checkedLabel(wrapper)).toBe('ONLINE')
  })

  it('shows the cached section mode and notes that it differs from the app', async () => {
    localStorage.setItem(LS_KEY, 'offgrid')
    const wrapper = await mountControl()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
    expect(wrapper.find('.settings-source-override-note').text()).toBe(
      'This section differs from the app-level connectivity mode.',
    )
  })

  it('adopts the backend mode on mount and caches it', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ sourceOverride: 'offgrid' })
    const wrapper = await mountControl()
    expect(settingsApi.getNamespace).toHaveBeenCalledWith(NS)
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
    expect(localStorage.getItem(LS_KEY)).toBe('offgrid')
  })

  it("ignores a backend 'auto' rather than showing it", async () => {
    localStorage.setItem(LS_KEY, 'offgrid')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ sourceOverride: 'auto' })
    const wrapper = await mountControl()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
  })

  it('does not rewrite the cache when the backend already agrees', async () => {
    localStorage.setItem(LS_KEY, 'offgrid')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ sourceOverride: 'offgrid' })
    const setItem = vi.spyOn(localStorage, 'setItem')
    await mountControl()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('copes with localStorage being unavailable', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ sourceOverride: 'offgrid' })
    const wrapper = await mountControl()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')

    await radio(wrapper, 'ONLINE').trigger('click')
    const staged = wrapper.emitted('stage')![0]![0] as () => void
    staged()
    expect(settingsApi.put).toHaveBeenCalledWith(NS, 'sourceOverride', 'online')
  })

  it('picking a mode selects it at once but only saves when the staged work runs', async () => {
    const wrapper = await mountControl()
    await radio(wrapper, 'OFF GRID').trigger('click')
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
    expect(wrapper.find('.settings-source-override-note').exists()).toBe(true)
    expect(settingsApi.put).not.toHaveBeenCalled()

    const events: Event[] = []
    window.addEventListener('sentinel:sourceOverrideChanged', (event) => events.push(event))
    const staged = wrapper.emitted('stage')![0]![0] as () => void
    staged()
    expect(settingsApi.put).toHaveBeenCalledWith(NS, 'sourceOverride', 'offgrid')
    expect(localStorage.getItem(LS_KEY)).toBe('offgrid')
    expect(events).toHaveLength(1)
  })

  it('re-clicking the mode already shown stages nothing', async () => {
    const wrapper = await mountControl()
    await radio(wrapper, 'ONLINE').trigger('click')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('is keyboard operable: an arrow key moves to and picks the next mode', async () => {
    const wrapper = await mountControl()
    await radio(wrapper, 'ONLINE').trigger('keydown', { key: 'ArrowRight' })
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
    expect(wrapper.emitted('stage')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    localStorage.setItem(LS_KEY, 'offgrid')
    const wrapper = await mountControl()
    // `region` is off: a lone control has no page landmarks around it.
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
