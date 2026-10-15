import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createDocsTestWebRouter, mountComposable } from '@/test/docsHarness'
import { docsReturn } from '@/router/docsRoute'
import { useDocsReturn } from './useDocsReturn'

/** jsdom has no layout, so say an element is on screen the way a browser would. */
function showOnScreen(element: HTMLElement): void {
  element.getClientRects = () => [{}] as unknown as DOMRectList
}

async function setup(returnPath: string | null = '/air/') {
  window.history.replaceState(null, '', '/')
  const router = createDocsTestWebRouter()
  await router.push('/air/')
  await router.push('/doc/operations')
  docsReturn.path = returnPath
  const { result } = mountComposable(() => useDocsReturn(), [router])
  return { router, closeDocs: result.closeDocs }
}

describe('useDocsReturn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    docsReturn.reset()
    document.body.innerHTML = '<main id="main" tabindex="-1"></main>'
  })

  afterEach(() => {
    vi.useRealTimers()
    docsReturn.reset()
    document.body.innerHTML = ''
  })

  describe('how it leaves', () => {
    it('goes back when the previous history entry is the page to return to', async () => {
      const { router, closeDocs } = await setup('/air/')
      const back = vi.spyOn(router, 'back')
      const replace = vi.spyOn(router, 'replace')
      expect((window.history.state as { back: string }).back).toBe('/air/')
      closeDocs()
      expect(back).toHaveBeenCalledTimes(1)
      expect(replace).not.toHaveBeenCalled()
    })

    it('replaces the docs entry with the return path when history does not lead there', async () => {
      const { router, closeDocs } = await setup('/')
      const back = vi.spyOn(router, 'back')
      closeDocs()
      await flushPromises()
      expect(back).not.toHaveBeenCalled()
      expect(router.currentRoute.value.path).toBe('/')
    })

    it('returns to the site root when nothing recorded where Docs was opened from', async () => {
      const { router, closeDocs } = await setup(null)
      const replace = vi.spyOn(router, 'replace')
      closeDocs()
      await flushPromises()
      expect(replace).toHaveBeenCalledWith('/')
    })

    it('really navigates back to the section when closing', async () => {
      const { router, closeDocs } = await setup('/air/')
      closeDocs()
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/air/'))
    })

    it('replaces when there is no history state at all', async () => {
      const { router, closeDocs } = await setup('/air/')
      window.history.replaceState(null, '', window.location.href)
      const back = vi.spyOn(router, 'back')
      const replace = vi.spyOn(router, 'replace')
      closeDocs()
      expect(back).not.toHaveBeenCalled()
      expect(replace).toHaveBeenCalledWith('/air/')
    })
  })

  describe('closing twice', () => {
    it('ignores a second close before the first navigation has landed', async () => {
      const { router, closeDocs } = await setup('/')
      const replace = vi.spyOn(router, 'replace')
      closeDocs()
      closeDocs()
      closeDocs()
      expect(replace).toHaveBeenCalledTimes(1)
    })

    it('does not call router.back() twice (which would leave the app)', async () => {
      const { router, closeDocs } = await setup('/air/')
      const back = vi.spyOn(router, 'back').mockImplementation(() => undefined)
      closeDocs()
      closeDocs()
      expect(back).toHaveBeenCalledTimes(1)
    })

    it('can close again once the navigation has landed', async () => {
      const { router, closeDocs } = await setup('/')
      closeDocs()
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/')
      await router.push('/doc/operations')
      // The page before this one is now "/", the return path, so closing goes back.
      const back = vi.spyOn(router, 'back').mockImplementation(() => undefined)
      closeDocs()
      expect(back).toHaveBeenCalledTimes(1)
    })
  })

  describe('where focus goes afterwards', () => {
    it('returns focus to the control that opened Docs when it is still on screen', async () => {
      const opener = document.createElement('button')
      document.body.appendChild(opener)
      showOnScreen(opener)
      docsReturn.opener = opener
      const { closeDocs } = await setup('/')
      docsReturn.opener = opener
      closeDocs()
      await flushPromises()
      vi.runAllTimers()
      expect(document.activeElement).toBe(opener)
    })

    it("waits a tick after the navigation, so the route's own focus handling runs first", async () => {
      const opener = document.createElement('button')
      document.body.appendChild(opener)
      showOnScreen(opener)
      const { closeDocs } = await setup('/')
      docsReturn.opener = opener
      closeDocs()
      await flushPromises()
      expect(document.activeElement).not.toBe(opener)
      vi.runAllTimers()
      expect(document.activeElement).toBe(opener)
    })

    it('falls back to the main region when the opener is no longer in the page', async () => {
      const opener = document.createElement('button')
      showOnScreen(opener)
      const { closeDocs } = await setup('/')
      docsReturn.opener = opener // never attached: not connected
      closeDocs()
      await flushPromises()
      vi.runAllTimers()
      expect(document.activeElement).toBe(document.getElementById('main'))
    })

    it('falls back to the main region when the opener is hidden', async () => {
      const opener = document.createElement('button')
      document.body.appendChild(opener) // connected, but no layout boxes: hidden
      const { closeDocs } = await setup('/')
      docsReturn.opener = opener
      closeDocs()
      await flushPromises()
      vi.runAllTimers()
      expect(document.activeElement).toBe(document.getElementById('main'))
    })

    it('falls back to the main region when nothing opened Docs (cold load)', async () => {
      const { closeDocs } = await setup('/')
      closeDocs()
      await flushPromises()
      vi.runAllTimers()
      expect(document.activeElement).toBe(document.getElementById('main'))
    })

    it('does not fail when there is no main region either', async () => {
      document.body.innerHTML = ''
      const { closeDocs } = await setup('/')
      closeDocs()
      await flushPromises()
      expect(() => vi.runAllTimers()).not.toThrow()
    })

    it('restores focus once per close, not on later navigations', async () => {
      const opener = document.createElement('button')
      document.body.appendChild(opener)
      showOnScreen(opener)
      const focus = vi.spyOn(opener, 'focus')
      const { router, closeDocs } = await setup('/')
      docsReturn.opener = opener
      closeDocs()
      await flushPromises()
      vi.runAllTimers()
      expect(focus).toHaveBeenCalledTimes(1)
      await router.push('/air/')
      await router.push('/')
      vi.runAllTimers()
      expect(focus).toHaveBeenCalledTimes(1)
    })
  })
})
