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
    const section = wrapper.get('.base-slider-row')
    const header = section.get('.base-slider-row-header')
    expect(header.get('label.base-slider-row-label').text()).toBe('VOLUME')
    expect(header.get('span.base-slider-row-value').text()).toBe('80%')
    expect(header.get('.base-slider-row-value').classes()).not.toContain(
      'base-slider-row-value--dimmed',
    )
    const slider = section.get('input.base-slider-row-input')
    expect(slider.attributes('type')).toBe('range')
    expect(slider.attributes('aria-label')).toBe('Volume')
    expect(slider.attributes('min')).toBe('0')
    expect(slider.attributes('max')).toBe('200')
    expect(slider.attributes('step')).toBe('1')
    expect((slider.element as HTMLInputElement).value).toBe('80')
    expect(slider.attributes('disabled')).toBeUndefined()
  })

  it('renders only its own generic class family', () => {
    const wrapper = mountRow({ readoutDimmed: true })
    const renderedClasses = [wrapper.element, ...wrapper.element.querySelectorAll('*')].flatMap(
      (element) => [...element.classList],
    )
    expect(renderedClasses.length).toBeGreaterThan(0)
    for (const className of renderedClasses) {
      expect(className).toMatch(/^base-slider-row(-|$)/)
    }
  })

  it('puts a caller class on the root beside its own, so the context owns row spacing', () => {
    const wrapper = mount(BaseSliderRow, {
      props: {
        label: 'VOLUME',
        readout: '80%',
        accessibleName: 'Volume',
        min: 0,
        max: 200,
        step: 1,
        value: 80,
      },
      attrs: { class: 'context-row' },
    })
    expect(wrapper.classes()).toEqual(['base-slider-row', 'context-row'])
    // Only the root takes it: the header and input keep their own classes.
    expect(wrapper.get('.base-slider-row-header').classes()).toEqual(['base-slider-row-header'])
    expect(wrapper.get('input').classes()).toEqual(['base-slider-row-input'])
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
    expect(wrapper.get('.base-slider-row-value').classes()).toContain(
      'base-slider-row-value--dimmed',
    )
    expect(wrapper.get('.base-slider-row-value').text()).toBe('AUTO')
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
