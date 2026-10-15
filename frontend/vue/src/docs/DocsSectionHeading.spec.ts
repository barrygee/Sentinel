import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { createPinia } from 'pinia'
import { mountWithRouter } from '@/test/docsHarness'
import DocsSectionHeading from './DocsSectionHeading.vue'

async function mountHeading(level: 2 | 3 | 4 | 5 | 6, html = 'Install <code>uv</code>') {
  return mountWithRouter(DocsSectionHeading, {
    props: { level, id: 'install-uv', html, text: 'Install uv' },
    plugins: [createPinia()],
  })
}

describe('DocsSectionHeading', () => {
  it.each([2, 3, 4, 5, 6] as const)('renders an h%i with the anchor id', async (level) => {
    const { wrapper } = await mountHeading(level)
    const heading = wrapper.get(`h${level}`)
    expect(heading.attributes('id')).toBe('install-uv')
    expect(heading.classes()).toContain(`doc-section-heading--h${level}`)
  })

  it('renders the sanitised inline html (code spans, emphasis)', async () => {
    const { wrapper } = await mountHeading(2, 'Use <code>rtl_tcp</code> <em>now</em>')
    expect(wrapper.get('h2 code').text()).toBe('rtl_tcp')
    expect(wrapper.get('h2 em').text()).toBe('now')
  })

  it('can take focus from a #fragment jump but is not in the tab order', async () => {
    const { wrapper } = await mountHeading(2)
    expect(wrapper.get('h2').attributes('tabindex')).toBe('-1')
  })

  it.each([2, 3, 4] as const)(
    'gives an h%i the shareable anchor link, named after the heading',
    async (level) => {
      const { wrapper } = await mountHeading(level)
      const anchor = wrapper.get('a.doc-anchor')
      expect(anchor.attributes('href')).toBe('#install-uv')
      expect(anchor.attributes('aria-label')).toBe('Link to section: Install uv')
    },
  )

  it.each([5, 6] as const)('gives an h%i no anchor link', async (level) => {
    const { wrapper } = await mountHeading(level)
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountHeading(2)
    expect(
      await axe(`<main>${wrapper.html()}</main>`, {
        rules: { region: { enabled: false }, 'page-has-heading-one': { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
