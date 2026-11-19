import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrModulationPills from './SdrModulationPills.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const MODES = ['AM', 'NFM', 'WFM', 'USB'] as const

function mountPills(currentMode = 'NFM', disabled = false) {
  return mount(SdrModulationPills, {
    props: { modes: MODES, currentMode, disabled },
    attachTo: document.body,
  })
}

describe('SdrModulationPills — rendering', () => {
  it('renders a labelled radio group with one radio per mode', () => {
    const wrapper = mountPills()
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Demodulation mode')
    expect(wrapper.findAll('[role="radio"]').map((radio) => radio.text())).toEqual([...MODES])
  })

  it('checks and activates only the current mode, and makes it the one tab stop', () => {
    const radios = mountPills('WFM').findAll('[role="radio"]')
    expect(radios.map((radio) => radio.attributes('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
    expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual(['-1', '-1', '0', '-1'])
    expect(radios[2]!.classes()).toContain('active')
    expect(radios[0]!.classes()).not.toContain('active')
  })

  it('anchors the tab stop on the first pill when the current mode is not listed', () => {
    const radios = mountPills('LSB').findAll('[role="radio"]')
    expect(radios.map((radio) => radio.attributes('tabindex'))).toEqual(['0', '-1', '-1', '-1'])
  })

  it('disables every pill when disabled', () => {
    const radios = mountPills('AM', true).findAll('[role="radio"]')
    expect(radios.every((radio) => radio.attributes('disabled') !== undefined)).toBe(true)
  })
})

describe('SdrModulationPills — interaction', () => {
  it('emits select with the clicked mode', async () => {
    const wrapper = mountPills()
    await wrapper.findAll('[role="radio"]')[3]!.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['USB']])
  })

  it('selects the next mode on ArrowRight and focuses it', async () => {
    const wrapper = mountPills('NFM')
    await wrapper.findAll('[role="radio"]')[1]!.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.emitted('select')).toEqual([['WFM']])
    expect(document.activeElement).toBe(wrapper.findAll('[role="radio"]')[2]!.element)
  })

  it('wraps from the first mode to the last on ArrowLeft', async () => {
    const wrapper = mountPills('AM')
    await wrapper.findAll('[role="radio"]')[0]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.emitted('select')).toEqual([['USB']])
  })

  it('ignores keys that are not arrows', async () => {
    const wrapper = mountPills('AM')
    await wrapper.findAll('[role="radio"]')[0]!.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})

describe('SdrModulationPills — accessibility', () => {
  it('has no axe violations', async () => {
    expect(await axe(mountPills().html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
