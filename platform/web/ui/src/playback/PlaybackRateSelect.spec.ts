import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import PlaybackRateSelect from './PlaybackRateSelect.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }
const RATES = [1, 10, 60, 300] as const

function mountRates(modelValue = 10) {
  return mount(PlaybackRateSelect, { props: { rates: RATES, modelValue }, attachTo: document.body })
}

describe('PlaybackRateSelect', () => {
  it('is a labelled radio group with one radio per speed', () => {
    const wrapper = mountRates()
    expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe('Replay speed')
    const radios = wrapper.findAll('[role="radio"]')
    expect(radios.map((radio) => radio.text())).toEqual(['1×', '10×', '60×', '300×'])
    expect(radios.map((radio) => radio.attributes('aria-label'))).toEqual([
      '1 times speed',
      '10 times speed',
      '60 times speed',
      '300 times speed',
    ])
  })

  it('checks and highlights only the current speed, which holds the tab stop', () => {
    const radios = mountRates(60).findAll('[role="radio"]')
    expect(radios.map((radio) => radio.attributes('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
    expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual(['-1', '-1', '0', '-1'])
    expect(radios[2]!.classes()).toContain('playback-pill--active')
    expect(radios[0]!.classes()).not.toContain('playback-pill--active')
  })

  it('emits the clicked speed', async () => {
    const wrapper = mountRates()
    await wrapper.findAll('[role="radio"]')[3]!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[300]])
  })

  it('arrow keys select the next and previous speed, wrapping', async () => {
    const wrapper = mountRates(300)
    const radios = wrapper.findAll('[role="radio"]')
    await radios[3]!.trigger('keydown', { key: 'ArrowRight' })
    await radios[3]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('update:modelValue')).toEqual([[1], [60]])
  })

  it('has no axe violations', async () => {
    expect(await axe(mountRates().html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
