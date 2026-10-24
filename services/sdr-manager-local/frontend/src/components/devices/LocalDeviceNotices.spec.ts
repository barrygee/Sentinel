import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import LocalDeviceNotices from './LocalDeviceNotices.vue'

describe('LocalDeviceNotices', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders nothing for a present, identifiable device', () => {
    const wrapper = mount(LocalDeviceNotices, { props: { device: makeDevice() } })
    expect(wrapper.find('.warning-notice').exists()).toBe(false)
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(false)
  })

  it('warns about a shared serial and opens the serial flash panel for that device', async () => {
    const wrapper = mount(LocalDeviceNotices, {
      props: { device: makeDevice({ device_id: 'dup-1', needs_identification: true }) },
    })
    expect(wrapper.get('.warning-notice').text()).toContain('shares its serial with another one')
    await wrapper.get('button').trigger('click')
    expect(useLocalSdrStore().serialFlashDeviceId).toBe('dup-1')
  })

  it('says where an unplugged device was last seen', () => {
    const wrapper = mount(LocalDeviceNotices, {
      props: {
        device: makeDevice({
          present: false,
          usb_last_known: {
            manufacturer: null,
            product: null,
            serial: null,
            topology_path: '1-4.2',
          },
        }),
      },
    })
    expect(wrapper.get('.sdr-devices-empty').text()).toBe(
      'Not plugged in — last seen on USB port 1-4.2. Its settings are kept until you forget it.',
    )
  })

  it('omits the last-seen port when it was never seen on one', () => {
    const wrapper = mount(LocalDeviceNotices, {
      props: { device: makeDevice({ present: false, usb_last_known: null }) },
    })
    expect(wrapper.get('.sdr-devices-empty').text()).toBe(
      'Not plugged in. Its settings are kept until you forget it.',
    )
  })

  it('can show both the serial warning and the not-plugged-in note', () => {
    const wrapper = mount(LocalDeviceNotices, {
      props: { device: makeDevice({ present: false, needs_identification: true }) },
    })
    expect(wrapper.find('.warning-notice').exists()).toBe(true)
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(true)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LocalDeviceNotices, {
      props: { device: makeDevice({ present: false, needs_identification: true }) },
    })
    expect(wrapper.get('button').text()).toBe('FLASH SERIAL')
    await expectNoAxeViolations(wrapper)
  })
})
