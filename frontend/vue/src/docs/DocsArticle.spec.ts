import { describe, it, expect, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { axe } from 'jest-axe'

vi.mock('./renderMermaid', () => ({
  renderMermaidDiagram: vi.fn().mockRejectedValue(new Error('not drawn in this spec')),
}))

import { mountWithRouter } from '@/test/docsHarness'
import DocsArticle from './DocsArticle.vue'
import type { DocBlock } from './markdown/docBlocks'

const ALL_KINDS: DocBlock[] = [
  { kind: 'html', html: '<p>Some <strong>prose</strong>.</p>' },
  { kind: 'heading', level: 2, id: 'install', html: 'Install', text: 'Install' },
  { kind: 'code', language: 'bash', code: 'docker compose up' },
  { kind: 'table', html: '<table><tr><td>cell</td></tr></table>', label: 'Install table' },
  { kind: 'callout', variant: 'warning', html: '<p>Careful.</p>' },
  {
    kind: 'diagram',
    source: 'graph TD\nA-->B',
    caption: 'Flow',
    textHtml: '<ul><li>A to B</li></ul>',
  },
]

async function mountArticle(blocks: readonly DocBlock[], url = '/docs/operations') {
  return mountWithRouter(DocsArticle, { url, props: { blocks }, plugins: [createPinia()] })
}

/**
 * Dispatches a real, cancelable click and reports whether the article (or
 * anything below the document) cancelled it. The document listener runs last,
 * records the answer, then cancels so jsdom does not try to follow the link.
 */
function click(target: Element, init: MouseEventInit = {}): { prevented: boolean } {
  const outcome = { prevented: false }
  const recordThenCancel = (event: Event): void => {
    outcome.prevented = event.defaultPrevented
    event.preventDefault()
  }
  document.addEventListener('click', recordThenCancel, { once: true })
  target.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }),
  )
  document.removeEventListener('click', recordThenCancel)
  return outcome
}

describe('DocsArticle', () => {
  describe('blocks', () => {
    it('is an article holding nothing for no blocks', async () => {
      const { wrapper } = await mountArticle([])
      expect(wrapper.get('article').element.children).toHaveLength(0)
    })

    it('renders each kind of block with its own component, in order', async () => {
      const { wrapper } = await mountArticle(ALL_KINDS)
      await flushPromises()
      const article = wrapper.get('article').element
      const rendered = Array.from(article.children).map((child) => child.className.split(' ')[0])
      expect(rendered).toEqual([
        'doc-prose',
        'doc-section-heading',
        'doc-code',
        'doc-table-scroll',
        'doc-callout',
        'doc-diagram-block',
      ])
    })

    it('renders prose html', async () => {
      const { wrapper } = await mountArticle([ALL_KINDS[0] as DocBlock])
      expect(wrapper.get('.doc-prose strong').text()).toBe('prose')
    })

    it('renders a heading with its id and an anchor link', async () => {
      const { wrapper } = await mountArticle([ALL_KINDS[1] as DocBlock])
      expect(wrapper.get('h2').attributes('id')).toBe('install')
      expect(wrapper.get('h2 a.doc-anchor').attributes('aria-label')).toBe(
        'Link to section: Install',
      )
    })

    it('renders code with its language and code', async () => {
      const { wrapper } = await mountArticle([ALL_KINDS[2] as DocBlock])
      expect(wrapper.get('.doc-code__language').text()).toBe('bash')
      expect(wrapper.get('pre code').text()).toBe('docker compose up')
    })

    it('renders a table in a named scroll region', async () => {
      const { wrapper } = await mountArticle([ALL_KINDS[3] as DocBlock])
      expect(wrapper.get('[role="region"]').attributes('aria-label')).toBe('Install table')
      expect(wrapper.get('td').text()).toBe('cell')
    })

    it('renders a callout with its label and html body', async () => {
      const { wrapper } = await mountArticle([ALL_KINDS[4] as DocBlock])
      expect(wrapper.get('.doc-callout__label').text()).toBe('WARNING')
      expect(wrapper.get('.doc-callout__body p').text()).toBe('Careful.')
    })

    it('renders a diagram with its caption and text version', async () => {
      const { wrapper } = await mountArticle([ALL_KINDS[5] as DocBlock])
      await flushPromises()
      expect(wrapper.get('figcaption').text()).toBe('Flow')
      expect(wrapper.get('.doc-diagram-text').text()).toBe('A to B')
    })
  })

  describe('links to other docs pages', () => {
    const docLinkBlocks: DocBlock[] = [
      {
        kind: 'html',
        html: '<p><a id="doc" href="/docs/sections" data-doc-link>Sections <span id="inner">inner</span></a> <a id="plain" href="https://example.com">Out</a> <a id="nohref" data-doc-link>No href</a> <a id="empty" href="" data-doc-link>Empty</a></p>',
      },
    ]

    it('routes a plain click in the app, without a page load', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      const outcome = click(wrapper.get('#doc').element)
      await flushPromises()
      expect(outcome.prevented).toBe(true)
      expect(router.currentRoute.value.path).toBe('/docs/sections')
    })

    it('routes a click on something inside the link', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      const outcome = click(wrapper.get('#inner').element)
      await flushPromises()
      expect(outcome.prevented).toBe(true)
      expect(router.currentRoute.value.path).toBe('/docs/sections')
    })

    it('keeps the fragment of the link', async () => {
      const { wrapper, router } = await mountArticle([
        {
          kind: 'html',
          html: '<p><a id="doc" href="/docs/sections#sea" data-doc-link>Sea</a></p>',
        },
      ])
      click(wrapper.get('#doc').element)
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/docs/sections#sea')
    })

    it.each([
      ['command', { metaKey: true }],
      ['control', { ctrlKey: true }],
      ['shift', { shiftKey: true }],
      ['alt', { altKey: true }],
    ])('leaves a %s-click to the browser (new tab, download)', async (_name, modifier) => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      const outcome = click(wrapper.get('#doc').element, modifier)
      await flushPromises()
      expect(outcome.prevented).toBe(false)
      expect(router.currentRoute.value.path).toBe('/docs/operations')
    })

    it('leaves a middle-click and a right-click to the browser', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      expect(click(wrapper.get('#doc').element, { button: 1 }).prevented).toBe(false)
      expect(click(wrapper.get('#doc').element, { button: 2 }).prevented).toBe(false)
      expect(router.currentRoute.value.path).toBe('/docs/operations')
    })

    it('does not handle a click someone else already handled', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      const link = wrapper.get('#doc').element
      link.addEventListener('click', (event) => event.preventDefault())
      click(link)
      await flushPromises()
      expect(router.currentRoute.value.path).toBe('/docs/operations')
    })

    it('leaves external links to the browser', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      const outcome = click(wrapper.get('#plain').element)
      expect(outcome.prevented).toBe(false)
      expect(router.currentRoute.value.path).toBe('/docs/operations')
    })

    it('ignores a marked link with no usable href', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      expect(click(wrapper.get('#nohref').element).prevented).toBe(false)
      expect(click(wrapper.get('#empty').element).prevented).toBe(false)
      expect(router.currentRoute.value.path).toBe('/docs/operations')
    })

    it('ignores clicks that are not on a link', async () => {
      const { wrapper, router } = await mountArticle(docLinkBlocks)
      const outcome = click(wrapper.get('.doc-prose').element)
      expect(outcome.prevented).toBe(false)
      expect(router.currentRoute.value.path).toBe('/docs/operations')
    })
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountArticle(ALL_KINDS)
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
