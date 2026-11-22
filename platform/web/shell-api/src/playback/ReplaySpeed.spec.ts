import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ReplaySpeed from './ReplaySpeed.vue'

enableAutoUnmount(afterEach)

const RATES = [1, 10, 60, 300] as const

function mountSpeed(modelValue = 10) {
  return mount(ReplaySpeed, { props: { rates: RATES, modelValue }, attachTo: document.body })
}

describe('ReplaySpeed', () => {
  it('is a radio group of chips labelled by its visible caption', () => {
    const wrapper = mountSpeed()
    const group = wrapper.get('[role="radiogroup"]')
    expect(wrapper.get(`#${group.attributes('aria-labelledby')}`).text()).toBe('SPEED')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((radio) => radio.text())).toEqual(['1×', '10×', '60×', '300×'])
    expect(radios.every((radio) => radio.classes().includes('base-chip'))).toBe(true)
  })

  it('checks, lights and tab-stops only the current speed', () => {
    const radios = mountSpeed(60).findAll('[role="radio"]')
    expect(radios.map((radio) => radio.attributes('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
    expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual(['-1', '-1', '0', '-1'])
    expect(radios[2]!.classes()).toContain('base-chip--active')
    expect(radios[2]!.attributes('aria-label')).toBe('60 times speed')
  })

  it('emits the clicked speed, and arrows move between speeds', async () => {
    const wrapper = mountSpeed(300)
    const radios = wrapper.findAll('[role="radio"]')
    await radios[0]!.trigger('click')
    await radios[3]!.trigger('keydown', { key: 'ArrowRight' })
    await radios[3]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[1], [1], [60]])
  })

  it('has no axe violations', async () => {
    expect(
      await axe(mountSpeed().html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
