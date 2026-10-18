import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { axe } from 'jest-axe'

const loadDocsLibrary = vi.hoisted(() => vi.fn<() => Promise<unknown>>())
vi.mock('./docsSources', () => ({ loadDocsLibrary }))
// The two outcomes are pinned by their own specs; here they only need to be told apart.
vi.mock('./DocsPage.vue', () => ({
  default: defineComponent({ render: () => h('div', { 'data-testid': 'docs-page' }) }),
}))
vi.mock('./DocsUnavailable.vue', () => ({
  default: defineComponent({ render: () => h('div', { 'data-testid': 'docs-unavailable' }) }),
}))

import DocsRouteView from './DocsRouteView.vue'

enableAutoUnmount(afterEach)

function deferred() {
  let resolve!: (value: unknown) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<unknown>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('DocsRouteView', () => {
  beforeEach(() => {
    loadDocsLibrary.mockReset()
  })

  it('shows a busy cover, and neither outcome, while the library loads', async () => {
    loadDocsLibrary.mockReturnValue(deferred().promise)
    const wrapper = mount(DocsRouteView)
    await flushPromises()

    const loading = wrapper.get('[data-testid="docs-loading"]')
    expect(loading.attributes('aria-busy')).toBe('true')
    expect(loading.text()).toBe('Loading the docs')
    expect(wrapper.find('[data-testid="docs-page"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="docs-unavailable"]').exists()).toBe(false)
  })

  it('mounts the docs page only once the library has loaded', async () => {
    const load = deferred()
    loadDocsLibrary.mockReturnValue(load.promise)
    const wrapper = mount(DocsRouteView)
    await flushPromises()
    expect(wrapper.find('[data-testid="docs-page"]').exists()).toBe(false)

    load.resolve({})
    await flushPromises()

    expect(loadDocsLibrary).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="docs-page"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="docs-loading"]').exists()).toBe(false)
  })

  it('shows the unavailable page, and logs why, when the library cannot load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('HTTP 503')
    loadDocsLibrary.mockRejectedValue(failure)

    const wrapper = mount(DocsRouteView)
    await flushPromises()

    expect(wrapper.find('[data-testid="docs-unavailable"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="docs-page"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="docs-loading"]').exists()).toBe(false)
    expect(consoleError).toHaveBeenCalledWith('[sentinel] docs unavailable:', failure)
  })

  it('has no accessibility violations while loading', async () => {
    loadDocsLibrary.mockReturnValue(deferred().promise)
    const wrapper = mount(DocsRouteView)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
