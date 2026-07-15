import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseSliderRow from './BaseSliderRow.vue'

function mountRow(overrides: Record<string, unknown> = {}) {
  return mount(BaseSliderRow, {
    props: {
      label: 'VOLUME',
      readout: '80%',
      accessibleName: 'Volume',
      min: 0,
      max: 200,
      step: 1,
      value: 80,
      ...overrides,
    },
  })
}

describe('BaseSliderRow', () => {
  it('renders the header row (label + readout) above the range input', () => {
    const wrapper = mountRow()
    const section = wrapper.get('.sdr-radio-section')
    const header = section.get('.sdr-slider-header')
    expect(header.get('label.sdr-field-label').text()).toBe('VOLUME')
    expect(header.get('span.sdr-slider-val').text()).toBe('80%')
    expect(header.get('.sdr-slider-val').classes()).not.toContain('sdr-slider-val--dimmed')
    const slider = section.get('input.sdr-panel-slider')
    expect(slider.attributes('type')).toBe('range')
    expect(slider.attributes('aria-label')).toBe('Volume')
    expect(slider.attributes('min')).toBe('0')
    expect(slider.attributes('max')).toBe('200')
    expect(slider.attributes('step')).toBe('1')
    expect((slider.element as HTMLInputElement).value).toBe('80')
    expect(slider.attributes('disabled')).toBeUndefined()
  })

  it('dims the readout and disables the input when told to', () => {
    const wrapper = mountRow({
      label: 'RF GAIN',
      readout: 'AUTO',
      accessibleName: 'RF gain in dB',
      min: -1,
      max: 49,
      step: 0.5,
      value: 30,
      readoutDimmed: true,
      disabled: true,
    })
    expect(wrapper.get('.sdr-slider-val').classes()).toContain('sdr-slider-val--dimmed')
    expect(wrapper.get('.sdr-slider-val').text()).toBe('AUTO')
    const slider = wrapper.get('input')
    expect(slider.attributes('disabled')).toBeDefined()
    expect(slider.attributes('step')).toBe('0.5')
  })

  it('re-emits the raw input event from the range input', async () => {
    const wrapper = mountRow()
    await wrapper.get('input').trigger('input')
    const emitted = wrapper.emitted('input')!
    expect(emitted).toHaveLength(1)
    // Raw DOM event passthrough — the panel's handlers read event.target.value.
    expect((emitted[0][0] as Event).target).toBe(wrapper.get('input').element)
  })

  it('has no axe violations', async () => {
    const wrapper = mountRow()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
