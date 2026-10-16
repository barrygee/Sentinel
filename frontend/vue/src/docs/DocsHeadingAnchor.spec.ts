import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import * as clipboard from './composables/useClipboardCopy'
import DocsHeadingAnchor from './DocsHeadingAnchor.vue'
import { useDocsStore } from './docsStore'

async function mountAnchor(url = '/docs/operations') {
  const pinia = createPinia()
  setActivePinia(pinia)
  const mounted = await mountWithRouter(DocsHeadingAnchor, {
    url,
    props: { headingId: 'health-checks', headingText: 'Health checks' },
    plugins: [pinia],
  })
  return { ...mounted, store: useDocsStore() }
}

describe('DocsHeadingAnchor', () => {
  let copy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    copy = vi.spyOn(clipboard, 'copyTextToClipboard').mockResolvedValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is a link to the heading, named after it', async () => {
    const { wrapper } = await mountAnchor()
    const anchor = wrapper.get('a')
    expect(anchor.attributes('href')).toBe('#health-checks')
    expect(anchor.attributes('aria-label')).toBe('Link to section: Health checks')
    expect(wrapper.get('svg').attributes('aria-hidden')).toBe('true')
  })

  it('moves to the heading without a page load', async () => {
    const { wrapper, router } = await mountAnchor()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    wrapper.get('a').element.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(router.currentRoute.value.path).toBe('/docs/operations')
    expect(router.currentRoute.value.hash).toBe('#health-checks')
  })

  it('replaces the history entry rather than adding one', async () => {
    const { wrapper, router } = await mountAnchor()
    const replace = vi.spyOn(router, 'replace')
    const push = vi.spyOn(router, 'push')
    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenCalledTimes(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('copies the full URL of the section and says so', async () => {
    const { wrapper, store } = await mountAnchor()
    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/docs/operations#health-checks`)
    await vi.advanceTimersByTimeAsync(60)
    expect(store.announcement).toBe('Link to section copied')
  })

  it('keeps the search query in the copied link', async () => {
    const { wrapper } = await mountAnchor('/docs/operations?q=logs')
    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenCalledWith(
      `${window.location.origin}/docs/operations?q=logs#health-checks`,
    )
  })

  it('replaces an earlier fragment in the copied link', async () => {
    const { wrapper } = await mountAnchor('/docs/operations#something-else')
    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/docs/operations#health-checks`)
  })

  it('does not announce a copy that did not happen', async () => {
    copy.mockResolvedValue(false)
    const { wrapper, store } = await mountAnchor()
    await wrapper.get('a').trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(100)
    expect(store.announcement).toBe('')
  })

  it('still moves to the heading when the copy fails', async () => {
    copy.mockResolvedValue(false)
    const { wrapper, router } = await mountAnchor()
    await wrapper.get('a').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.hash).toBe('#health-checks')
  })

  it('has no accessibility violations', async () => {
    vi.useRealTimers() // axe schedules with timers
    const { wrapper } = await mountAnchor()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
