import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LocationControl from './LocationControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const STORAGE_KEY = 'sentinel_user_location'

function inputs(wrapper: ReturnType<typeof mount>) {
  const fields = wrapper.findAll('input')
  return {
    lat: fields[0]!,
    lon: fields[1]!,
    latValue: () => (fields[0]!.element as HTMLInputElement).value,
    lonValue: () => (fields[1]!.element as HTMLInputElement).value,
  }
}

describe('LocationControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('seeds both fields from a localStorage latitude/longitude pair', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ latitude: 51.5, longitude: -0.12 }))
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('51.50000')
    expect(fields.lonValue()).toBe('-0.12000')
  })

  it('accepts the legacy lat/lon keys and a longitude-only entry', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lon: 10 }))
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('')
    expect(fields.lonValue()).toBe('10.00000')
  })

  it('seeds latitude only when longitude is absent', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ latitude: 5 }))
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('5.00000')
    expect(fields.lonValue()).toBe('')
  })

  it('prefills empty fields from a valid backend location', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      location: { latitude: '40', longitude: '50' },
    })
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('40.00000')
    expect(fields.lonValue()).toBe('50.00000')
  })

  it('clears the fields when the backend location is the unset form', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ latitude: 51.5, longitude: -0.12 }))
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      location: { latitude: '', longitude: '' },
    })
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('')
    expect(fields.lonValue()).toBe('')
  })

  it('keeps already-populated fields when the backend also has a valid location', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ latitude: 1, longitude: 2 }))
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      location: { latitude: '40', longitude: '50' },
    })
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('1.00000')
    expect(fields.lonValue()).toBe('2.00000')
  })

  it('emits commit when Enter is pressed in either field', async () => {
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    await fields.lat.trigger('keydown.enter')
    await fields.lon.trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(2)
  })

  it('does nothing on mount when the backend has no location', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ other: 1 })
    const wrapper = mount(LocationControl)
    await flushPromises()
    expect(inputs(wrapper).latValue()).toBe('')
  })

  it('dispatches the live location and stages a valid pair', async () => {
    const liveSpy = vi.fn()
    window.addEventListener('sentinel:setUserLocation', liveSpy)
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    await fields.lat.setValue('51.5')
    await fields.lon.setValue('-0.12')
    expect(liveSpy).toHaveBeenCalled()
    await (wrapper.emitted('stage')!.at(-1)![0] as () => unknown)()
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      latitude: 51.5,
      longitude: -0.12,
      manual: true,
    })
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'location', {
      latitude: 51.5,
      longitude: -0.12,
    })
    window.removeEventListener('sentinel:setUserLocation', liveSpy)
  })

  it('clears the location when both fields are blank', async () => {
    const clearedSpy = vi.fn()
    window.addEventListener('sentinel:userLocationCleared', clearedSpy)
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    await fields.lat.setValue('')
    await fields.lon.setValue('')
    await (wrapper.emitted('stage')!.at(-1)![0] as () => unknown)()
    expect(clearedSpy).toHaveBeenCalled()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'location', {
      latitude: '',
      longitude: '',
    })
    window.removeEventListener('sentinel:userLocationCleared', clearedSpy)
  })

  it('throws INVALID LAT from the staged callback for an out-of-range latitude', async () => {
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    await fields.lat.setValue('200')
    await fields.lon.setValue('10')
    expect(() => (wrapper.emitted('stage')!.at(-1)![0] as () => unknown)()).toThrow('INVALID LAT')
  })

  it('throws INVALID LON from the staged callback for an out-of-range longitude', async () => {
    const wrapper = mount(LocationControl)
    await flushPromises()
    const fields = inputs(wrapper)
    await fields.lat.setValue('10')
    await fields.lon.setValue('500')
    expect(() => (wrapper.emitted('stage')!.at(-1)![0] as () => unknown)()).toThrow('INVALID LON')
  })

  it('updates the fields when another component broadcasts a synced location', async () => {
    const wrapper = mount(LocationControl)
    await flushPromises()
    window.dispatchEvent(
      new CustomEvent('settings:locationSynced', { detail: { latitude: 12.34, longitude: 56.78 } }),
    )
    await flushPromises()
    const fields = inputs(wrapper)
    expect(fields.latValue()).toBe('12.34000')
    expect(fields.lonValue()).toBe('56.78000')
  })

  it('ignores the echo of its own set while dispatching', async () => {
    const wrapper = mount(LocationControl)
    await flushPromises()
    // Re-broadcast a synced event synchronously during the component's own
    // live dispatch — the _selfSetting guard should make it ignore the echo.
    const echo = () =>
      window.dispatchEvent(
        new CustomEvent('settings:locationSynced', {
          detail: { latitude: 99, longitude: 99 },
        }),
      )
    window.addEventListener('sentinel:setUserLocation', echo)
    const fields = inputs(wrapper)
    await fields.lat.setValue('51.5')
    await fields.lon.setValue('-0.12')
    // The fields keep the typed values, not the echoed 99/99.
    expect(fields.latValue()).toBe('51.5')
    expect(fields.lonValue()).toBe('-0.12')
    window.removeEventListener('sentinel:setUserLocation', echo)
  })

  it('removes the locationSynced listener on unmount', async () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const wrapper = mount(LocationControl)
    await flushPromises()
    wrapper.unmount()
    expect(removeSpy).toHaveBeenCalledWith('settings:locationSynced', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LocationControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false }, label: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
