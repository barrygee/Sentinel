import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  listSearchRanges,
  createSearchRange,
  updateSearchRange,
  deleteSearchRange,
  type SdrSearchRange,
  type SdrSearchRangeInput,
} from './sdrSearchApi'

function mockFetch(impl: (url: string, opts?: RequestInit) => unknown): void {
  global.fetch = vi.fn((url: string | URL | Request, opts?: RequestInit) =>
    Promise.resolve(impl(String(url), opts)),
  ) as unknown as typeof fetch
}

const sampleRange: SdrSearchRange = {
  id: 7,
  label: 'Airband',
  low_hz: 118_000_000,
  high_hz: 137_000_000,
  step_hz: 25_000,
  mode: 'AM',
  threshold_dbfs: -60,
  dwell_ms: 200,
  band_name: 'VHF Air',
  enabled: true,
  notes: '',
  sort_order: 0,
}

const sampleInput: SdrSearchRangeInput = {
  label: 'Airband',
  low_hz: 118_000_000,
  high_hz: 137_000_000,
  step_hz: 25_000,
  mode: 'AM',
  threshold_dbfs: -60,
  dwell_ms: 200,
  band_name: 'VHF Air',
  enabled: true,
  notes: '',
  sort_order: 0,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('listSearchRanges', () => {
  it('returns the parsed ranges on success', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve([sampleRange]) }))
    await expect(listSearchRanges()).resolves.toEqual([sampleRange])
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr/search-ranges')
  })

  it('returns an empty array on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve([]) }))
    await expect(listSearchRanges()).resolves.toEqual([])
  })
})

describe('createSearchRange', () => {
  it('POSTs the body and returns the created range', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(sampleRange) }))
    await expect(createSearchRange(sampleInput)).resolves.toEqual(sampleRange)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr/search-ranges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleInput),
    })
  })

  it('returns null on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve({}) }))
    await expect(createSearchRange(sampleInput)).resolves.toBeNull()
  })
})

describe('updateSearchRange', () => {
  it('PUTs the body to the id endpoint and returns the updated range', async () => {
    mockFetch(() => ({ ok: true, json: () => Promise.resolve(sampleRange) }))
    await expect(updateSearchRange(7, sampleInput)).resolves.toEqual(sampleRange)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr/search-ranges/7', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sampleInput),
    })
  })

  it('returns null on a non-OK response', async () => {
    mockFetch(() => ({ ok: false, json: () => Promise.resolve({}) }))
    await expect(updateSearchRange(7, sampleInput)).resolves.toBeNull()
  })
})

describe('deleteSearchRange', () => {
  it('issues a DELETE and returns true on success', async () => {
    mockFetch(() => ({ ok: true }))
    await expect(deleteSearchRange(7)).resolves.toBe(true)
    expect(global.fetch).toHaveBeenCalledWith('/api/sdr/search-ranges/7', { method: 'DELETE' })
  })

  it('returns false on a non-OK response', async () => {
    mockFetch(() => ({ ok: false }))
    await expect(deleteSearchRange(7)).resolves.toBe(false)
  })
})
