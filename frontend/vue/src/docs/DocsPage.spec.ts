import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'

const closeDocs = vi.hoisted(() => vi.fn())
vi.mock('./composables/useDocsReturn', () => ({ useDocsReturn: () => ({ closeDocs }) }))
vi.mock('./renderMermaid', () => ({
  renderMermaidDiagram: vi.fn().mockRejectedValue(new Error('not drawn in this spec')),
}))
vi.mock('./docsSources', async () => {
  const fixtures = await import('@/test/docsFixtures')
  const library = fixtures.buildFixtureDocsLibrary()
  return { getDocsLibrary: () => library, docsImageUrls: {} }
})

import { createDocsTestRouter } from '@/test/docsHarness'
import DocsPage from './DocsPage.vue'
import { useDocsStore } from './docsStore'

async function mountPage(url: string) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createDocsTestRouter()
  await router.push(url)
  const wrapper = mount(DocsPage, {
    global: { plugins: [router, pinia] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router, store: useDocsStore() }
}

/** Lets the focus watcher (post flush + nextTick) finish. */
async function settle(wrapper: VueWrapper): Promise<void> {
  await flushPromises()
  await wrapper.vm.$nextTick()
  await flushPromises()
}

function pressEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

function headingText(wrapper: VueWrapper): string {
  return wrapper.get('h1').text()
}

describe('DocsPage', () => {
  beforeEach(() => {
    closeDocs.mockReset()
    document.title = 'SENTINEL — DOCS'
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  describe('a page', () => {
    it("shows the page title as the one h1, with the markdown title's anchor id", async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(wrapper.findAll('h1')).toHaveLength(1)
      expect(headingText(wrapper)).toBe('Check logs')
      expect(wrapper.get('h1').attributes('id')).toBe('check-logs')
    })

    it("shows the page's content in the article", async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(wrapper.get('article').text()).toContain('Read the logs.')
      expect(wrapper.findAll('article h2').map((heading) => heading.text())).toEqual([
        'Health checks',
      ])
    })

    it('shows the welcome page at /doc/', async () => {
      const { wrapper } = await mountPage('/doc/')
      expect(headingText(wrapper)).toBe('Welcome to Sentinel')
      expect(wrapper.get('article').text()).toContain('Start here.')
    })

    it('gives a breadcrumb of group (linked to its first page) and page', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const breadcrumb = wrapper.get('nav[aria-label="Breadcrumb"]')
      const link = breadcrumb.get('a')
      expect(link.text()).toBe('Use Sentinel')
      expect(link.attributes('href')).toBe('/doc/sections')
      expect(breadcrumb.get('[aria-current="page"]').text()).toBe('Check logs')
    })

    it("shows the group rail with the page's group current", async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const current = wrapper.findAll(
        'nav[aria-label="Documentation sections"] a[aria-current="true"]',
      )
      expect(current).toHaveLength(1)
      expect(current[0]?.attributes('aria-label')).toBe('Use Sentinel')
    })

    it("lists the group's pages with the current one marked", async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const list = wrapper.get('nav[aria-label="Pages in Use Sentinel"]')
      expect(list.get('a[aria-current="page"]').text()).toBe('Check logs')
    })

    it('shows previous and next across groups', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(wrapper.get('a[rel="prev"]').text()).toContain('What each section does')
      expect(wrapper.get('a[rel="next"]').text()).toContain('Contributing')
    })

    it('shows only next on the first page', async () => {
      const { wrapper } = await mountPage('/doc/')
      expect(wrapper.find('a[rel="prev"]').exists()).toBe(false)
      expect(wrapper.find('a[rel="next"]').exists()).toBe(true)
    })

    it('has exactly one live region', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(wrapper.findAll('[role="status"]')).toHaveLength(1)
    })

    it('is a light-island reading page', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(wrapper.get('[data-testid="docs-page"]').classes()).toEqual(
        expect.arrayContaining(['doc-page', 'theme-light', 'light-island']),
      )
    })

    it('sets the window title after the page renders', async () => {
      await mountPage('/doc/operations')
      expect(document.title).toBe('Check logs · Docs · Sentinel')
    })

    it('follows the route to another page', async () => {
      const { wrapper, router } = await mountPage('/doc/operations')
      await router.push('/doc/sections')
      await settle(wrapper)
      expect(headingText(wrapper)).toBe('What each section does')
      expect(document.title).toBe('What each section does · Docs · Sentinel')
    })

    it('tells the store the docs page is on screen only while it is mounted', async () => {
      const { wrapper, store } = await mountPage('/doc/operations')
      expect(store.active).toBe(true)
      wrapper.unmount()
      expect(store.active).toBe(false)
    })
  })

  describe('search', () => {
    it('replaces the page with search results under a SEARCH RESULTS heading', async () => {
      const { wrapper } = await mountPage('/doc/?q=air')
      expect(headingText(wrapper)).toBe('SEARCH RESULTS')
      expect(wrapper.find('article').exists()).toBe(false)
      expect(wrapper.get('.doc-search-results__summary').text()).toContain('for “air”')
      expect(wrapper.findAll('.doc-search-result').length).toBeGreaterThan(0)
    })

    it('gives the search heading no anchor id', async () => {
      const { wrapper } = await mountPage('/doc/?q=air')
      expect(wrapper.get('h1').attributes('id')).toBeUndefined()
    })

    it('has a Docs > Search breadcrumb and a "Search results" window title', async () => {
      const { wrapper } = await mountPage('/doc/?q=air')
      const breadcrumb = wrapper.get('nav[aria-label="Breadcrumb"]')
      expect(breadcrumb.get('a').attributes('href')).toBe('/doc/')
      expect(breadcrumb.get('[aria-current="page"]').text()).toBe('Search')
      expect(document.title).toBe('Search results · Docs · Sentinel')
    })

    it('hides "On this page" and previous/next while showing results', async () => {
      const { wrapper } = await mountPage('/doc/operations?q=air')
      expect(wrapper.find('nav[aria-label="On this page"]').exists()).toBe(false)
      expect(wrapper.find('nav[aria-label="Previous and next page"]').exists()).toBe(false)
    })

    it('says so when nothing matches', async () => {
      const { wrapper } = await mountPage('/doc/?q=zzzzzz')
      expect(wrapper.get('.doc-search-results__empty').text()).toBe('NO RESULTS FOR “ZZZZZZ”')
    })

    it('does not search for a single character, and keeps showing the page', async () => {
      const { wrapper } = await mountPage('/doc/operations?q=a')
      expect(headingText(wrapper)).toBe('Check logs')
      expect(wrapper.find('.doc-search-results').exists()).toBe(false)
    })

    it('finds a section containing any one of several words', async () => {
      const { wrapper } = await mountPage('/doc/?q=backups%20ships')
      const links = wrapper.findAll('.doc-search-result a').map((link) => link.attributes('href'))
      expect(links).toContain('/doc/operations#backups')
      expect(links).toContain('/doc/sections#sea')
    })

    it('announces the result count through the one live region once typing settles', async () => {
      vi.useFakeTimers()
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createDocsTestRouter()
      await router.push('/doc/?q=backups')
      const wrapper = mount(DocsPage, {
        global: { plugins: [router, pinia] },
        attachTo: document.body,
      })
      await vi.advanceTimersByTimeAsync(600)
      expect(wrapper.get('[role="status"]').text()).toBe('1 result')
    })

    it('typing in the search box searches the docs and updates the URL', async () => {
      vi.useFakeTimers()
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createDocsTestRouter()
      await router.push('/doc/operations')
      const wrapper = mount(DocsPage, {
        global: { plugins: [router, pinia] },
        attachTo: document.body,
      })
      await wrapper.get('input[type="search"]').setValue('backups')
      await vi.advanceTimersByTimeAsync(200)
      expect(router.currentRoute.value.query.q).toBe('backups')
      expect(wrapper.get('h1').text()).toBe('SEARCH RESULTS')
    })

    it('clearing the search box brings the page back', async () => {
      vi.useFakeTimers()
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createDocsTestRouter()
      await router.push('/doc/operations?q=backups')
      const wrapper = mount(DocsPage, {
        global: { plugins: [router, pinia] },
        attachTo: document.body,
      })
      await wrapper.get('input[type="search"]').trigger('keydown', { key: 'Escape' })
      await vi.advanceTimersByTimeAsync(10)
      expect(router.currentRoute.value.query.q).toBeUndefined()
      expect(wrapper.get('h1').text()).toBe('Check logs')
    })

    it('puts the query in the search box on a cold load', async () => {
      const { wrapper } = await mountPage('/doc/?q=backups')
      expect((wrapper.get('input[type="search"]').element as HTMLInputElement).value).toBe(
        'backups',
      )
    })
  })

  describe('page not found', () => {
    it('says so under a PAGE NOT FOUND heading with the address and a way on', async () => {
      const { wrapper } = await mountPage('/doc/use/missing')
      expect(headingText(wrapper)).toBe('PAGE NOT FOUND')
      expect(wrapper.get('.doc-not-found code').text()).toBe('/doc/use/missing')
      expect(wrapper.get('.doc-not-found a').attributes('href')).toBe('/doc/')
      expect(wrapper.find('article').exists()).toBe(false)
    })

    it('has a Docs > Page not found breadcrumb and window title', async () => {
      const { wrapper } = await mountPage('/doc/missing')
      const breadcrumb = wrapper.get('nav[aria-label="Breadcrumb"]')
      expect(breadcrumb.get('a').text()).toBe('Docs')
      expect(breadcrumb.get('[aria-current="page"]').text()).toBe('Page not found')
      expect(document.title).toBe('Page not found · Docs · Sentinel')
    })

    it('puts focus in its own search box, guessing the last part of the address', async () => {
      const { wrapper } = await mountPage('/doc/use/missing')
      const field = wrapper.get('.doc-not-found input').element as HTMLInputElement
      expect(document.activeElement).toBe(field)
      expect(field.value).toBe('missing')
    })

    it("marks no group current and lists the first group's pages", async () => {
      const { wrapper } = await mountPage('/doc/missing')
      expect(
        wrapper.findAll('nav[aria-label="Documentation sections"] [aria-current]'),
      ).toHaveLength(0)
      expect(wrapper.find('nav[aria-label="Pages in Get started"]').exists()).toBe(true)
      expect(wrapper.get('.doc-disclosure__button').text()).toContain('Pages in Docs')
    })

    it('has no "On this page" and no previous/next', async () => {
      const { wrapper } = await mountPage('/doc/missing')
      expect(wrapper.find('nav[aria-label="On this page"]').exists()).toBe(false)
      expect(wrapper.find('nav[aria-label="Previous and next page"]').exists()).toBe(false)
    })

    it('searches when its search box is used', async () => {
      const { wrapper, router } = await mountPage('/doc/use/missing')
      await wrapper.get('.doc-not-found input').trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(router.currentRoute.value.query.q).toBe('missing')
      expect(headingText(wrapper)).toBe('SEARCH RESULTS')
    })

    it('shows search results (not the not-found page) for an unknown path with a query', async () => {
      const { wrapper } = await mountPage('/doc/missing?q=air')
      expect(headingText(wrapper)).toBe('SEARCH RESULTS')
      expect(wrapper.find('.doc-not-found').exists()).toBe(false)
    })
  })

  describe('the navigation columns', () => {
    it('are shown by default', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(wrapper.find('nav[aria-label="Documentation sections"]').exists()).toBe(true)
      expect(wrapper.find('aside[aria-label="Documentation navigation"]').exists()).toBe(true)
      expect(wrapper.get('.doc-body').classes()).not.toContain('doc-body--no-sidebar')
    })

    it('are hidden when the footer button closes them, leaving the content', async () => {
      const { wrapper, store } = await mountPage('/doc/operations')
      store.toggleSidebar()
      await flushPromises()
      expect(wrapper.find('nav[aria-label="Documentation sections"]').exists()).toBe(false)
      expect(wrapper.find('aside[aria-label="Documentation navigation"]').exists()).toBe(false)
      expect(wrapper.get('.doc-body').classes()).toContain('doc-body--no-sidebar')
      expect(headingText(wrapper)).toBe('Check logs')
    })

    it('come back when toggled again', async () => {
      const { wrapper, store } = await mountPage('/doc/operations')
      store.toggleSidebar()
      store.toggleSidebar()
      await flushPromises()
      expect(wrapper.find('aside[aria-label="Documentation navigation"]').exists()).toBe(true)
    })

    it('close the phone page list when a new page opens', async () => {
      const { wrapper, router } = await mountPage('/doc/operations')
      const button = wrapper.get('.doc-sidebar .doc-disclosure__button')
      await button.trigger('click')
      expect(button.attributes('aria-expanded')).toBe('true')
      await router.push('/doc/sections')
      await flushPromises()
      expect(wrapper.get('.doc-sidebar .doc-disclosure__button').attributes('aria-expanded')).toBe(
        'false',
      )
    })
  })

  describe('Escape', () => {
    it('closes the docs', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      pressEscape(wrapper.get('article').element)
      expect(closeDocs).toHaveBeenCalledTimes(1)
    })

    it('closes the docs from the heading, where focus starts', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      pressEscape(wrapper.get('h1').element)
      expect(closeDocs).toHaveBeenCalledTimes(1)
    })

    it('does not close while the reader is in a text field', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const textarea = document.createElement('textarea')
      wrapper.get('[data-testid="docs-page"]').element.appendChild(textarea)
      pressEscape(textarea)
      expect(closeDocs).not.toHaveBeenCalled()
    })

    it('does not close while a select or editable region has the key', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const root = wrapper.get('[data-testid="docs-page"]').element
      const select = document.createElement('select')
      const editable = document.createElement('div')
      editable.setAttribute('contenteditable', 'true')
      root.append(select, editable)
      pressEscape(select)
      pressEscape(editable)
      expect(closeDocs).not.toHaveBeenCalled()
    })

    it('clears the search box first and only a second Escape closes the docs', async () => {
      const { wrapper } = await mountPage('/doc/?q=air')
      const field = wrapper.get('input[type="search"]')
      pressEscape(field.element)
      expect(closeDocs).not.toHaveBeenCalled()
      pressEscape(field.element) // already empty: still the field's, never the page's
      expect(closeDocs).not.toHaveBeenCalled()
    })

    it('does not close when something below already handled the key', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const article = wrapper.get('article').element
      article.addEventListener('keydown', (event) => event.preventDefault())
      pressEscape(article)
      expect(closeDocs).not.toHaveBeenCalled()
    })

    it('closes an open phone page list first, and only then the docs', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      const button = wrapper.get('.doc-sidebar .doc-disclosure__button')
      await button.trigger('click')
      const pageLink = wrapper.get('.doc-sidebar nav a')
      pressEscape(pageLink.element)
      await flushPromises()
      expect(closeDocs).not.toHaveBeenCalled()
      expect(wrapper.get('.doc-sidebar .doc-disclosure__button').attributes('aria-expanded')).toBe(
        'false',
      )
      pressEscape(pageLink.element)
      expect(closeDocs).toHaveBeenCalledTimes(1)
    })

    it('the close button closes the docs too', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      await wrapper.get('button[aria-label="Close docs"]').trigger('click')
      expect(closeDocs).toHaveBeenCalledTimes(1)
    })
  })

  describe('keyboard in the search', () => {
    it('Down in the search box moves to the first result, Up on it returns to the box', async () => {
      const { wrapper } = await mountPage('/doc/?q=air')
      const field = wrapper.get('input[type="search"]').element as HTMLInputElement
      field.focus()
      await wrapper.get('input[type="search"]').trigger('keydown', { key: 'ArrowDown' })
      const firstResult = wrapper.get('.doc-search-result a').element
      expect(document.activeElement).toBe(firstResult)
      firstResult.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }),
      )
      expect(document.activeElement).toBe(field)
    })

    it('Down with no results moves nowhere and does not throw', async () => {
      const { wrapper } = await mountPage('/doc/?q=zzzzzz')
      const field = wrapper.get('input[type="search"]').element as HTMLInputElement
      field.focus()
      await wrapper.get('input[type="search"]').trigger('keydown', { key: 'ArrowDown' })
      expect(document.activeElement).toBe(field)
    })

    it('keeps focus in the box while its text changes the view', async () => {
      vi.useFakeTimers()
      const pinia = createPinia()
      setActivePinia(pinia)
      const router = createDocsTestRouter()
      await router.push('/doc/operations')
      const wrapper = mount(DocsPage, {
        global: { plugins: [router, pinia] },
        attachTo: document.body,
      })
      await vi.advanceTimersByTimeAsync(10)
      const field = wrapper.get('input[type="search"]')
      ;(field.element as HTMLInputElement).focus()
      await field.setValue('backups')
      await vi.advanceTimersByTimeAsync(300)
      expect(wrapper.get('h1').text()).toBe('SEARCH RESULTS')
      expect(document.activeElement).toBe(field.element)
    })
  })

  describe('focus on arrival', () => {
    it('starts on the page heading', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      await settle(wrapper)
      expect(document.activeElement).toBe(wrapper.get('h1').element)
    })

    it('starts on the heading named by the #fragment', async () => {
      const { wrapper } = await mountPage('/doc/operations#backups')
      await settle(wrapper)
      expect(document.activeElement?.id).toBe('backups')
      expect(document.activeElement?.tagName).toBe('H3')
    })

    it('falls back to the page heading for an unknown #fragment', async () => {
      const { wrapper } = await mountPage('/doc/operations#nothing-here')
      await settle(wrapper)
      expect(document.activeElement).toBe(wrapper.get('h1').element)
    })

    it("does not jump to an element outside the docs page that shares the fragment's id", async () => {
      const outside = document.createElement('h2')
      outside.id = 'outside-heading'
      outside.tabIndex = -1
      document.body.appendChild(outside)
      const { wrapper } = await mountPage('/doc/operations#outside-heading')
      await settle(wrapper)
      expect(document.activeElement).not.toBe(outside)
      expect(document.activeElement).toBe(wrapper.get('h1').element)
    })

    it('follows a link to a heading on the same page', async () => {
      const { wrapper, router } = await mountPage('/doc/operations')
      await settle(wrapper)
      await router.push('/doc/operations#backups')
      await settle(wrapper)
      expect(document.activeElement?.id).toBe('backups')
    })

    it('follows a search result to its heading on another page', async () => {
      const { wrapper, router } = await mountPage('/doc/?q=backups')
      await settle(wrapper)
      await wrapper.get('.doc-search-result a').trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/doc/operations#backups')
      await settle(wrapper)
      expect(document.activeElement?.id).toBe('backups')
    })

    it('moves to the new page heading when navigating between pages', async () => {
      const { wrapper, router } = await mountPage('/doc/operations')
      await settle(wrapper)
      await router.push('/doc/sections')
      await settle(wrapper)
      expect(document.activeElement).toBe(wrapper.get('h1').element)
      expect(headingText(wrapper)).toBe('What each section does')
    })

    it('leaves the not-found search box focused rather than moving to the heading', async () => {
      const { wrapper } = await mountPage('/doc/missing')
      await settle(wrapper)
      expect(document.activeElement).toBe(wrapper.get('.doc-not-found input').element)
    })
  })

  describe('accessibility', () => {
    const rules = { region: { enabled: false } }

    it('has no violations on a page', async () => {
      const { wrapper } = await mountPage('/doc/operations')
      expect(await axe(wrapper.html(), { rules })).toHaveNoViolations()
    })

    it('has no violations on the welcome page', async () => {
      const { wrapper } = await mountPage('/doc/')
      expect(await axe(wrapper.html(), { rules })).toHaveNoViolations()
    })

    it('has no violations on search results', async () => {
      const { wrapper } = await mountPage('/doc/?q=air')
      expect(await axe(wrapper.html(), { rules })).toHaveNoViolations()
    })

    it('has no violations with no search results', async () => {
      const { wrapper } = await mountPage('/doc/?q=zzzzzz')
      expect(await axe(wrapper.html(), { rules })).toHaveNoViolations()
    })

    it('has no violations on the not-found page', async () => {
      const { wrapper } = await mountPage('/doc/missing')
      expect(await axe(wrapper.html(), { rules })).toHaveNoViolations()
    })

    it('has no violations with the navigation columns hidden', async () => {
      const { wrapper, store } = await mountPage('/doc/operations')
      store.toggleSidebar()
      await flushPromises()
      expect(await axe(wrapper.html(), { rules })).toHaveNoViolations()
    })
  })
})
