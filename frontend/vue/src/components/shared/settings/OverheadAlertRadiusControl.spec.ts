import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import OverheadAlertRadiusControl from './OverheadAlertRadiusControl.vue'
import { useAirStore } from '@/stores/air'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

describe('OverheadAlertRadiusControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders the store default (10) as a valid value', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('10')
    expect(wrapper.find('input').classes()).not.toContain('oar-input--invalid')
  })

  it('accepts a valid radius, mirrors it into the store, and stages the nested write', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    const air = useAirStore()
    await wrapper.find('input').setValue('25')
    expect(air.overheadAlertRadiusNm).toBe(25)
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(settingsApi.put).toHaveBeenCalledWith('air', 'overheadAlerts', {
      civil: air.overlayStates.overheadAlertsCivil,
      mil: air.overlayStates.overheadAlertsMil,
      radiusNm: 25,
    })
  })

  it('strips disallowed characters before staging', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').setValue('2a5')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('25')
    expect(useAirStore().overheadAlertRadiusNm).toBe(25)
  })

  it('marks a malformed number invalid and does not stage', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').setValue('1.2.3')
    expect(wrapper.find('input').classes()).toContain('oar-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('treats an empty value as invalid', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect(wrapper.find('input').classes()).toContain('oar-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('treats a non-positive radius as invalid', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').classes()).toContain('oar-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('hydrates a numeric radius from the nested config on mount', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ overheadAlerts: { radiusNm: 42 } })
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('42')
    expect(useAirStore().overheadAlertRadiusNm).toBe(42)
  })

  it('coerces a string radius from the config', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ overheadAlerts: { radiusNm: '33' } })
    mount(OverheadAlertRadiusControl)
    await flushPromises()
    expect(useAirStore().overheadAlertRadiusNm).toBe(33)
  })

  it('ignores a non-object overheadAlerts value', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ overheadAlerts: [1, 2] })
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('10')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    // `region` (page landmark) and `label` (the input's missing accessible
    // name — a known gap deferred to the a11y remediation phase) are disabled;
    // every other rule is still asserted.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
