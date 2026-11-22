import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplayCoverageLegend from './ReplayCoverageLegend.vue'

describe('ReplayCoverageLegend', () => {
  it('keys both shades with decorative swatches', () => {
    const wrapper = mount(ReplayCoverageLegend)
    expect(wrapper.get('ul').attributes('aria-label')).toBe('Timeline shading')
    expect(wrapper.findAll('li').map((item) => item.text())).toEqual([
      'RECORDED ONLINE',
      'RECORDED OFF GRID',
    ])
    expect(wrapper.findAll('[aria-hidden="true"]')).toHaveLength(2)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(ReplayCoverageLegend, { attachTo: document.body })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
    wrapper.unmount()
  })
})
