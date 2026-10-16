import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import { buildFixtureDocsLibrary } from '@/test/docsFixtures'
import DocsGroupRail from './DocsGroupRail.vue'

const library = buildFixtureDocsLibrary()

async function mountRail(activeGroupKey?: 'sdr') {
  return mountWithRouter(DocsGroupRail, {
    props: { groups: library.groups, activeGroupKey },
  })
}

describe('DocsGroupRail', () => {
  it('is a navigation landmark with one entry per group that has pages', async () => {
    const { wrapper } = await mountRail()
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Documentation sections')
    expect(wrapper.findAll('li')).toHaveLength(3)
  })

  it('names each entry after its group, because the entry holds only an icon', async () => {
    const { wrapper } = await mountRail()
    const names = wrapper.findAll('a').map((link) => link.attributes('aria-label'))
    expect(names).toEqual(['Get started', 'Use Sentinel', 'Develop'])
  })

  it("makes each entry a real link to its group's first page", async () => {
    const { wrapper } = await mountRail()
    const hrefs = wrapper.findAll('a').map((link) => link.attributes('href'))
    expect(hrefs).toEqual(['/doc/', '/doc/sections', '/doc/contributing'])
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('marks only the active group as current', async () => {
    const { wrapper } = await mountRail('sdr')
    const current = wrapper.findAll('a[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.attributes('aria-label')).toBe('Use Sentinel')
    expect(current[0]?.classes()).toContain('ba-btn--active')
    expect(wrapper.findAll('a.ba-btn--active')).toHaveLength(1)
  })

  it('marks no group as current when none is active (page not found)', async () => {
    const { wrapper } = await mountRail()
    expect(wrapper.findAll('[aria-current]')).toHaveLength(0)
  })

  it('shows a tooltip with the group title', async () => {
    const { wrapper } = await mountRail()
    expect(wrapper.findAll('a').map((link) => link.attributes('data-tooltip'))).toEqual([
      'Get started',
      'Use Sentinel',
      'Develop',
    ])
  })

  it('draws a decorative icon in each entry', async () => {
    const { wrapper } = await mountRail()
    expect(wrapper.findAll('a svg[aria-hidden="true"]')).toHaveLength(3)
  })

  it('navigates in the app when an entry is clicked', async () => {
    const { wrapper, router } = await mountRail()
    await wrapper.findAll('a')[1]?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.currentRoute.value.path).toBe('/doc/sections')
  })

  it('falls back to /doc/ for a group without pages', async () => {
    const { wrapper } = await mountWithRouter(DocsGroupRail, {
      props: { groups: [{ key: 'set-up-and-run', title: 'Reference', entries: [], pages: [] }] },
    })
    expect(wrapper.get('a').attributes('href')).toBe('/doc/')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountRail('sdr')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
