import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import OverheadAlertsToggleControl from './OverheadAlertsToggleControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

function switches(wrapper: ReturnType<typeof mount>) {
  const all = wrapper.findAll('[role="switch"]')
  return { civil: all[0]!, mil: all[1]! }
}

describe('OverheadAlertsToggleControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
    vi.mocked(settingsApi.del).mockResolvedValue(undefined)
  })

  it('renders both switches off by default', async () => {
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    const { civil, mil } = switches(wrapper)
    expect(civil.attributes('aria-checked')).toBe('false')
    expect(mil.attributes('aria-checked')).toBe('false')
  })

  it('toggling civil stages the nested config', async () => {
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    await switches(wrapper).civil.trigger('click')
    expect(switches(wrapper).civil.attributes('aria-checked')).toBe('true')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'overheadAlerts', {
      civil: true,
      mil: false,
      radiusNm: 10,
    })
  })

  it('toggling military stages the nested config', async () => {
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    await switches(wrapper).mil.trigger('click')
    expect(switches(wrapper).mil.attributes('aria-checked')).toBe('true')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'overheadAlerts', {
      civil: false,
      mil: true,
      radiusNm: 10,
    })
  })

  it('hydrates both flags from the nested config on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      overheadAlerts: { civil: true, mil: true },
    })
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    const { civil, mil } = switches(wrapper)
    expect(civil.attributes('aria-checked')).toBe('true')
    expect(mil.attributes('aria-checked')).toBe('true')
  })

  it('leaves flags untouched when the config matches the current state', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      overheadAlerts: { civil: false, mil: false },
    })
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    expect(switches(wrapper).civil.attributes('aria-checked')).toBe('false')
  })

  it('ignores a non-object overheadAlerts value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ overheadAlerts: [1, 2] })
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    expect(switches(wrapper).civil.attributes('aria-checked')).toBe('false')
  })

  it('removes legacy flat keys when present', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      overheadAlertsCivil: true,
      overheadAlertsMil: false,
      overheadAlertRadiusNm: 5,
    })
    mount(OverheadAlertsToggleControl)
    await flushPromises()
    expect(settingsApi.del).toHaveBeenCalledWith('air', 'overheadAlertsCivil')
    expect(settingsApi.del).toHaveBeenCalledWith('air', 'overheadAlertsMil')
    expect(settingsApi.del).toHaveBeenCalledWith('air', 'overheadAlertRadiusNm')
  })

  it('removes only the legacy keys that are present (civil only)', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ overheadAlertsCivil: true })
    mount(OverheadAlertsToggleControl)
    await flushPromises()
    expect(settingsApi.del).toHaveBeenCalledWith('air', 'overheadAlertsCivil')
    expect(settingsApi.del).not.toHaveBeenCalledWith('air', 'overheadAlertsMil')
    expect(settingsApi.del).not.toHaveBeenCalledWith('air', 'overheadAlertRadiusNm')
  })

  it('removes only the legacy keys that are present (military only)', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ overheadAlertsMil: true })
    mount(OverheadAlertsToggleControl)
    await flushPromises()
    expect(settingsApi.del).toHaveBeenCalledWith('air', 'overheadAlertsMil')
    expect(settingsApi.del).not.toHaveBeenCalledWith('air', 'overheadAlertsCivil')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(OverheadAlertsToggleControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
