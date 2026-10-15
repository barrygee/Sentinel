import { describe, it, expect } from 'vitest'
import { axe } from 'jest-axe'
import { mountWithRouter } from '@/test/docsHarness'
import DocsBreadcrumb from './DocsBreadcrumb.vue'

describe('DocsBreadcrumb', () => {
  it('is a navigation landmark named Breadcrumb with an ordered list', async () => {
    const { wrapper } = await mountWithRouter(DocsBreadcrumb, {
      props: { trail: [{ label: 'Docs', to: '/doc/' }, { label: 'Search' }] },
    })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Breadcrumb')
    expect(wrapper.findAll('ol > li')).toHaveLength(2)
  })

  it('links every item except the last, which is the current page', async () => {
    const { wrapper } = await mountWithRouter(DocsBreadcrumb, {
      props: {
        trail: [{ label: 'Set up and run', to: '/doc/operations' }, { label: 'Check logs' }],
      },
    })
    const links = wrapper.findAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]?.text()).toBe('Set up and run')
    expect(links[0]?.attributes('href')).toBe('/doc/operations')
    const current = wrapper.get('[aria-current="page"]')
    expect(current.text()).toBe('Check logs')
    expect(current.element.tagName).toBe('SPAN')
  })

  it('does not link the last item even when it has a target', async () => {
    const { wrapper } = await mountWithRouter(DocsBreadcrumb, {
      props: { trail: [{ label: 'Only', to: '/doc/' }] },
    })
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.get('[aria-current="page"]').text()).toBe('Only')
  })

  it('shows an earlier item without a target as plain current-style text', async () => {
    const { wrapper } = await mountWithRouter(DocsBreadcrumb, {
      props: { trail: [{ label: 'No target' }, { label: 'Page' }] },
    })
    expect(wrapper.findAll('a')).toHaveLength(0)
    expect(wrapper.text()).toContain('No target')
  })

  it('marks only the last item as the current page, even when a link points at the page being read', async () => {
    // On a group's first page the group link and the page are the same address,
    // so the router would also flag the link; the trail must name one current item.
    const { wrapper } = await mountWithRouter(DocsBreadcrumb, {
      url: '/doc/sections',
      props: {
        trail: [
          { label: 'Use Sentinel', to: '/doc/sections' },
          { label: 'What each section does' },
        ],
      },
    })
    const current = wrapper.findAll('[aria-current]')
    expect(current).toHaveLength(1)
    expect(current[0]?.text()).toBe('What each section does')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountWithRouter(DocsBreadcrumb, {
      props: { trail: [{ label: 'Group', to: '/doc/operations' }, { label: 'Page' }] },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
