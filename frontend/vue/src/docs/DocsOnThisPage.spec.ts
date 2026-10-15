import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import DocsOnThisPage from './DocsOnThisPage.vue'
import type { OutlineEntry } from './markdown/docBlocks'

const ENTRIES: OutlineEntry[] = [
  { id: 'install', level: 2, text: 'Install' },
  { id: 'run-it', level: 3, text: 'Run it' },
  { id: 'logs', level: 2, text: 'Logs' },
]

/** Minimal observer so the "being read" heading can be driven by hand. */
class FakeIntersectionObserver {
  static latest: FakeIntersectionObserver | null = null
  constructor(readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.latest = this
  }
  observe(): void {}
  disconnect(): void {}
  fire(id: string): void {
    this.callback(
      [
        { target: document.getElementById(id), isIntersecting: true },
      ] as unknown as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    )
  }
}

describe('DocsOnThisPage', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
    for (const entry of ENTRIES) {
      const heading = document.createElement('h2')
      heading.id = entry.id
      document.body.appendChild(heading)
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('renders nothing for a page with no h2 or h3', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: [], pageUrl: '/doc/operations' },
    })
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('is a navigation landmark named "On this page"', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('On this page')
  })

  it('links every heading in order, to its anchor on this page', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    const links = wrapper.findAll('a.doc-toc__link')
    expect(links.map((link) => link.text())).toEqual(['Install', 'Run it', 'Logs'])
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/doc/operations#install',
      '/doc/operations#run-it',
      '/doc/operations#logs',
    ])
  })

  it('indents h3 entries separately from h2', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    expect(wrapper.findAll('li').map((item) => item.classes()[0])).toEqual([
      'doc-toc__item--h2',
      'doc-toc__item--h3',
      'doc-toc__item--h2',
    ])
  })

  it('collapses behind an "On this page" button below the wide layout, closed to start', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    const button = wrapper.get('button')
    expect(button.text()).toContain('On this page')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.doc-disclosure').classes()).toContain('doc-disclosure--wide')
    await button.trigger('click')
    expect(button.attributes('aria-expanded')).toBe('true')
  })

  it('marks no heading as current until one is being read', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    expect(wrapper.findAll('[aria-current]')).toHaveLength(0)
  })

  it('marks the heading being read as the current location', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    FakeIntersectionObserver.latest?.fire('run-it')
    await wrapper.vm.$nextTick()
    const current = wrapper.findAll('a[aria-current="location"]')
    expect(current).toHaveLength(1)
    expect(current[0]?.text()).toBe('Run it')
    expect(current[0]?.classes()).toContain('doc-toc__link--current')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountWithRouter(DocsOnThisPage, {
      props: { entries: ENTRIES, pageUrl: '/doc/operations' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
