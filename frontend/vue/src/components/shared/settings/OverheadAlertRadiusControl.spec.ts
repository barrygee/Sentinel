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
    expect(wrapper.find('input').classes()).not.toContain('number-setting-input--invalid')
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
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('treats an empty value as invalid', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').setValue('')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
    expect(wrapper.emitted('stage')).toBeUndefined()
  })

  it('treats a non-positive radius as invalid', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    await wrapper.find('input').setValue('0')
    expect(wrapper.find('input').classes()).toContain('number-setting-input--invalid')
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

  it("does not re-hydrate when sentinel:config-uploaded fires (deliberate: shares the toggle control's namespace)", async () => {
    // This control's radius is nested inside the same `air/overheadAlerts`
    // payload owned by OverheadAlertsToggleControl, which already performs
    // the legacy flat-key migration read on mount. Re-hydrating here too on
    // every config upload would risk racing/duplicating that, so this
    // control intentionally only hydrates once, on mount.
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    vi.mocked(settingsApi.getNamespace).mockClear()

    document.dispatchEvent(new CustomEvent('sentinel:config-uploaded'))
    await flushPromises()

    expect(settingsApi.getNamespace).not.toHaveBeenCalled()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('10')
    expect(useAirStore().overheadAlertRadiusNm).toBe(10)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(OverheadAlertRadiusControl)
    await flushPromises()
    // `region` (page landmark) is disabled. The input's accessible name is
    // provided via `aria-label` (see the template) so `label` is not
    // disabled here — every rule is asserted.
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
