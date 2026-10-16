import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import { buildFixtureDocsLibrary } from '@/test/docsFixtures'
import type { DocGroupKey } from './docsTypes'
import DocsPageList from './DocsPageList.vue'

const library = buildFixtureDocsLibrary()

async function mountList(activeGroupKey: DocGroupKey | undefined, currentPath: string) {
  return mountWithRouter(DocsPageList, {
    props: { groups: library.groups, activeGroupKey, currentPath },
  })
}

/** The toggle button heading a group, found by its visible title. */
function toggleFor(wrapper: Awaited<ReturnType<typeof mountList>>['wrapper'], title: string) {
  const toggle = wrapper
    .findAll('button.doc-page-list__group-toggle')
    .find((button) => button.text() === title)
  if (!toggle) throw new Error(`No toggle for ${title}`)
  return toggle
}

/** Whether a group's page list is shown (v-show leaves it in the DOM). */
function pagesShown(wrapper: Awaited<ReturnType<typeof mountList>>['wrapper'], key: string) {
  return (wrapper.get(`#doc-pages-${key}`).element as HTMLElement).style.display !== 'none'
}

describe('DocsPageList', () => {
  it('is one navigation landmark holding every group as a heading, in order', async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Documentation pages')
    // The empty fixture group has no pages, so the library leaves it out.
    expect(
      wrapper.findAll('button.doc-page-list__group-toggle').map((button) => button.text()),
    ).toEqual(['Introduction', 'Use Sentinel', 'Develop'])
  })

  it('ties each heading to its page list with aria-controls, and names the list after the group', async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    const toggle = toggleFor(wrapper, 'Use Sentinel')
    expect(toggle.attributes('aria-controls')).toBe('doc-pages-sdr')
    expect(wrapper.get('#doc-pages-sdr').attributes('aria-label')).toBe('Use Sentinel')
  })

  it("opens the current page's group and keeps the others closed", async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    expect(toggleFor(wrapper, 'Use Sentinel').attributes('aria-expanded')).toBe('true')
    expect(toggleFor(wrapper, 'Introduction').attributes('aria-expanded')).toBe('false')
    expect(pagesShown(wrapper, 'sdr')).toBe(true)
    expect(pagesShown(wrapper, 'introduction')).toBe(false)
    expect(wrapper.findAll('.doc-page-list__group--open')).toHaveLength(1)
  })

  it('marks only the active group heading', async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    const active = wrapper.findAll('.doc-page-list__group-toggle--active')
    expect(active).toHaveLength(1)
    expect(active[0]?.text()).toBe('Use Sentinel')
  })

  it('opens nothing and marks nothing active when no page is on screen (not found)', async () => {
    const { wrapper } = await mountList(undefined, 'nope')
    expect(wrapper.findAll('[aria-expanded="true"]')).toHaveLength(0)
    expect(wrapper.findAll('.doc-page-list__group-toggle--active')).toHaveLength(0)
  })

  it('opens a closed group when its heading is clicked, and closes it again', async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    const toggle = toggleFor(wrapper, 'Develop')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(pagesShown(wrapper, 'develop')).toBe(true)
    // Opening one leaves the open one as it was.
    expect(toggleFor(wrapper, 'Use Sentinel').attributes('aria-expanded')).toBe('true')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(pagesShown(wrapper, 'develop')).toBe(false)
  })

  it("can close the current page's own group", async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    const toggle = toggleFor(wrapper, 'Use Sentinel')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
  })

  it('opens the new group when the page moves to another group, keeping open ones open', async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    await wrapper.setProps({ activeGroupKey: 'develop', currentPath: 'contributing' })
    await nextTick()
    expect(toggleFor(wrapper, 'Develop').attributes('aria-expanded')).toBe('true')
    expect(toggleFor(wrapper, 'Use Sentinel').attributes('aria-expanded')).toBe('true')
  })

  it("lists a group's pages in order as links", async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    const links = wrapper.get('#doc-pages-sdr').findAll('a')
    expect(links.map((link) => link.text())).toEqual(['What each section does', 'Check logs'])
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/docs/sections',
      '/docs/operations',
    ])
  })

  it('marks only the current page with aria-current="page"', async () => {
    const { wrapper } = await mountList('sdr', 'operations')
    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.text()).toBe('Check logs')
    expect(current[0]?.classes()).toContain('doc-page-list__link--current')
    expect(wrapper.findAll('.doc-page-list__link--current')).toHaveLength(1)
  })

  it('nests a sub-list under its own label, as a named list', async () => {
    const { wrapper } = await mountList('develop', 'contributing')
    const develop = wrapper.get('#doc-pages-develop')
    expect(develop.get('.doc-page-list__sublabel').text()).toBe('Design decisions')
    const nested = develop.get('ol[aria-label="Design decisions"]')
    expect(nested.findAll('a').map((link) => link.text())).toEqual(['0001 First', '0002 Second'])
    // The plain page comes first, then the sub-list.
    expect(develop.findAll(':scope > li')).toHaveLength(2)
  })

  it('marks the current page inside a sub-list', async () => {
    const { wrapper } = await mountList('develop', 'adr/0002-second')
    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.text()).toBe('0002 Second')
    expect(current[0]?.classes()).toContain('doc-page-list__link--current')
  })

  it('navigates in the app when a page is clicked', async () => {
    const { wrapper, router } = await mountList('develop', 'contributing')
    await wrapper
      .findAll('a')
      .find((link) => link.text() === '0001 First')
      ?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.currentRoute.value.path).toBe('/docs/adr/0001-first')
  })

  it('navigates in the app when a top-level page is clicked', async () => {
    const { wrapper, router } = await mountList('sdr', 'sections')
    await wrapper.get('#doc-pages-sdr a[href="/docs/operations"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.currentRoute.value.path).toBe('/docs/operations')
  })

  it('offers no external changelog link', async () => {
    const { wrapper } = await mountList('sdr', 'sections')
    expect(wrapper.find('a[target="_blank"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain("What's new")
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountList('develop', 'adr/0001-first')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
