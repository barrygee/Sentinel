import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { axe } from 'jest-axe'
import SatRadioLinesAccordion from './SatRadioLinesAccordion.vue'

function mountAccordion(classPrefix: 'sfr-acc' | 'spp-acc' = 'sfr-acc') {
  return mount(SatRadioLinesAccordion, {
    props: { title: 'NOTES', lines: ['Weekends only', 'SSTV 145.800'], classPrefix },
    attachTo: document.body,
  })
}

describe('SatRadioLinesAccordion', () => {
  it('starts collapsed, with the caption as a named toggle wired to the list', () => {
    const wrapper = mountAccordion()
    const toggle = wrapper.get('button')
    expect(toggle.text()).toBe('NOTES')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    const list = wrapper.get('ul')
    expect(toggle.attributes('aria-controls')).toBe(list.attributes('id'))
    expect(list.isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('shows the lines when opened and hides them again when closed', async () => {
    const wrapper = mountAccordion()
    const toggle = wrapper.get('button')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.classes()).toContain('srla-toggle--expanded')
    expect(wrapper.get('ul').isVisible()).toBe(true)
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'Weekends only',
      'SSTV 145.800',
    ])
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.classes()).not.toContain('srla-toggle--expanded')
    expect(wrapper.get('ul').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the caller CSS family for the line, caption and list', () => {
    const wrapper = mountAccordion('spp-acc')
    expect(wrapper.classes()).toContain('spp-acc-radio-line')
    expect(wrapper.get('button').classes()).toContain('spp-acc-cell-label')
    expect(wrapper.get('ul').classes()).toContain('spp-acc-radio-list')
    wrapper.unmount()
  })

  it('gives each instance in one app its own list id', () => {
    // PACKET and NOTES render side by side, so their ids must not collide.
    const wrapper = mount(
      defineComponent({
        setup: () => () => [
          h(SatRadioLinesAccordion, { title: 'A', lines: ['a'], classPrefix: 'sfr-acc' }),
          h(SatRadioLinesAccordion, { title: 'B', lines: ['b'], classPrefix: 'sfr-acc' }),
        ],
      }),
    )
    const ids = wrapper.findAll('ul').map((list) => list.attributes('id'))
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
    wrapper.unmount()
  })

  it('has no axe violations open or closed', async () => {
    const wrapper = mountAccordion()
    const rules = { rules: { region: { enabled: false } } }
    expect(await axe(wrapper.html(), rules)).toHaveNoViolations()
    await wrapper.get('button').trigger('click')
    expect(await axe(wrapper.html(), rules)).toHaveNoViolations()
    wrapper.unmount()
  })
})
