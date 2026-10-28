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

  it('is only the logo: no section list and no mode badge', () => {
    const wrapper = mount(SdrManagerOnlyHeader)

    expect(wrapper.find('nav').exists()).toBe(false)
    expect(wrapper.get('header#nav').text()).toBe('')
    expect(wrapper.get('header#nav').element.children).toHaveLength(1)
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrManagerOnlyHeader, { attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
