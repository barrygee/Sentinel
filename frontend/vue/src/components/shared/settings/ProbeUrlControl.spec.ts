import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import ProbeUrlControl from './ProbeUrlControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

const LS_KEY = 'sentinel_app_connectivityProbeUrl'

describe('ProbeUrlControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('seeds the input from localStorage', async () => {
    localStorage.setItem(LS_KEY, 'https://saved.example')
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('https://saved.example')
  })

  it('stages a valid URL: persists to localStorage and the backend', async () => {
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    await wrapper.find('input').setValue('https://probe.example')
    const staged = wrapper.emitted('stage')
    expect(staged).toHaveLength(1)
    await (staged![0]![0] as () => unknown)()
    expect(localStorage.getItem(LS_KEY)).toBe('https://probe.example')
    expect(settingsApi.put).toHaveBeenCalledWith(
      'app',
      'connectivityProbeUrl',
      'https://probe.example',
    )
  })

  it('clears the stored URL when emptied', async () => {
    localStorage.setItem(LS_KEY, 'https://old.example')
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    await wrapper.find('input').setValue('')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
    expect(settingsApi.put).toHaveBeenCalledWith('app', 'connectivityProbeUrl', '')
  })

  it('throws from the staged callback when the URL is malformed', async () => {
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    await wrapper.find('input').setValue('not a url')
    const staged = wrapper.emitted('stage')![0]![0] as () => unknown
    expect(() => staged()).toThrow()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('prefills from the backend when localStorage is empty', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      connectivityProbeUrl: 'https://backend.example',
    })
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe(
      'https://backend.example',
    )
    expect(localStorage.getItem(LS_KEY)).toBe('https://backend.example')
  })

  it('keeps the localStorage value over the backend value', async () => {
    localStorage.setItem(LS_KEY, 'https://local.example')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      connectivityProbeUrl: 'https://backend.example',
    })
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('https://local.example')
  })

  it('emits commit on Enter', async () => {
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(ProbeUrlControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
