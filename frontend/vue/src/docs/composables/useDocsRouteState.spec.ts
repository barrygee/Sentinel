import { describe, it, expect, beforeEach } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createDocsTestRouter, mountComposable } from '@/test/docsHarness'
import { MINIMUM_QUERY_LENGTH, useDocsRouteState } from './useDocsRouteState'

async function mountAt(url: string) {
  const router = createDocsTestRouter()
  await router.push(url)
  const { result, wrapper } = mountComposable(() => useDocsRouteState(), [router])
  return { state: result, router, wrapper }
}

describe('useDocsRouteState', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  describe('which page', () => {
    it('reads /docs/ as the welcome page', async () => {
      const { state } = await mountAt('/docs/')
      expect(state.pagePath.value).toBe('index')
      expect(state.page.value?.title).toBe('Welcome to Sentinel')
      expect(state.activeGroup.value?.key).toBe('introduction')
    })

    it('reads /docs (no trailing slash) as the welcome page too', async () => {
      const { state } = await mountAt('/docs')
      expect(state.pagePath.value).toBe('index')
    })

    it('reads a named page and its group', async () => {
      const { state } = await mountAt('/docs/operations')
      expect(state.pagePath.value).toBe('operations')
      expect(state.page.value?.path).toBe('operations')
      expect(state.activeGroup.value?.key).toBe('getting-started')
    })

    it('reads a nested page path', async () => {
      const { state } = await mountAt('/docs/adr/0006-section-containers')
      expect(state.page.value?.path).toBe('adr/0006-section-containers')
      expect(state.activeGroup.value?.key).toBe('develop')
    })

    it('has no page and no active group for an unknown path', async () => {
      const { state } = await mountAt('/docs/does-not-exist')
      expect(state.pagePath.value).toBe('does-not-exist')
      expect(state.page.value).toBeUndefined()
      expect(state.activeGroup.value).toBeUndefined()
    })

    it('follows the route as it changes', async () => {
      const { state, router } = await mountAt('/docs/operations')
      await router.push('/docs/sections')
      expect(state.pagePath.value).toBe('sections')
    })

    it('exposes the library', async () => {
      const { state } = await mountAt('/docs/')
      expect(state.library.pages.length).toBeGreaterThan(0)
    })
  })

  describe('search query', () => {
    it('is empty and inactive without ?q=', async () => {
      const { state } = await mountAt('/docs/operations')
      expect(state.query.value).toBe('')
      expect(state.searchActive.value).toBe(false)
    })

    it('reads ?q= as the query', async () => {
      const { state } = await mountAt('/docs/?q=record%20audio')
      expect(state.query.value).toBe('record audio')
      expect(state.searchActive.value).toBe(true)
    })

    it('is not active for a single character, a blank query, or whitespace padding', async () => {
      expect(MINIMUM_QUERY_LENGTH).toBe(2)
      for (const url of ['/docs/?q=a', '/docs/?q=%20%20%20', '/docs/?q=%20a%20', '/docs/?q=']) {
        const { state } = await mountAt(url)
        expect(state.searchActive.value, url).toBe(false)
      }
    })

    it('is active at exactly two characters, even when padded', async () => {
      const { state } = await mountAt('/docs/?q=%20ab%20')
      expect(state.searchActive.value).toBe(true)
    })

    it('treats a repeated ?q=a&q=b as no query', async () => {
      const { state } = await mountAt('/docs/?q=one&q=two')
      expect(state.query.value).toBe('')
      expect(state.searchActive.value).toBe(false)
    })
  })

  describe('hash', () => {
    it('is empty without a fragment', async () => {
      const { state } = await mountAt('/docs/operations')
      expect(state.hashId.value).toBe('')
    })

    it('strips the # from the fragment', async () => {
      const { state } = await mountAt('/docs/operations#health-checks')
      expect(state.hashId.value).toBe('health-checks')
    })

    it('decodes a percent-encoded fragment', async () => {
      const { state } = await mountAt('/docs/operations#caf%C3%A9')
      expect(state.hashId.value).toBe('café')
    })

    it('falls back to the raw fragment when it is not valid percent-encoding', async () => {
      const { state, router } = await mountAt('/docs/operations#bad%E0%A4%A')
      const rawFragment = router.currentRoute.value.hash.replace(/^#/, '')
      expect(() => decodeURIComponent(rawFragment)).toThrow()
      expect(state.hashId.value).toBe(rawFragment)
    })
  })

  describe('setQuery', () => {
    it('puts the query in the URL', async () => {
      const { state, router } = await mountAt('/docs/operations')
      state.setQuery('record')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/docs/operations?q=record')
    })

    it('replaces rather than pushes, so Back leaves the page', async () => {
      const { state, router } = await mountAt('/air/')
      await router.push('/docs/operations')
      state.setQuery('record')
      await flushPromises()
      router.back()
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/air/')
    })

    it('keeps the fragment and any other query keys', async () => {
      const { state, router } = await mountAt('/docs/operations?keep=1#health')
      state.setQuery('record')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ keep: '1', q: 'record' })
      expect(router.currentRoute.value.hash).toBe('#health')
    })

    it('replaces an existing query', async () => {
      const { state, router } = await mountAt('/docs/?q=old')
      state.setQuery('new')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ q: 'new' })
    })

    it('removes q entirely when cleared, keeping other keys', async () => {
      const { state, router } = await mountAt('/docs/?q=old&keep=1')
      state.setQuery('')
      await flushPromises()
      expect(router.currentRoute.value.query).toEqual({ keep: '1' })
    })

    it('stays on the same page', async () => {
      const { state, router } = await mountAt('/docs/radio-host')
      state.setQuery('sdr')
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/docs/radio-host')
    })
  })
})
