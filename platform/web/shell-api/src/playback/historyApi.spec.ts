import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchHistoryCoverage, fetchHistorySamples, fetchHistoryStatus } from './historyApi'

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response
}

describe('historyApi', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks for samples in whole milliseconds with the area', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ entities: {} }))
    const controller = new AbortController()
    const chunk = await fetchHistorySamples('sea', 1000.7, 2000.2, {
      bbox: '50,-1,52,1',
      signal: controller.signal,
    })
    expect(chunk).toEqual({ entities: {} })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sea/history/samples?from=1000&to=2000&bbox=50%2C-1%2C52%2C1',
      { signal: controller.signal },
    )
  })

  it('leaves the area out when there is none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}))
    await fetchHistorySamples('air', 1, 2)
    expect(fetchMock).toHaveBeenCalledWith('/api/air/history/samples?from=1&to=2', undefined)
  })

  it('reads coverage and status without parameters', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ buckets: [] }))
    expect(await fetchHistoryCoverage('land')).toEqual({ buckets: [] })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/land/history/coverage', undefined)
    fetchMock.mockResolvedValue(jsonResponse({ enabled: true }))
    expect(await fetchHistoryStatus('space')).toEqual({ enabled: true })
    expect(fetchMock).toHaveBeenLastCalledWith('/api/space/history/status', undefined)
  })

  it('an error status is no data', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'nope' }, false))
    expect(await fetchHistoryStatus('air')).toBeNull()
  })

  it('a network failure is no data', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    expect(await fetchHistoryCoverage('air')).toBeNull()
  })

  it('an abort is passed on, not swallowed', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    await expect(fetchHistorySamples('air', 1, 2)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
