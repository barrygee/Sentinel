import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrManagerUnavailableNotice from './SdrManagerUnavailableNotice.vue'

describe('SdrManagerUnavailableNotice', () => {
  it('is announced as soon as it shows', () => {
    const wrapper = mount(SdrManagerUnavailableNotice)

    expect(wrapper.get('.sdr-manager-unavailable').attributes('role')).toBe('alert')
  })

  it('says SDR Manager is not running', () => {
    const wrapper = mount(SdrManagerUnavailableNotice)

    expect(wrapper.get('.sdr-manager-unavailable-title').text()).toBe('SDR MANAGER IS NOT RUNNING')
  })

  it('tells the operator what to check on Linux and on a Mac, then to reload', () => {
    const text = mount(SdrManagerUnavailableNotice).get('.sdr-manager-unavailable-text').text()

    expect(text).toContain('COMPOSE_PROFILES')
    expect(text).toContain('sdr-manager-local status')
    expect(text).toContain('reload this page')
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SdrManagerUnavailableNotice, { attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
