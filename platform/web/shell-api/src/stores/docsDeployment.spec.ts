import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDocsDeploymentStore } from './docsDeployment'

function stubFetch(response: Response | Error) {
  const fetchStub =
    response instanceof Response
      ? vi.fn().mockResolvedValue(response)
      : vi.fn().mockRejectedValue(response)
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('docsDeployment store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  afterEach(() => vi.unstubAllGlobals())

  it('offers Docs until boot has asked core', () => {
    expect(useDocsDeploymentStore().deployed).toBe(true)
  })

  it('asks core at /api/app/docs and offers Docs when it says one is deployed', async () => {
    const fetchStub = stubFetch(jsonResponse({ deployed: true, available: true }))
    const store = useDocsDeploymentStore()

    await store.load()

    expect(fetchStub).toHaveBeenCalledWith('/api/app/docs')
    expect(store.deployed).toBe(true)
  })

  it('still offers Docs while a deployed service is down (the page says it is unavailable)', async () => {
    stubFetch(jsonResponse({ deployed: true, available: false }))
    const store = useDocsDeploymentStore()

    await store.load()

    expect(store.deployed).toBe(true)
  })

  it('hides Docs when core says none is deployed', async () => {
    stubFetch(jsonResponse({ deployed: false, available: false }))
    const store = useDocsDeploymentStore()

    await store.load()

    expect(store.deployed).toBe(false)
  })

  it.each([
    ['a truthy non-boolean', { deployed: 'yes' }],
    ['a missing field', {}],
  ])('hides Docs for %s', async (_label, body) => {
    stubFetch(jsonResponse(body))
    const store = useDocsDeploymentStore()

    await store.load()

    expect(store.deployed).toBe(false)
  })

  it('hides Docs, without throwing, when core answers with an error status', async () => {
    stubFetch(jsonResponse({ detail: 'nope' }, 404))
    const store = useDocsDeploymentStore()

    await expect(store.load()).resolves.toBeUndefined()
    expect(store.deployed).toBe(false)
  })

  it('hides Docs, without throwing, when core cannot be reached', async () => {
    stubFetch(new TypeError('Failed to fetch'))
    const store = useDocsDeploymentStore()

    await expect(store.load()).resolves.toBeUndefined()
    expect(store.deployed).toBe(false)
  })

  it('hides Docs when the body is not JSON', async () => {
    stubFetch(new Response('<html>', { status: 200 }))
    const store = useDocsDeploymentStore()

    await store.load()

    expect(store.deployed).toBe(false)
  })
})
