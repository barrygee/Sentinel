import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import DocsPrevNext from './DocsPrevNext.vue'
import type { DocsPage } from './docsTypes'

function pageNamed(path: string, title: string): DocsPage {
  return {
    path,
    url: `/docs/${path}`,
    title,
    file: `docs/${path}.md`,
    markdown: '',
    groupKey: 'sdr',
    groupTitle: 'Use Sentinel',
  }
}

const PREVIOUS = pageNamed('sections', 'What each section does')
const NEXT = pageNamed('operations', 'Check logs')

describe('DocsPrevNext', () => {
  it('renders nothing when there is neither a previous nor a next page', async () => {
    const { wrapper } = await mountWithRouter(DocsPrevNext, {
      props: { previous: null, next: null },
    })
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('links both neighbours with their titles and rel hints', async () => {
    const { wrapper } = await mountWithRouter(DocsPrevNext, {
      props: { previous: PREVIOUS, next: NEXT },
    })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Previous and next page')
    const previous = wrapper.get('a[rel="prev"]')
    expect(previous.attributes('href')).toBe('/docs/sections')
    expect(previous.text()).toContain('PREVIOUS')
    expect(previous.text()).toContain('What each section does')
    const next = wrapper.get('a[rel="next"]')
    expect(next.attributes('href')).toBe('/docs/operations')
    expect(next.text()).toContain('NEXT')
    expect(next.classes()).toContain('doc-prev-next__cell--next')
  })

  it('shows only a next link on the first page, keeping it on the right', async () => {
    const { wrapper } = await mountWithRouter(DocsPrevNext, {
      props: { previous: null, next: NEXT },
    })
    expect(wrapper.find('a[rel="prev"]').exists()).toBe(false)
    expect(wrapper.get('a[rel="next"]').text()).toContain('Check logs')
    // An empty placeholder keeps "next" in the second grid column.
    expect(wrapper.get('nav').element.children[0]?.tagName).toBe('SPAN')
  })

  it('shows only a previous link on the last page', async () => {
    const { wrapper } = await mountWithRouter(DocsPrevNext, {
      props: { previous: PREVIOUS, next: null },
    })
    expect(wrapper.find('a[rel="next"]').exists()).toBe(false)
    expect(wrapper.get('a[rel="prev"]').text()).toContain('What each section does')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountWithRouter(DocsPrevNext, {
      props: { previous: PREVIOUS, next: NEXT },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
