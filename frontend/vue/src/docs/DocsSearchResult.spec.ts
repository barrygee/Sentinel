import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import DocsSearchResult from './DocsSearchResult.vue'
import type { DocsSearchHit } from './search/docsSearchEngine'

function hitWith(
  overrides: Omit<Partial<DocsSearchHit>, 'section'> & {
    section?: Partial<DocsSearchHit['section']>
  } = {},
): DocsSearchHit {
  const { section, ...rest } = overrides
  return {
    section: {
      id: 'operations#health-checks',
      pagePath: 'operations',
      pageTitle: 'Check logs',
      groupKey: 'getting-started',
      groupTitle: 'Getting started',
      heading: 'Health checks',
      headingId: 'health-checks',
      text: 'Call the health endpoint.',
      ...section,
    },
    score: 1,
    matchedTerms: ['health'],
    snippet: 'Call the health endpoint.',
    ...rest,
  }
}

function mountResult(hit: DocsSearchHit, pageUrl = '/docs/operations') {
  return mountWithRouter(DocsSearchResult, { props: { hit, pageUrl } })
}

describe('DocsSearchResult', () => {
  it('is a list item holding one link to the heading of the page', async () => {
    const { wrapper } = await mountResult(hitWith())
    expect(wrapper.find('li').exists()).toBe(true)
    expect(wrapper.findAll('a')).toHaveLength(1)
    expect(wrapper.get('a').attributes('href')).toBe('/docs/operations#health-checks')
  })

  it('shows the page title, then the section heading, then the excerpt', async () => {
    const { wrapper } = await mountResult(hitWith())
    expect(wrapper.get('.doc-search-result__title').text()).toBe('Check logs')
    expect(wrapper.get('.doc-search-result__heading').text()).toBe('Health checks')
    expect(wrapper.get('.doc-search-result__snippet').text()).toBe('Call the health endpoint.')
  })

  it('says "section" to screen readers between the page and the heading, and hides the arrow', async () => {
    const { wrapper } = await mountResult(hitWith())
    expect(wrapper.get('.doc-search-result__separator').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.sr-only').text()).toBe('section')
  })

  it('wraps matched words in <mark> in the title, heading and excerpt, so matches are not shown by colour alone', async () => {
    const { wrapper } = await mountResult(
      hitWith({
        matchedTerms: ['health', 'logs'],
        snippet: 'The health endpoint',
      }),
    )
    expect(wrapper.get('.doc-search-result__title mark').text()).toBe('logs')
    expect(wrapper.get('.doc-search-result__heading mark').text()).toBe('Health')
    expect(wrapper.get('.doc-search-result__snippet mark').text()).toBe('health')
  })

  it('marks nothing when no term matches in a part', async () => {
    const { wrapper } = await mountResult(hitWith({ matchedTerms: ['zzz'] }))
    expect(wrapper.findAll('mark')).toHaveLength(0)
  })

  it('links to the page itself, with no fragment and no heading, for the intro of a page', async () => {
    const { wrapper } = await mountResult(
      hitWith({ section: { headingId: '', heading: 'Check logs', id: 'operations' } }),
    )
    expect(wrapper.get('a').attributes('href')).toBe('/docs/operations')
    expect(wrapper.find('.doc-search-result__heading').exists()).toBe(false)
    expect(wrapper.find('.doc-search-result__separator').exists()).toBe(false)
    expect(wrapper.find('.sr-only').exists()).toBe(false)
  })

  it('leaves out the excerpt when there is none', async () => {
    const { wrapper } = await mountResult(hitWith({ snippet: '' }))
    expect(wrapper.find('.doc-search-result__snippet').exists()).toBe(false)
  })

  it('navigates in the app when pressed', async () => {
    const { wrapper, router } = await mountResult(hitWith())
    await wrapper.get('a').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.currentRoute.value.path).toBe('/docs/operations')
    expect(router.currentRoute.value.hash).toBe('#health-checks')
  })

  it('does not interpret text as markup', async () => {
    const { wrapper } = await mountResult(
      hitWith({ snippet: '<img src=x onerror=alert(1)>', matchedTerms: ['img'] }),
    )
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('.doc-search-result__snippet').text()).toContain(
      '<img src=x onerror=alert(1)>',
    )
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountResult(hitWith())
    expect(
      await axe(`<ol>${wrapper.html()}</ol>`, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
