import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import OfflineSourceControl from './OfflineSourceControl.vue'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

// ns 'space' → offgridKey() falls back to 'offgridSource'.
const NS = 'space'
const KEY = 'offgridSource'
const LS_KEY = `sentinel_${NS}_${KEY}`

function mountControl(defaultUrl = 'http://default.example') {
  return mount(OfflineSourceControl, { props: { ns: NS, defaultUrl } })
}

function storedUrl(): string | undefined {
  const raw = localStorage.getItem(LS_KEY)
  return raw ? (JSON.parse(raw) as { url?: string }).url : undefined
}

describe('OfflineSourceControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('seeds the input from a real localStorage value', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ url: 'http://feed.example' }))
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('http://feed.example')
  })

  it('drops a placeholder localStorage value when there is no default', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ url: 'http://localhost' }))
    const wrapper = mountControl('')
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(localStorage.getItem(LS_KEY)).toBeNull()
  })

  it('ignores a localStorage entry with an empty url', async () => {
    localStorage.setItem(LS_KEY, JSON.stringify({ url: '' }))
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('leaves an empty backend value untouched when there is no default', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ [KEY]: { url: '' } })
    const wrapper = mountControl('')
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(localStorage.getItem(LS_KEY)).toBeNull()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  it('returns early when the backend has no value for the key', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ unrelated: 'x' })
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
  })

  it('prefills a real backend value when localStorage is empty', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      [KEY]: { url: 'http://backend.example' },
    })
    const wrapper = mountControl()
    await flushPromises()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('http://backend.example')
    expect(storedUrl()).toBe('http://backend.example')
  })

  it('clears a placeholder backend value when there is no default', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ [KEY]: { url: 'http://localhost' } })
    mountControl('')
    await flushPromises()
    expect(localStorage.getItem(LS_KEY)).toBeNull()
    expect(settingsApi.put).toHaveBeenCalledWith(NS, KEY, { url: '' })
  })

  it('caches a placeholder backend value when a default exists', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ [KEY]: { url: 'http://localhost' } })
    mountControl('http://default.example')
    await flushPromises()
    // The default-backed branch caches whatever the backend holds.
    expect(storedUrl()).toBe('http://localhost')
  })

  it('stages a valid URL to localStorage and the backend', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('http://feed.example')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(storedUrl()).toBe('http://feed.example')
    expect(settingsApi.put).toHaveBeenCalledWith(NS, KEY, { url: 'http://feed.example' })
  })

  it('stages an empty URL without validating it', async () => {
    const wrapper = mountControl()
    await flushPromises()
    await wrapper.find('input').setValue('')
    await (wrapper.emitted('stage')![0]![0] as () => unknown)()
    expect(storedUrl()).toBe('')
    expect(settingsApi.put).toHaveBeenCalledWith(NS, KEY, { url: '' })
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
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
