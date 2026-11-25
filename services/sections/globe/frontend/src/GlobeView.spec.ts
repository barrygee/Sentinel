import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import GlobeView from './GlobeView.vue'

describe('GlobeView', () => {
  it('marks itself as the globe section on its own dark page', () => {
    const wrapper = mount(GlobeView)
    const page = wrapper.find('#globe-page')

    expect(page.exists()).toBe(true)
    expect(page.attributes('data-domain')).toBe('globe')
    expect(page.classes()).toContain('theme-dark')
  })

  it('names the page for screen readers with its one heading', () => {
    const wrapper = mount(GlobeView)
    const headings = wrapper.findAll('h1')

    expect(headings).toHaveLength(1)
    expect(headings[0]!.text()).toBe('Globe — live aircraft, satellites, vessels and APRS stations')
    expect(headings[0]!.classes()).toContain('sr-only')
  })

  it('announces the placeholder as a status message', () => {
    const wrapper = mount(GlobeView)
    const status = wrapper.find('[role="status"]')

    expect(status.exists()).toBe(true)
    expect(status.text()).toBe('The 3D globe is coming soon.')
  })

  it('has no detectable accessibility violations', async () => {
    const wrapper = mount(GlobeView, { attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
