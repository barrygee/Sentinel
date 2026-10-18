import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'

const closeDocs = vi.hoisted(() => vi.fn())
vi.mock('./composables/useDocsReturn', () => ({ useDocsReturn: () => ({ closeDocs }) }))

import DocsUnavailable from './DocsUnavailable.vue'

enableAutoUnmount(afterEach)

function mountUnavailable() {
  return mount(DocsUnavailable, { attachTo: document.body })
}

describe('DocsUnavailable', () => {
  beforeEach(() => {
    closeDocs.mockReset()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('is a region named by its DOCS UNAVAILABLE heading', () => {
    const wrapper = mountUnavailable()
    const region = wrapper.get('section')
    const heading = wrapper.get('h1')
    expect(heading.text()).toBe('DOCS UNAVAILABLE')
    expect(heading.attributes('id')).toBe('docs-unavailable-heading')
    expect(region.attributes('aria-labelledby')).toBe('docs-unavailable-heading')
  })

  it('says the rest of the app works and how to get the docs back', () => {
    const wrapper = mountUnavailable()
    expect(wrapper.text()).toContain('The rest of Sentinel keeps working')
    expect(wrapper.get('code').text()).toBe('docs')
  })

  it('moves focus to its heading on arrival', () => {
    const wrapper = mountUnavailable()
    expect(document.activeElement).toBe(wrapper.get('h1').element)
  })

  it('closes Docs on Escape', async () => {
    const wrapper = mountUnavailable()
    await wrapper.get('section').trigger('keydown', { key: 'Escape' })
    expect(closeDocs).toHaveBeenCalledTimes(1)
  })

  it('ignores other keys', async () => {
    const wrapper = mountUnavailable()
    await wrapper.get('section').trigger('keydown', { key: 'Enter' })
    expect(closeDocs).not.toHaveBeenCalled()
  })

  it('is a light-island reading page', () => {
    const classes = mountUnavailable().get('section').classes()
    expect(classes).toContain('theme-light')
    expect(classes).toContain('light-island')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountUnavailable()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
