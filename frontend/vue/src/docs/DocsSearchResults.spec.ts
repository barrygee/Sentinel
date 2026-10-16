import { describe, it, expect, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import { buildFixtureDocsLibrary } from '@/test/docsFixtures'
import DocsSearchResults from './DocsSearchResults.vue'
import { createDocsSearchEngine } from './search/docsSearchEngine'
import type { DocsSearchHit, DocsSearchOutcome } from './search/docsSearchEngine'

const library = buildFixtureDocsLibrary()
const engine = createDocsSearchEngine(library)

function hitFor(sectionId: string, groupKey: string, pagePath: string): DocsSearchHit {
  return {
    section: {
      id: sectionId,
      pagePath,
      pageTitle: `Page ${pagePath}`,
      groupKey,
      groupTitle: groupKey,
      heading: `Heading ${sectionId}`,
      headingId: sectionId.split('#')[1] ?? '',
      text: 'text',
    },
    score: 1,
    matchedTerms: [],
    snippet: 'snippet text',
  }
}

function mountResults(query: string, outcome: DocsSearchOutcome | null) {
  return mountWithRouter(DocsSearchResults, { props: { query, outcome, library } })
}

describe('DocsSearchResults', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('with results', () => {
    it('summarises the count and the query', async () => {
      const outcome = engine.search('air')
      const { wrapper } = await mountResults('air', outcome)
      expect(wrapper.get('.doc-search-results__summary').text()).toBe(
        `${outcome.hits.length} ${outcome.hits.length === 1 ? 'result' : 'results'} for “air”`,
      )
    })

    it('uses the singular for one result', async () => {
      const outcome = engine.search('backups')
      expect(outcome.hits).toHaveLength(1)
      const { wrapper } = await mountResults('backups', outcome)
      expect(wrapper.get('.doc-search-results__summary').text()).toBe('1 result for “backups”')
    })

    it('trims the query it echoes', async () => {
      const { wrapper } = await mountResults('  backups  ', engine.search('backups'))
      expect(wrapper.get('.doc-search-results__summary').text()).toBe('1 result for “backups”')
    })

    it('says how many are shown when the total is more', async () => {
      const outcome: DocsSearchOutcome = {
        hits: [hitFor('sections#air', 'sdr', 'sections'), hitFor('index', 'get-started', 'index')],
        totalHits: 55,
        expansions: [],
      }
      const { wrapper } = await mountResults('air', outcome)
      expect(wrapper.get('.doc-search-results__summary').text()).toBe(
        'Showing 2 of 55 results for “air”',
      )
    })

    it('says which synonym words widened the search, by their friendly label', async () => {
      const outcome = engine.search('plane')
      const { wrapper } = await mountResults('plane', outcome)
      expect(wrapper.get('.doc-search-results__summary').text()).toContain('· also searching Air')
    })

    it('lists the labels of several widened words', async () => {
      const outcome = engine.search('plane ship')
      const { wrapper } = await mountResults('plane ship', outcome)
      expect(wrapper.get('.doc-search-results__summary').text()).toContain(
        '· also searching Air, Sea',
      )
    })

    it('says nothing about synonyms when none applied', async () => {
      const { wrapper } = await mountResults('backups', engine.search('backups'))
      expect(wrapper.get('.doc-search-results__summary').text()).not.toContain('also searching')
    })

    it('groups the results by docs group, in the library order, hiding groups with none', async () => {
      const outcome: DocsSearchOutcome = {
        hits: [
          hitFor('contributing', 'develop', 'contributing'),
          hitFor('index', 'get-started', 'index'),
          hitFor('adr/0001-first', 'develop', 'adr/0001-first'),
        ],
        totalHits: 3,
        expansions: [],
      }
      const { wrapper } = await mountResults('x', outcome)
      const titles = wrapper
        .findAll('h2.doc-search-results__group-title')
        .map((title) => title.text())
      expect(titles).toEqual(['Get started', 'Develop'])
      const develop = wrapper.findAll('section')[1]
      expect(develop?.findAll('li')).toHaveLength(2)
    })

    it("keeps each group's results in the ranking order they arrived in", async () => {
      const outcome: DocsSearchOutcome = {
        hits: [
          hitFor('sections#sea', 'sdr', 'sections'),
          hitFor('operations#backups', 'sdr', 'operations'),
        ],
        totalHits: 2,
        expansions: [],
      }
      const { wrapper } = await mountResults('x', outcome)
      expect(wrapper.findAll('li a').map((link) => link.attributes('href'))).toEqual([
        '/doc/sections#sea',
        '/doc/operations#backups',
      ])
    })

    it('falls back to /doc/ for a result whose page is no longer in the library', async () => {
      const outcome: DocsSearchOutcome = {
        hits: [hitFor('gone', 'develop', 'gone')],
        totalHits: 1,
        expansions: [],
      }
      const { wrapper } = await mountResults('x', outcome)
      expect(wrapper.get('li a').attributes('href')).toBe('/doc/')
    })

    it('is not a combobox: plain headings, lists and links', async () => {
      const { wrapper } = await mountResults('air', engine.search('air'))
      expect(wrapper.find('[role="listbox"], [role="combobox"], [role="option"]').exists()).toBe(
        false,
      )
      expect(wrapper.findAll('ol').length).toBeGreaterThan(0)
    })
  })

  describe('with no results', () => {
    it('says so, in capitals, with what to do', async () => {
      const { wrapper } = await mountResults('zzzz', engine.search('zzzz'))
      expect(wrapper.get('.doc-search-results__empty').text()).toBe('NO RESULTS FOR “ZZZZ”')
      expect(wrapper.get('.doc-search-results__hint').text()).toBe(
        'Try other words, or browse the sections on the left.',
      )
      expect(wrapper.find('.doc-search-results__summary').exists()).toBe(false)
      expect(wrapper.find('section').exists()).toBe(false)
    })

    it('trims the query it echoes', async () => {
      const { wrapper } = await mountResults('  zzzz ', engine.search('zzzz'))
      expect(wrapper.get('.doc-search-results__empty').text()).toBe('NO RESULTS FOR “ZZZZ”')
    })

    it('treats a missing outcome (not searched yet) as no results', async () => {
      const { wrapper } = await mountResults('ab', null)
      expect(wrapper.get('.doc-search-results__empty').text()).toBe('NO RESULTS FOR “AB”')
    })
  })

  describe('keyboard', () => {
    async function mountThree() {
      const outcome: DocsSearchOutcome = {
        hits: [
          hitFor('index', 'get-started', 'index'),
          hitFor('sections#air', 'sdr', 'sections'),
          hitFor('sections#sea', 'sdr', 'sections'),
        ],
        totalHits: 3,
        expansions: [],
      }
      const mounted = await mountResults('x', outcome)
      const links = mounted.wrapper.findAll('li a').map((link) => link.element as HTMLAnchorElement)
      return { ...mounted, links }
    }

    function press(target: HTMLElement, key: string): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      target.dispatchEvent(event)
      return event
    }

    it('moves to the next result on Down, and stays on the last', async () => {
      const { links } = await mountThree()
      links[0]?.focus()
      const event = press(links[0] as HTMLElement, 'ArrowDown')
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(links[1])
      links[2]?.focus()
      press(links[2] as HTMLElement, 'ArrowDown')
      expect(document.activeElement).toBe(links[2])
    })

    it('moves to the previous result on Up', async () => {
      const { links } = await mountThree()
      links[2]?.focus()
      const event = press(links[2] as HTMLElement, 'ArrowUp')
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(links[1])
    })

    it('asks for the search field when Up is pressed on the first result', async () => {
      const { wrapper, links } = await mountThree()
      links[0]?.focus()
      const event = press(links[0] as HTMLElement, 'ArrowUp')
      expect(event.defaultPrevented).toBe(true)
      expect(wrapper.emitted('focus-field')).toHaveLength(1)
      expect(document.activeElement).toBe(links[0])
    })

    it('ignores arrows when focus is not on a result link', async () => {
      const { wrapper } = await mountThree()
      const outside = document.createElement('button')
      wrapper.element.appendChild(outside)
      outside.focus()
      const event = press(outside, 'ArrowDown')
      expect(event.defaultPrevented).toBe(false)
      expect(wrapper.emitted('focus-field')).toBeUndefined()
    })

    it('ignores other keys on a result', async () => {
      const { wrapper, links } = await mountThree()
      links[0]?.focus()
      const event = press(links[0] as HTMLElement, 'Enter')
      expect(event.defaultPrevented).toBe(false)
      expect(document.activeElement).toBe(links[0])
      expect(wrapper.emitted('focus-field')).toBeUndefined()
    })

    it('focuses the first result on request', async () => {
      const { wrapper, links } = await mountThree()
      ;(wrapper.vm as unknown as { focusFirst: () => void }).focusFirst()
      expect(document.activeElement).toBe(links[0])
    })

    it('focusing the first result with none is harmless', async () => {
      const { wrapper } = await mountResults('zzzz', engine.search('zzzz'))
      expect(() => (wrapper.vm as unknown as { focusFirst: () => void }).focusFirst()).not.toThrow()
    })
  })

  it('has no accessibility violations with results', async () => {
    const { wrapper } = await mountResults('air', engine.search('air'))
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations without results', async () => {
    const { wrapper } = await mountResults('zzzz', engine.search('zzzz'))
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
