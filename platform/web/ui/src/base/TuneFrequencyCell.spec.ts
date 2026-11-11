import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import TuneFrequencyCell from './TuneFrequencyCell.vue'

const BASE_PROPS = { label: 'TOWER', frequency: '118.500', mode: 'AM', sdrConnected: true }

describe('TuneFrequencyCell', () => {
  it('is a plain button showing the label and the frequency with its mode after it', () => {
    const wrapper = mount(TuneFrequencyCell, { props: BASE_PROPS })
    expect(wrapper.element.tagName).toBe('BUTTON')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.classes()).toContain('tune-frequency-cell')
    expect(wrapper.find('.ba-data-cell-label').text()).toBe('TOWER')
    expect(wrapper.find('.ba-data-cell-value').text()).toBe('118.500 · AM')
    expect(wrapper.find('.ba-data-cell-mode').text()).toBe('· AM')
  })

  it('moves the mode into the label when modePlacement is label', () => {
    const wrapper = mount(TuneFrequencyCell, {
      props: {
        ...BASE_PROPS,
        label: 'OUTPUT',
        frequency: '433.0000',
        mode: 'NFM',
        modePlacement: 'label',
      },
    })
    expect(wrapper.find('.ba-data-cell-label').text()).toBe('OUTPUT · NFM')
    expect(wrapper.find('.ba-data-cell-value').text()).toBe('433.0000')
    expect(wrapper.find('.ba-data-cell-mode').exists()).toBe(false)
  })

  it('titles the button with what it will tune to while an SDR is connected', () => {
    const wrapper = mount(TuneFrequencyCell, { props: BASE_PROPS })
    expect(wrapper.attributes('title')).toBe('Tune to 118.500 AM')
  })

  it('titles the button with the connect hint while no SDR is connected', () => {
    const wrapper = mount(TuneFrequencyCell, { props: { ...BASE_PROPS, sdrConnected: false } })
    expect(wrapper.attributes('title')).toBe('Connect an SDR to tune')
  })

  it('emits tune on click without letting the click reach the row around it', async () => {
    const parentClicks: Event[] = []
    const parent = document.createElement('div')
    parent.addEventListener('click', (event) => parentClicks.push(event))
    document.body.append(parent)
    const wrapper = mount(TuneFrequencyCell, { props: BASE_PROPS, attachTo: parent })
    await wrapper.trigger('click')
    expect(wrapper.emitted('tune')).toHaveLength(1)
    expect(parentClicks).toHaveLength(0)
    wrapper.unmount()
    parent.remove()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(TuneFrequencyCell, { props: BASE_PROPS, attachTo: document.body })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
