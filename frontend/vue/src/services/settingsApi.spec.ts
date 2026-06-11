import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getNamespace, put, del, getAll } from './settingsApi'

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
