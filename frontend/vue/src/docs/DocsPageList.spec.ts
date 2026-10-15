import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import { buildFixtureDocsLibrary } from '@/test/docsFixtures'
import { CHANGELOG_URL } from './markdown/docLinks'
import DocsPageList from './DocsPageList.vue'

const library = buildFixtureDocsLibrary()
const useSentinel = library.groups.find((group) => group.key === 'use-sentinel')
const develop = library.groups.find((group) => group.key === 'develop')

describe('DocsPageList', () => {
  it('is a navigation landmark named after the group, with its title as a label', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: useSentinel, currentPath: 'sections' },
    })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Pages in Use Sentinel')
    expect(wrapper.get('.doc-page-list__label').text()).toBe('Use Sentinel')
  })

  it("lists the group's pages in order as links", async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: useSentinel, currentPath: 'sections' },
    })
    const links = wrapper.findAll('nav a')
    expect(links.map((link) => link.text())).toEqual(['What each section does', 'Check logs'])
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/doc/sections',
      '/doc/operations',
    ])
  })

  it('marks only the current page with aria-current="page"', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: useSentinel, currentPath: 'operations' },
    })
    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.text()).toBe('Check logs')
    expect(current[0]?.classes()).toContain('doc-page-list__link--current')
    expect(wrapper.findAll('.doc-page-list__link--current')).toHaveLength(1)
  })

  it('marks nothing current when the path is not in this group', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: useSentinel, currentPath: 'contributing' },
    })
    expect(wrapper.findAll('[aria-current]')).toHaveLength(0)
  })

  it('nests a sub-list under its own label, as a named list', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: develop, currentPath: 'contributing' },
    })
    expect(wrapper.get('.doc-page-list__sublabel').text()).toBe('Design decisions')
    const nested = wrapper.get('ol.doc-page-list__pages--nested')
    expect(nested.attributes('aria-label')).toBe('Design decisions')
    expect(nested.findAll('a').map((link) => link.text())).toEqual(['0001 First', '0002 Second'])
    // The plain page comes first, then the sub-list.
    expect(wrapper.findAll('nav > ol > li')).toHaveLength(2)
  })

  it('marks the current page inside a sub-list', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: develop, currentPath: 'adr/0002-second' },
    })
    const current = wrapper.findAll('a[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.text()).toBe('0002 Second')
  })

  it('navigates in the app when a page is clicked', async () => {
    const { wrapper, router } = await mountWithRouter(DocsPageList, {
      props: { group: develop, currentPath: 'contributing' },
    })
    await wrapper
      .findAll('a')
      .find((link) => link.text() === '0001 First')
      ?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.currentRoute.value.path).toBe('/doc/adr/0001-first')
  })

  it('always offers the online changelog in a new tab, announced as such', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: useSentinel, currentPath: 'sections' },
    })
    const link = wrapper.get('.doc-page-list__external a')
    expect(link.attributes('href')).toBe(CHANGELOG_URL)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(link.text()).toContain("What's new (online only)")
    expect(link.text()).toContain('(opens in a new tab)')
    expect(link.get('[aria-hidden="true"]').text()).toBe('↗')
  })

  it('shows only the changelog link when no group is active', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: undefined, currentPath: 'nope' },
    })
    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.find('.doc-page-list__external a').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountWithRouter(DocsPageList, {
      props: { group: develop, currentPath: 'adr/0001-first' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
