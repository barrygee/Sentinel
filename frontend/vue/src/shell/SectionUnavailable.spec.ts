import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SectionUnavailable from './SectionUnavailable.vue'

describe('SectionUnavailable', () => {
  it('names the unavailable section in its heading', () => {
    const wrapper = mount(SectionUnavailable, { props: { label: 'SEA' } })

    expect(wrapper.get('h1').text()).toBe('SEA is unavailable')
  })

  it('tells the operator the other sections still work and how to retry', () => {
    const wrapper = mount(SectionUnavailable, { props: { label: 'LAND' } })

    expect(wrapper.get('p').text()).toContain('The other sections keep working')
    expect(wrapper.get('p').text()).toContain('reload the page')
  })

  it('is a section labelled by its own heading', () => {
    const wrapper = mount(SectionUnavailable, { props: { label: 'SDR' } })

    const section = wrapper.get('section')
    const heading = wrapper.get('h1')
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SectionUnavailable, {
      props: { label: 'AIR' },
      attachTo: document.body,
    })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
