import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import SdrFooterIndicator from './SdrFooterIndicator.vue'
import { useSdrStore } from '@/stores/sdr'

// The footer's tuned-frequency readout (moved out of AppFooter; the sdr section
// registers it with the footer registry). `activeSectionId` is the section on
// screen, as AppFooter passes it.
function mountIndicator(activeSectionId = 'air') {
  return mount(SdrFooterIndicator, { props: { activeSectionId } })
}

describe('SdrFooterIndicator', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  // Put the radio into the "parked on a single frequency" state the indicator
  // surfaces: streaming, not sweeping, tuned somewhere.
  function parkSdrOnFrequency(frequencyHz = 145_800_000) {
    const sdrStore = useSdrStore()
    sdrStore.currentFreqHz = frequencyHz
    sdrStore.playing = true
    sdrStore.scanSweeping = false
    sdrStore.searchSweeping = false
    return sdrStore
  }

  it('is hidden when the radio is not playing', () => {
    const wrapper = mountIndicator()
    expect(wrapper.find('#footer-sdr').exists()).toBe(false)
  })

  it('shows the tuned frequency when parked on a single frequency', () => {
    parkSdrOnFrequency(145_800_000)
    const wrapper = mountIndicator()
    const indicator = wrapper.find('#footer-sdr')
    expect(indicator.exists()).toBe(true)
    expect(indicator.find('.footer-sdr-freq').text()).toBe('145.800 MHz')
  })

  it('omits the name when the frequency is not a saved one', () => {
    parkSdrOnFrequency(145_800_000)
    const wrapper = mountIndicator()
    expect(wrapper.find('.footer-sdr-name').exists()).toBe(false)
    expect(wrapper.find('#footer-sdr').attributes('aria-label')).toBe('SDR active on 145.800 MHz')
  })

  it('shows the known name when the frequency matches a saved one', () => {
    const sdrStore = parkSdrOnFrequency(145_800_000)
    sdrStore.frequencies = [
      { id: 1, group_id: null, label: 'ISS VOICE', frequency_hz: 145_800_000, mode: 'NFM' },
    ]
    const wrapper = mountIndicator()
    expect(wrapper.find('.footer-sdr-name').text()).toBe('ISS VOICE')
    expect(wrapper.find('#footer-sdr').attributes('aria-label')).toBe(
      'SDR active on 145.800 MHz, ISS VOICE',
    )
  })

  it('is hidden while a scan is mid-sweep (hopping, not stopped)', () => {
    const sdrStore = parkSdrOnFrequency()
    sdrStore.scanSweeping = true
    const wrapper = mountIndicator()
    expect(wrapper.find('#footer-sdr').exists()).toBe(false)
  })

  it('is hidden while a search is mid-sweep (hopping, not stopped)', () => {
    const sdrStore = parkSdrOnFrequency()
    sdrStore.searchSweeping = true
    const wrapper = mountIndicator()
    expect(wrapper.find('#footer-sdr').exists()).toBe(false)
  })

  it('is hidden when there is no tuned frequency', () => {
    const sdrStore = parkSdrOnFrequency()
    sdrStore.currentFreqHz = 0
    const wrapper = mountIndicator()
    expect(wrapper.find('#footer-sdr').exists()).toBe(false)
  })

  it('is hidden in the SDR section while the RADIO tab is selected', () => {
    const sdrStore = parkSdrOnFrequency()
    sdrStore.activeTab = 'radio'
    const wrapper = mountIndicator('sdr')
    expect(wrapper.find('#footer-sdr').exists()).toBe(false)
  })

  it('is shown in the SDR section on tabs other than RADIO', () => {
    const sdrStore = parkSdrOnFrequency(145_800_000)
    sdrStore.activeTab = 'recordings'
    const wrapper = mountIndicator('sdr')
    expect(wrapper.find('#footer-sdr').exists()).toBe(true)
    expect(wrapper.find('.footer-sdr-freq').text()).toBe('145.800 MHz')
  })

  it('has no accessibility violations while the indicator is shown', async () => {
    const sdrStore = parkSdrOnFrequency(145_800_000)
    sdrStore.frequencies = [
      { id: 1, group_id: null, label: 'ISS VOICE', frequency_hz: 145_800_000, mode: 'NFM' },
    ]
    const wrapper = mountIndicator()
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })

  it('still shows on another section while the SDR remembers the RADIO tab', () => {
    const sdrStore = parkSdrOnFrequency()
    sdrStore.activeTab = 'radio'
    const wrapper = mountIndicator('air')
    expect(wrapper.find('#footer-sdr').exists()).toBe(true)
  })
})
