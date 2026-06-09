import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import OnlineSourceControl from './OnlineSourceControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

// ns 'space' → onlineKey() falls back to 'onlineUrl'.
const NS = 'space'
const KEY = 'onlineUrl'
const LS_KEY = `sentinel_${NS}_${KEY}`

function mountControl(defaultUrl = 'https://default.example') {
  return mount(OnlineSourceControl, { props: { ns: NS, defaultUrl } })
}

describe('OnlineSourceControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('seeds the input from a real localStorage value', async () => {
    localStorage.setItem(LS_KEY, 'https://saved.example')
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('https://saved.example')
  })

  it('drops a placeholder localStorage value when there is no default', async () => {
    localStorage.setItem(LS_KEY, 'https://')
    const wrapper = mountControl('')
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('prefills a real backend value when localStorage is empty', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ [KEY]: 'https://backend.example' })
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe(
      'https://backend.example',
    )
    expect(localStorage.getItem(LS_KEY)).toBe('https://backend.example')
  })

  it('returns early when the backend has no value for the key', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ unrelated: 'x' })
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('clears a placeholder backend value when there is no default', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ [KEY]: 'https://' })
    mountControl('')
    await flushPromises()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
    expect(settingsApi.put).toHaveBeenCalledWith(NS, KEY, '')
  })

  it('keeps the localStorage value when the backend also has a real value', async () => {
    localStorage.setItem(LS_KEY, 'https://local.example')
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ [KEY]: 'https://backend.example' })
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('https://local.example')
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('stages a valid URL to localStorage and the backend', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('https://feed.example')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(LS_KEY)).toBe('https://feed.example')
    expect(settingsApi.put).toHaveBeenCalledWith(NS, KEY, 'https://feed.example')
  })

  it('clears the source when emptied', async () => {
    localStorage.setItem(LS_KEY, 'https://feed.example')
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
    expect(settingsApi.put).toHaveBeenCalledWith(NS, KEY, '')
  })

  it('throws from the staged callback for a malformed URL', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('nonsense')
    expect(() => (wrapper.emitted('stage')![0]![0] as () => unknown)()).toThrow()
  })

  it('emits commit on Enter', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').trigger('keydown.enter')
    expect(wrapper.emitted('commit')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false }, label: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
