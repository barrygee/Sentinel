import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SeaPortChannelButton from './SeaPortChannelButton.vue'

describe('SeaPortChannelButton', () => {
  it('labels the cell with the purpose and channel, and shows the frequency and mode', () => {
    const wrapper = mount(SeaPortChannelButton, {
      props: { label: 'VTS', channel: 12, sdrConnected: true },
    })
    expect(wrapper.find('.ba-data-cell-label').text()).toBe('VTS · CH 12')
    expect(wrapper.find('.ba-data-cell-value').text()).toBe('156.600 · NFM')
    expect(wrapper.find('.sea-port-channel-mode').text()).toBe('· NFM')
    expect(wrapper.attributes('type')).toBe('button')
    expect(wrapper.attributes('title')).toBe('Tune to 156.600 NFM')
  })

  it('upper-cases the label and explains the hint when no SDR is connected', () => {
    const wrapper = mount(SeaPortChannelButton, {
      props: { label: 'Port Control', channel: 14, sdrConnected: false },
    })
    expect(wrapper.find('.ba-data-cell-label').text()).toBe('PORT CONTROL · CH 14')
    expect(wrapper.attributes('title')).toBe('Connect an SDR to tune')
  })

  it('emits tune on click without letting the click reach the accordion row', async () => {
    const parentClick = new Array<Event>()
    const wrapper = mount(
      {
        components: { SeaPortChannelButton },
        methods: {
          onParentClick(event: Event) {
            parentClick.push(event)
          },
        },
        template:
          '<div @click="onParentClick"><SeaPortChannelButton label="VTS" :channel="12" :sdr-connected="true" @tune="$emit(\'tune\')" /></div>',
      },
      {},
    )
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('tune')).toHaveLength(1)
    expect(parentClick).toHaveLength(0)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SeaPortChannelButton, {
      props: { label: 'Calling', channel: 16, sdrConnected: true },
      attachTo: document.body,
    })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
