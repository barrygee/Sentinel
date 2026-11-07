import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getNamespace,
  put,
  del,
  getAll,
  getConfigFileStatus,
  notifySettingsChanged,
  SETTINGS_CHANGED_EVENT,
} from './settingsApi'

function mockFetch(impl: (url: string, opts?: RequestInit) => unknown): void {
  global.fetch = vi.fn((url: string | URL | Request, opts?: RequestInit) =>
    Promise.resolve(impl(String(url), opts)),
  ) as unknown as typeof fetch
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('settingsApi.getNamespace', () => {
  it('returns the parsed namespace object on a successful response', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve({ theme: 'dark' }) }))
    await expect(getNamespace('ui')).resolves.toEqual({ theme: 'dark' })
    expect(global.fetch).toHaveBeenCalledWith('/api/settings/ui')
  })

  it('returns null on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve({}) }))
    await expect(getNamespace('ui')).resolves.toBeNull()
  })

  it('returns null when the fetch rejects', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(getNamespace('ui')).resolves.toBeNull()
  })
})

describe('settingsApi.getNamespace sharing', () => {
  /** A fetch stub whose responses are released by hand, oldest request first. */
  function holdFetch(): { respond: (body: Record<string, unknown>) => void } {
    const pendingResponses: ((response: unknown) => void)[] = []
    global.fetch = vi.fn((_url: string | URL | Request, options?: RequestInit) =>
      options?.method
        ? Promise.resolve({ ok: true })
        : new Promise((resolve) => pendingResponses.push(resolve)),
    ) as unknown as typeof fetch
    return {
      respond: (body) =>
        pendingResponses.shift()?.({ ok: true, json: () => Promise.resolve(body) }),
    }
  }

  /** How many GETs reached the network. */
  function readCount(): number {
    return vi.mocked(global.fetch).mock.calls.filter(([, options]) => !options?.method).length
  }

  it('sends one request for callers overlapping on a namespace', async () => {
    const { respond } = holdFetch()
    const firstRead = getNamespace('sdr')
    const secondRead = getNamespace('sdr')
    respond({ gain: 42 })
    await expect(firstRead).resolves.toEqual({ gain: 42 })
    await expect(secondRead).resolves.toEqual({ gain: 42 })
    expect(readCount()).toBe(1)
  })

  it('gives each caller its own copy to change', async () => {
    const { respond } = holdFetch()
    const firstRead = getNamespace('sdr')
    const secondRead = getNamespace('sdr')
    respond({ nested: { gain: 42 } })
    const firstSettings = (await firstRead) as { nested: { gain: number } }
    firstSettings.nested.gain = 0
    await expect(secondRead).resolves.toEqual({ nested: { gain: 42 } })
  })

  it('keeps different namespaces on separate requests', async () => {
    const { respond } = holdFetch()
    const sdrRead = getNamespace('sdr')
    const airRead = getNamespace('air')
    expect(readCount()).toBe(2)
    respond({ namespace: 'sdr' })
    respond({ namespace: 'air' })
    await expect(sdrRead).resolves.toEqual({ namespace: 'sdr' })
    await expect(airRead).resolves.toEqual({ namespace: 'air' })
  })

  it('reads afresh once the previous read has finished', async () => {
    const { respond } = holdFetch()
    const firstRead = getNamespace('sdr')
    respond({ gain: 1 })
    await firstRead
    const secondRead = getNamespace('sdr')
    respond({ gain: 2 })
    await expect(secondRead).resolves.toEqual({ gain: 2 })
    expect(readCount()).toBe(2)
  })

  it('retries after a failed read rather than keeping its null', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(getNamespace('sdr')).resolves.toBeNull()
    mockFetch(() => ({ ok: true, json: () => Promise.resolve({ gain: 3 }) }))
    await expect(getNamespace('sdr')).resolves.toEqual({ gain: 3 })
  })

  it.each([
    ['put', () => put('sdr', 'gain', 2)],
    ['del', () => del('sdr', 'gain')],
  ])('does not hand a read from before a %s to a later caller', async (_name, write) => {
    const { respond } = holdFetch()
    const readBeforeWrite = getNamespace('sdr')
    await write()
    const readAfterWrite = getNamespace('sdr')
    expect(readCount()).toBe(2)
    respond({ gain: 1 })
    respond({ gain: 2 })
    await expect(readBeforeWrite).resolves.toEqual({ gain: 1 })
    await expect(readAfterWrite).resolves.toEqual({ gain: 2 })
  })

  it('keeps a newer read shared when an older one finishes after a write', async () => {
    const { respond } = holdFetch()
    const readBeforeWrite = getNamespace('sdr')
    await put('sdr', 'gain', 2)
    const newerRead = getNamespace('sdr')
    respond({ gain: 1 })
    await readBeforeWrite
    const overlappingRead = getNamespace('sdr')
    expect(readCount()).toBe(2)
    respond({ gain: 2 })
    await expect(newerRead).resolves.toEqual({ gain: 2 })
    await expect(overlappingRead).resolves.toEqual({ gain: 2 })
  })
})

describe('settingsApi.put', () => {
  it('PUTs the JSON-wrapped value to the namespace/key endpoint', async () => {
    mockFetch(() => ({ ok: true }))
    await put('sdr', 'gain', 42)
    expect(global.fetch).toHaveBeenCalledWith('/api/settings/sdr/gain', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 42 }),
    })
  })

  it('swallows a rejected fetch without throwing', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(put('sdr', 'gain', 1)).resolves.toBeUndefined()
  })
})

describe('settingsApi.del', () => {
  it('issues a DELETE to the namespace/key endpoint', async () => {
    mockFetch(() => ({ ok: true }))
    await del('sdr', 'gain')
    expect(global.fetch).toHaveBeenCalledWith('/api/settings/sdr/gain', { method: 'DELETE' })
  })

  it('swallows a rejected fetch without throwing', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(del('sdr', 'gain')).resolves.toBeUndefined()
  })
})

describe('settingsApi.getAll', () => {
  it('returns all namespaces on a successful response', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve({ sdr: { gain: 1 } }) }))
    await expect(getAll()).resolves.toEqual({ sdr: { gain: 1 } })
    expect(global.fetch).toHaveBeenCalledWith('/api/settings')
  })

  it('returns null on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve({}) }))
    await expect(getAll()).resolves.toBeNull()
  })

  it('returns null when the fetch rejects', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(getAll()).resolves.toBeNull()
  })
})

describe('settingsApi change notifications', () => {
  function listenForChange(): ReturnType<typeof vi.fn<EventListener>> {
    const listener = vi.fn<EventListener>()
    document.addEventListener(SETTINGS_CHANGED_EVENT, listener)
    return listener
  }

  it('notifySettingsChanged dispatches the settings-changed document event', () => {
    const listener = listenForChange()
    notifySettingsChanged()
    expect(listener).toHaveBeenCalledTimes(1)
    document.removeEventListener(SETTINGS_CHANGED_EVENT, listener)
  })

  it('put announces the change after the request', async () => {
    mockFetch(() => ({ ok: true }))
    const listener = listenForChange()
    await put('sdr', 'gain', 42)
    expect(listener).toHaveBeenCalledTimes(1)
    document.removeEventListener(SETTINGS_CHANGED_EVENT, listener)
  })

  it('del announces the change after the request', async () => {
    mockFetch(() => ({ ok: true }))
    const listener = listenForChange()
    await del('sdr', 'gain')
    expect(listener).toHaveBeenCalledTimes(1)
    document.removeEventListener(SETTINGS_CHANGED_EVENT, listener)
  })

  it('does not announce a change when the request never left the browser', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    const listener = listenForChange()
    await put('sdr', 'gain', 1)
    await del('sdr', 'gain')
    expect(listener).not.toHaveBeenCalled()
    document.removeEventListener(SETTINGS_CHANGED_EVENT, listener)
  })
})

describe('settingsApi.getConfigFileStatus', () => {
  const STATUS = {
    path: '/app/backend/data/sentinel_config.json',
    syncing: true,
    external_edit_at: 42,
  }

  it('returns the live config file status', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(STATUS) }))
    await expect(getConfigFileStatus()).resolves.toEqual(STATUS)
    expect(global.fetch).toHaveBeenCalledWith('/api/settings/config/file-status')
  })

  it('returns null on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve(STATUS) }))
    await expect(getConfigFileStatus()).resolves.toBeNull()
  })

  it('returns null when the body has no numeric external_edit_at', async () => {
    // e.g. the SPA served against an older backend, or a catch-all stub answering {}.
    mockFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ path: 'x', external_edit_at: '42' }),
    }))
    await expect(getConfigFileStatus()).resolves.toBeNull()
  })

  it('returns null when the request fails', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
    await expect(getConfigFileStatus()).resolves.toBeNull()
  })
})
