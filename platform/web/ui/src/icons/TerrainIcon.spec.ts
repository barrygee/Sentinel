import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import TerrainIcon from './TerrainIcon.vue'

describe('TerrainIcon', () => {
  it('renders a decorative (aria-hidden) contour svg', () => {
    const wrapper = mount(TerrainIcon)
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('path')).toHaveLength(2)
    expect(wrapper.findAll('line')).toHaveLength(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(TerrainIcon)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
