import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatRadioInfoSection from './SatRadioInfoSection.vue'
import type { SatRadioInfo } from './satRadioInfo'

function mountSection(radio: SatRadioInfo, classPrefix: 'sfr-acc' | 'spp-acc' = 'sfr-acc') {
  return mount(SatRadioInfoSection, { props: { radio, classPrefix } })
}

describe('SatRadioInfoSection', () => {
  it('renders nothing when the satellite has no radio info', () => {
    const wrapper = mountSection({})
    expect(wrapper.find('div').exists()).toBe(false)
  })

  it('renders the section under the caller class prefix with all cells populated', () => {
    const wrapper = mountSection(
      {
        uplink_hz: 145_990_000,
        uplink_mode: 'FM',
        downlink_hz: 437_800_000,
        downlink_mode: 'FM',
        ctcss_hz: 67,
        transponder_type: 'FM repeater',
        beacon_hz: 145_825_000,
        radio_status: 'ACTIVE',
      },
      'spp-acc',
    )
    const section = wrapper.get('.spp-acc-section')
    expect(section.classes()).toContain('spp-acc-section--radio')
    const text = section.text()
    expect(text).toContain('145.990 MHz')
    expect(text).toContain('437.800 MHz')
    expect(text).toContain('67.0 Hz')
    expect(text).toContain('FM repeater')
    expect(text).toContain('145.825 MHz')
    expect(text).toContain('Active')
    // The mode spans ride BaseDataCell's :slotted(.ba-data-cell-mode) styling.
    expect(wrapper.findAll('.ba-data-cell-mode')).toHaveLength(2)
  })

  it('omits cells whose fields are missing and skips the mode spans without modes', () => {
    const wrapper = mountSection({ uplink_hz: 145_990_000 })
    expect(wrapper.text()).toContain('UPLINK')
    expect(wrapper.text()).not.toContain('DOWNLINK')
    expect(wrapper.text()).not.toContain('CTCSS')
    expect(wrapper.find('.ba-data-cell-mode').exists()).toBe(false)
  })

  it('renders the PACKET and NOTES line lists via splitNotes', () => {
    const wrapper = mountSection({
      packet_info: 'APRS 1200bd; digipeater',
      radio_notes: 'Weekends only',
    })
    const lines = wrapper.findAll('.sfr-acc-radio-line')
    expect(lines).toHaveLength(2)
    expect(lines[0].get('.sfr-acc-cell-label').text()).toBe('PACKET / DIGITAL')
    expect(lines[0].findAll('li').map((item) => item.text())).toEqual(['APRS 1200bd', 'digipeater'])
    expect(lines[1].get('.sfr-acc-cell-label').text()).toBe('NOTES')
    expect(lines[1].get('li').text()).toBe('Weekends only')
  })

  it('has no axe violations', async () => {
    const wrapper = mountSection({
      uplink_hz: 145_990_000,
      packet_info: 'APRS 1200bd',
      radio_status: 'active',
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
