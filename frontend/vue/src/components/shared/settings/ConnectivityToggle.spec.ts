import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import ConnectivityToggle from './ConnectivityToggle.vue'
import { useAppStore } from '@/stores/app'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const MODE_KEY = 'sentinel_app_connectivityMode'
const sectionKey = (ns: string) => `sentinel_${ns}_sourceOverride`

function radio(wrapper: ReturnType<typeof mount>, label: string) {
  const match = wrapper.findAll('[role="radio"]').find((node) => node.text() === label)
  if (!match) throw new Error(`no ${label} radio`)
  return match
}

function checkedLabel(wrapper: ReturnType<typeof mount>): string {
  return wrapper.find('[role="radio"][aria-checked="true"]').text()
}

/** One override row as its visible cells, e.g. ['SEA', 'OFF GRID', '→', 'ONLINE']. */
function rowCells(row: ReturnType<ReturnType<typeof mount>['find']>): string[] {
  return row.findAll('span:not(.sr-only)').map((cell) => cell.text())
}

/** Mount, returning the staged closures the control emits. */
async function mountToggle() {
  const wrapper = mount(ConnectivityToggle)
  await flushPromises()
  const staged = () =>
    (wrapper.emitted('stage') ?? []).map((args) => args[0] as () => Promise<unknown>)
  return { wrapper, staged }
}

/** Back the settings API with per-namespace values. */
function backendHas(namespaces: Record<string, Record<string, unknown>>): void {
  vi.mocked(settingsApi.getNamespace).mockImplementation(async (ns) => namespaces[ns] ?? null)
}

describe('ConnectivityToggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers exactly OFF GRID then ONLINE, with ONLINE selected by default', async () => {
    const { wrapper } = await mountToggle()
    expect(wrapper.findAll('[role="radio"]').map((node) => node.text())).toEqual([
      'OFF GRID',
      'ONLINE',
    ])
    expect(checkedLabel(wrapper)).toBe('ONLINE')
  })

  it('selects the mode cached in localStorage', async () => {
    localStorage.setItem(MODE_KEY, 'offgrid')
    const { wrapper } = await mountToggle()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
  })

  it('ignores a cached legacy auto mode', async () => {
    localStorage.setItem(MODE_KEY, 'auto')
    const { wrapper } = await mountToggle()
    expect(checkedLabel(wrapper)).toBe('ONLINE')
  })

  it('falls back to ONLINE with no summary when localStorage throws', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { wrapper } = await mountToggle()
    expect(checkedLabel(wrapper)).toBe('ONLINE')
    expect(wrapper.find('.settings-connectivity-override-summary').exists()).toBe(false)
  })

  it('adopts a differing backend mode on mount and caches it', async () => {
    backendHas({ app: { connectivityMode: 'offgrid' } })
    const { wrapper } = await mountToggle()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
    expect(localStorage.getItem(MODE_KEY)).toBe('offgrid')
    expect(useAppStore().connectivityMode).toBe('offgrid')
  })

  it('ignores a backend mode that is not online or off grid', async () => {
    backendHas({ app: { connectivityMode: 'auto' } })
    const { wrapper } = await mountToggle()
    expect(checkedLabel(wrapper)).toBe('ONLINE')
    expect(localStorage.getItem(MODE_KEY)).toBeNull()
  })

  it('leaves everything alone when the backend mode matches', async () => {
    localStorage.setItem(MODE_KEY, 'online')
    backendHas({ app: { connectivityMode: 'online' } })
    const setItem = vi.spyOn(localStorage, 'setItem')
    await mountToggle()
    expect(setItem).not.toHaveBeenCalledWith(MODE_KEY, expect.anything())
  })

  it('tolerates localStorage failing while caching the backend mode', async () => {
    backendHas({ app: { connectivityMode: 'offgrid' } })
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    const { wrapper } = await mountToggle()
    expect(checkedLabel(wrapper)).toBe('OFF GRID')
  })

  describe('section overrides list', () => {
    it('is hidden when every section matches the app mode', async () => {
      localStorage.setItem(sectionKey('air'), 'online')
      const { wrapper } = await mountToggle()
      expect(wrapper.find('.settings-connectivity-override-summary').exists()).toBe(false)
    })

    it('lists each section set differently, with its current mode', async () => {
      localStorage.setItem(sectionKey('sea'), 'offgrid')
      const { wrapper } = await mountToggle()
      const rows = wrapper.findAll('.settings-conn-override-row')
      expect(rows).toHaveLength(1)
      expect(rowCells(rows[0]!)).toEqual(['SEA', 'OFF GRID'])
      expect(rows[0]!.find('.settings-conn-override-val--offgrid').exists()).toBe(true)
    })

    it('reads section modes from the backend, which wins over the cache', async () => {
      localStorage.setItem(sectionKey('air'), 'online')
      backendHas({ air: { sourceOverride: 'offgrid' }, space: { sourceOverride: 'auto' } })
      const { wrapper } = await mountToggle()
      const rows = wrapper.findAll('.settings-conn-override-row').map(rowCells)
      expect(rows).toEqual([['AIR', 'OFF GRID']])
    })

    it('shows no warning until a mode is picked', async () => {
      localStorage.setItem(sectionKey('sea'), 'offgrid')
      const { wrapper } = await mountToggle()
      expect(wrapper.find('.warning-notice').exists()).toBe(false)
      expect(wrapper.find('.settings-conn-override-arrow').exists()).toBe(false)
    })

    it('after a pick, warns that APPLY CHANGES will reset them and shows each change', async () => {
      localStorage.setItem(sectionKey('sea'), 'offgrid')
      const { wrapper } = await mountToggle()
      await radio(wrapper, 'ONLINE').trigger('click')
      expect(wrapper.find('.warning-notice').text()).toContain(
        'These section overrides will be set to ONLINE when you click APPLY CHANGES.',
      )
      const row = wrapper.find('.settings-conn-override-row')
      expect(rowCells(row)).toEqual(['SEA', 'OFF GRID', '→', 'ONLINE'])
      // The arrow is decorative; screen readers hear the words instead.
      expect(row.find('.settings-conn-override-arrow').attributes('aria-hidden')).toBe('true')
      expect(row.find('.sr-only').text()).toBe('will become')
    })

    it('lists the sections that will change when switching to the other mode', async () => {
      localStorage.setItem(sectionKey('air'), 'online')
      localStorage.setItem(sectionKey('sea'), 'offgrid')
      const { wrapper } = await mountToggle()
      await radio(wrapper, 'OFF GRID').trigger('click')
      const rows = wrapper.findAll('.settings-conn-override-row').map(rowCells)
      expect(rows).toEqual([['AIR', 'ONLINE', '→', 'OFF GRID']])
    })
  })

  describe('picking a mode', () => {
    it('stages nothing until a mode is picked', async () => {
      const { staged } = await mountToggle()
      expect(staged()).toHaveLength(0)
    })

    it('stages a write that sets the app and every section to the mode', async () => {
      const { wrapper, staged } = await mountToggle()
      await radio(wrapper, 'OFF GRID').trigger('click')
      expect(checkedLabel(wrapper)).toBe('OFF GRID')
      expect(settingsApi.put).not.toHaveBeenCalled()

      const events: string[] = []
      window.addEventListener('sentinel:sourceOverrideChanged', () => events.push('changed'))
      await staged()[0]!()

      expect(vi.mocked(settingsApi.put).mock.calls).toEqual([
        ['air', 'sourceOverride', 'offgrid'],
        ['space', 'sourceOverride', 'offgrid'],
        ['sea', 'sourceOverride', 'offgrid'],
        ['app', 'connectivityMode', 'offgrid'],
      ])
      expect(localStorage.getItem(MODE_KEY)).toBe('offgrid')
      for (const ns of ['air', 'space', 'sea'])
        expect(localStorage.getItem(sectionKey(ns))).toBe('offgrid')
      expect(useAppStore().connectivityMode).toBe('offgrid')
      expect(events).toEqual(['changed'])
    })

    it('re-picking the selected mode still resets every section to it', async () => {
      localStorage.setItem(sectionKey('sea'), 'offgrid')
      const { wrapper, staged } = await mountToggle()
      await radio(wrapper, 'ONLINE').trigger('click')
      expect(staged()).toHaveLength(1)
      await staged()[0]!()
      expect(settingsApi.put).toHaveBeenCalledWith('sea', 'sourceOverride', 'online')
    })

    it('waits for every write before the staged work resolves', async () => {
      let releaseSea: () => void = () => {}
      vi.mocked(settingsApi.put).mockImplementation((ns) =>
        ns === 'sea' ? new Promise<void>((resolve) => (releaseSea = resolve)) : Promise.resolve(),
      )
      const { wrapper, staged } = await mountToggle()
      await radio(wrapper, 'OFF GRID').trigger('click')
      let resolved = false
      const done = staged()[0]!().then(() => (resolved = true))
      await flushPromises()
      expect(resolved).toBe(false)
      releaseSea()
      await done
      expect(resolved).toBe(true)
    })

    it('still writes to the backend when localStorage is unavailable', async () => {
      const { wrapper, staged } = await mountToggle()
      await radio(wrapper, 'OFF GRID').trigger('click')
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('full')
      })
      await staged()[0]!()
      expect(settingsApi.put).toHaveBeenCalledWith('app', 'connectivityMode', 'offgrid')
    })
  })

  it('has no accessibility violations, including with the warning showing', async () => {
    localStorage.setItem(sectionKey('sea'), 'offgrid')
    const { wrapper } = await mountToggle()
    await radio(wrapper, 'ONLINE').trigger('click')
    // `region` is off: a lone control has no page landmarks around it.
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
