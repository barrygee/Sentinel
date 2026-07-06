import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseDataCell from './BaseDataCell.vue'

describe('BaseDataCell', () => {
  it('renders the label and a plain-text value', () => {
    const wrapper = mount(BaseDataCell, { props: { label: 'LATITUDE', value: '12°' } })
    expect(wrapper.find('.ba-data-cell-label').text()).toBe('LATITUDE')
    expect(wrapper.find('.ba-data-cell-value').text()).toBe('12°')
  })

  it('renders nothing for the value when neither value nor slot is given', () => {
    const wrapper = mount(BaseDataCell, { props: { label: 'LATITUDE' } })
    expect(wrapper.find('.ba-data-cell-value').text()).toBe('')
  })

  it('lets the default slot override the value with richer content', () => {
    const wrapper = mount(BaseDataCell, {
      props: { label: 'UPLINK', value: 'ignored' },
      slots: { default: '145.900 MHz<span class="ba-data-cell-mode">· AFSK</span>' },
    })
    expect(wrapper.find('.ba-data-cell-value').text()).toContain('145.900 MHz')
    expect(wrapper.find('.ba-data-cell-mode').text()).toBe('· AFSK')
  })

  it('does not add the wide class by default', () => {
    const wrapper = mount(BaseDataCell, { props: { label: 'ALT', value: '1' } })
    expect(wrapper.find('.ba-data-cell').classes()).not.toContain('ba-data-cell--wide')
  })

  it('adds the wide class when wide=true', () => {
    const wrapper = mount(BaseDataCell, {
      props: { label: 'CATEGORY', value: 'Heavy', wide: true },
    })
    expect(wrapper.find('.ba-data-cell').classes()).toContain('ba-data-cell--wide')
  })

  it('does not add the emphasis class by default', () => {
    const wrapper = mount(BaseDataCell, { props: { label: 'EMRG', value: 'NONE' } })
    expect(wrapper.find('.ba-data-cell-value').classes()).not.toContain(
      'ba-data-cell-value--emphasis',
    )
  })

  it('adds the emphasis class when emphasis=true', () => {
    const wrapper = mount(BaseDataCell, {
      props: { label: 'EMRG', value: 'HIJACK', emphasis: true },
    })
    expect(wrapper.find('.ba-data-cell-value').classes()).toContain('ba-data-cell-value--emphasis')
  })

  it('lets a caller override the --ba-cell-align custom property via style fallthrough', () => {
    // SpaceFilter/SpacePasses's RADIO grid sets this to flex-start (vs the
    // default stretch) so a long value (e.g. TRANSPONDER type, or a formatted
    // frequency + "· MODE" suffix) renders at its natural width instead of
    // being ellipsized at the column edge — exactly like the other
    // --ba-cell-*/--ba-grid-* custom properties.
    const wrapper = mount(BaseDataCell, {
      props: { label: 'TRANSPONDER', value: 'Linear' },
      attrs: { style: '--ba-cell-align: flex-start' },
    })
    const cell = wrapper.get('.ba-data-cell')
    expect((cell.element as HTMLElement).style.getPropertyValue('--ba-cell-align')).toBe(
      'flex-start',
    )
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(BaseDataCell, { props: { label: 'LATITUDE', value: '12°' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
