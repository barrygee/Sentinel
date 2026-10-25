import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrManagerOnlyHeader from './SdrManagerOnlyHeader.vue'

describe('SdrManagerOnlyHeader', () => {
  it("is the app's nav bar, so it takes the full app's #nav styles", () => {
    const wrapper = mount(SdrManagerOnlyHeader)

    expect(wrapper.get('header').attributes('id')).toBe('nav')
  })

  it('names the app by its logo', () => {
    const wrapper = mount(SdrManagerOnlyHeader)

    expect(wrapper.get('img').attributes('alt')).toBe('SENTINEL')
  })

  it('says which mode this Sentinel runs in, where the full app lists its sections', () => {
    const wrapper = mount(SdrManagerOnlyHeader)

    expect(wrapper.get('.sdr-manager-only-badge').text()).toBe('SDR MANAGER ONLY')
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrManagerOnlyHeader, { attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
