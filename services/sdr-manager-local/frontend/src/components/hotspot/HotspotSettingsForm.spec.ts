import { describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import type { LocalHotspotState, LocalWirelessInterface } from '../../api/types'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeHotspotState } from '../../testing/factories'
import HotspotSettingsForm from './HotspotSettingsForm.vue'

const SSID = '#sdr-manager-local-hotspot-ssid'
const PASSPHRASE = '#sdr-manager-local-hotspot-passphrase'
const SECURITY = '#sdr-manager-local-hotspot-security'
const BAND = '#sdr-manager-local-hotspot-band'
const CHANNEL = '#sdr-manager-local-hotspot-channel'
const INTERFACE = '#sdr-manager-local-hotspot-interface'
const GATEWAY = '#sdr-manager-local-hotspot-gateway'

function wireless(overrides: Partial<LocalWirelessInterface> = {}): LocalWirelessInterface {
  return {
    name: 'wlan0',
    mac_address: null,
    supports_ap: true,
    state: 'up',
    station_ssid: null,
    carries_default_route: false,
    in_use_by: null,
    ...overrides,
  }
}

function mountForm(
  stateOverrides: Partial<LocalHotspotState> = {},
  interfaces: LocalWirelessInterface[] = [wireless()],
  busy = false,
): VueWrapper {
  return mount(HotspotSettingsForm, {
    props: { state: makeHotspotState(stateOverrides), interfaces, busy },
    attachTo: document.body,
  })
}

function valueOf(wrapper: VueWrapper, selector: string): string {
  return (wrapper.get(selector).element as HTMLInputElement).value
}

async function submit(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('form').trigger('submit')
  await wrapper.vm.$nextTick()
}

function emittedBody(wrapper: VueWrapper) {
  return wrapper.emitted('save')![0]![0] as Record<string, unknown>
}

describe('HotspotSettingsForm', () => {
  it('starts from the saved hotspot', () => {
    const wrapper = mountForm({
      ssid: 'Field',
      security: 'wpa3',
      band: 'a',
      channel: 36,
      interface: 'wlan0',
      gateway_cidr: '10.42.0.1/24',
    })
    expect(valueOf(wrapper, SSID)).toBe('Field')
    expect(valueOf(wrapper, PASSPHRASE)).toBe('')
    expect(valueOf(wrapper, SECURITY)).toBe('wpa3')
    expect(valueOf(wrapper, BAND)).toBe('a')
    expect(valueOf(wrapper, CHANNEL)).toBe('36')
    expect(valueOf(wrapper, INTERFACE)).toBe('wlan0')
    expect(valueOf(wrapper, GATEWAY)).toBe('10.42.0.1/24')
    wrapper.unmount()
  })

  it('starts blank for a hotspot that was never set up', () => {
    const wrapper = mountForm({ ssid: null, gateway_cidr: null, interface: null })
    expect(valueOf(wrapper, SSID)).toBe('')
    expect(valueOf(wrapper, GATEWAY)).toBe('')
    const selected = wrapper.get(INTERFACE).element as HTMLSelectElement
    expect(selected.selectedOptions[0]!.textContent).toBe('Automatic')
    wrapper.unmount()
  })

  it('labels every field', () => {
    const wrapper = mountForm()
    expect(
      wrapper
        .findAll('label')
        .slice(0, 7)
        .map((label) => label.text()),
    ).toEqual(['NETWORK NAME', 'PASSWORD', 'SECURITY', 'BAND', 'CHANNEL', 'INTERFACE', 'ADDRESS'])
    wrapper.unmount()
  })

  it('tells the operator a blank password keeps the stored one only when one is stored', () => {
    const stored = mountForm({ passphrase_set: true })
    expect(stored.get(`${PASSPHRASE}-hint`).text()).toBe(
      'Leave blank to keep the current password.',
    )
    stored.unmount()
    const none = mountForm({ passphrase_set: false })
    expect(none.find(`${PASSPHRASE}-hint`).exists()).toBe(false)
    none.unmount()
  })

  describe('band and channel', () => {
    function channelOptions(wrapper: VueWrapper): string[] {
      return wrapper.findAll(`${CHANNEL} option`).map((option) => option.text())
    }

    it('offers Automatic and channels 1 to 14 on 2.4 GHz', () => {
      const wrapper = mountForm({ band: 'bg' })
      const options = channelOptions(wrapper)
      expect(options[0]).toBe('Automatic')
      expect(options).toHaveLength(15)
      expect(options[14]).toBe('Channel 14')
      wrapper.unmount()
    })

    it('offers the 5 GHz channels on 5 GHz', () => {
      const wrapper = mountForm({ band: 'a' })
      const options = channelOptions(wrapper)
      expect(options).toContain('Channel 36')
      expect(options).not.toContain('Channel 6')
      wrapper.unmount()
    })

    it('falls back to Automatic when the chosen channel is not in the new band', async () => {
      const wrapper = mountForm({ band: 'bg', channel: 6 })
      await wrapper.get(BAND).setValue('a')
      expect(valueOf(wrapper, CHANNEL)).toBe('0')
      expect(channelOptions(wrapper)).toContain('Channel 36')
      wrapper.unmount()
    })

    it('falls back to Automatic when going from 5 GHz back to 2.4 GHz', async () => {
      const wrapper = mountForm({ band: 'a', channel: 36 })
      await wrapper.get(BAND).setValue('bg')
      expect(valueOf(wrapper, CHANNEL)).toBe('0')
      wrapper.unmount()
    })

    it('keeps the channel when a change event leaves the band as it was', async () => {
      const wrapper = mountForm({ band: 'bg', channel: 6 })
      await wrapper.get(BAND).trigger('change')
      expect(valueOf(wrapper, CHANNEL)).toBe('6')
      wrapper.unmount()
    })
  })

  describe('interface choice', () => {
    it('offers Automatic plus every interface that can host a network, omitting those that cannot', () => {
      const wrapper = mountForm({}, [
        wireless({ name: 'wlan0', supports_ap: true }),
        wireless({ name: 'wlan1', supports_ap: false }),
        wireless({ name: 'wlan2', supports_ap: null }),
      ])
      expect(wrapper.findAll(`${INTERFACE} option`).map((option) => option.text())).toEqual([
        'Automatic',
        'wlan0',
        'wlan2',
      ])
      wrapper.unmount()
    })

    it('shows the network an interface is currently joined to', () => {
      const wrapper = mountForm({}, [wireless({ name: 'wlan0', station_ssid: 'Home' })])
      expect(wrapper.findAll(`${INTERFACE} option`)[1]!.text()).toBe('wlan0 (on Home)')
      wrapper.unmount()
    })
  })

  describe('losing the uplink', () => {
    const CARRYING = [wireless({ name: 'wlan0', carries_default_route: true })]

    function acknowledge(wrapper: VueWrapper) {
      return wrapper.findAll('.hotspot-check--danger input')
    }

    it('asks for no acknowledgement while the hotspot is not to start now', () => {
      const wrapper = mountForm({ interface: 'wlan0', enabled: false }, CARRYING)
      expect(wrapper.find('.hotspot-check--danger').exists()).toBe(false)
      wrapper.unmount()
    })

    it('asks for none when the chosen interface does not carry the default route', () => {
      const wrapper = mountForm({ interface: 'wlan0', enabled: true }, [wireless()])
      expect(wrapper.find('.hotspot-check--danger').exists()).toBe(false)
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })

    it('asks for none when the chosen interface is not in the list', () => {
      const wrapper = mountForm({ interface: 'wlan9', enabled: true }, CARRYING)
      expect(wrapper.find('.hotspot-check--danger').exists()).toBe(false)
      wrapper.unmount()
    })

    it('requires an acknowledgement naming the interface, and holds SAVE until it is ticked', async () => {
      const wrapper = mountForm({ interface: 'wlan0', enabled: true }, CARRYING)
      expect(wrapper.get('.hotspot-check--danger').text()).toContain('on wlan0')
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeDefined()
      await acknowledge(wrapper)[0]!.setValue(true)
      expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })

    it('follows the state’s own uplink flag when the interface is Automatic', () => {
      const dropping = mountForm({
        interface: null,
        enabled: true,
        uplink_interface_is_hotspot_interface: true,
      })
      expect(dropping.get('.hotspot-check--danger').text()).toContain('its wireless interface')
      dropping.unmount()
      const safe = mountForm({
        interface: null,
        enabled: true,
        uplink_interface_is_hotspot_interface: false,
      })
      expect(safe.find('.hotspot-check--danger').exists()).toBe(false)
      safe.unmount()
    })

    it('sends the acknowledgement with the save', async () => {
      const wrapper = mountForm({ interface: 'wlan0', enabled: true }, CARRYING)
      await acknowledge(wrapper)[0]!.setValue(true)
      await submit(wrapper)
      expect(emittedBody(wrapper).confirm_uplink_loss).toBe(true)
      wrapper.unmount()
    })
  })

  describe('saving', () => {
    it('emits the form as the API wants it, leaving the password out when blank', async () => {
      const wrapper = mountForm({
        ssid: 'Field',
        security: 'wpa2',
        band: 'bg',
        channel: 6,
        interface: 'wlan0',
        hidden: true,
        enabled: false,
        gateway_cidr: '  10.42.0.1/24 ',
      })
      await submit(wrapper)
      expect(wrapper.emitted('save')).toHaveLength(1)
      expect(emittedBody(wrapper)).toEqual({
        ssid: 'Field',
        security: 'wpa2',
        hidden: true,
        enabled: false,
        interface: 'wlan0',
        band: 'bg',
        channel: 6,
        gateway_cidr: '10.42.0.1/24',
        confirm_uplink_loss: false,
      })
      expect('passphrase' in emittedBody(wrapper)).toBe(false)
      wrapper.unmount()
    })

    it('sends a typed password and then clears the field', async () => {
      const wrapper = mountForm()
      await wrapper.get(PASSPHRASE).setValue('correct horse')
      await submit(wrapper)
      expect(emittedBody(wrapper).passphrase).toBe('correct horse')
      expect(valueOf(wrapper, PASSPHRASE)).toBe('')
      wrapper.unmount()
    })

    it('sends a null address for a blank address field', async () => {
      const wrapper = mountForm({ gateway_cidr: null })
      await submit(wrapper)
      expect(emittedBody(wrapper).gateway_cidr).toBeNull()
      wrapper.unmount()
    })

    it('sends the edited values', async () => {
      const wrapper = mountForm()
      await wrapper.get(SSID).setValue('New name')
      await wrapper.get(SECURITY).setValue('wpa3')
      await wrapper.get(BAND).setValue('a')
      await wrapper.get(CHANNEL).setValue('44')
      await wrapper.get(INTERFACE).setValue('wlan0')
      await wrapper.findAll('.hotspot-check input')[0]!.setValue(true)
      await wrapper.findAll('.hotspot-check input')[1]!.setValue(true)
      await submit(wrapper)
      expect(emittedBody(wrapper)).toMatchObject({
        ssid: 'New name',
        security: 'wpa3',
        band: 'a',
        channel: 44,
        interface: 'wlan0',
        hidden: true,
        enabled: true,
      })
      wrapper.unmount()
    })

    it('shows SAVING… and disables SAVE HOTSPOT while busy', () => {
      const wrapper = mountForm({}, [wireless()], true)
      const button = wrapper.get('button[type="submit"]')
      expect(button.text()).toBe('SAVING…')
      expect(button.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('is labelled SAVE HOTSPOT when idle', () => {
      const wrapper = mountForm()
      expect(wrapper.get('button[type="submit"]').text()).toBe('SAVE HOTSPOT')
      wrapper.unmount()
    })
  })

  describe('validation', () => {
    it('refuses an empty network name, flags it and focuses it', async () => {
      const wrapper = mountForm({ ssid: null })
      await submit(wrapper)
      expect(wrapper.get(`${SSID}-error`).text()).toBe('Enter a network name.')
      expect(wrapper.get(SSID).attributes('aria-invalid')).toBe('true')
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(document.activeElement).toBe(wrapper.get(SSID).element)
      wrapper.unmount()
    })

    it('requires a password when none is stored, and focuses it', async () => {
      const wrapper = mountForm({ passphrase_set: false })
      await submit(wrapper)
      expect(wrapper.get(`${PASSPHRASE}-error`).text()).toContain('8 to 63')
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(document.activeElement).toBe(wrapper.get(PASSPHRASE).element)
      wrapper.unmount()
    })

    it('accepts a blank password when one is stored', async () => {
      const wrapper = mountForm({ passphrase_set: true })
      await submit(wrapper)
      expect(wrapper.find(`${PASSPHRASE}-error`).exists()).toBe(false)
      expect(wrapper.emitted('save')).toHaveLength(1)
      wrapper.unmount()
    })

    it('rejects a typed password that is too short even when one is stored', async () => {
      const wrapper = mountForm({ passphrase_set: true })
      await wrapper.get(PASSPHRASE).setValue('short')
      await submit(wrapper)
      expect(wrapper.find(`${PASSPHRASE}-error`).exists()).toBe(true)
      expect(wrapper.emitted('save')).toBeUndefined()
      wrapper.unmount()
    })

    it('rejects a malformed address, flags it and focuses it', async () => {
      const wrapper = mountForm()
      await wrapper.get(GATEWAY).setValue('not an address')
      await submit(wrapper)
      expect(wrapper.get(`${GATEWAY}-error`).text()).toBe('Write the address like 10.42.0.1/24.')
      expect(wrapper.emitted('save')).toBeUndefined()
      expect(document.activeElement).toBe(wrapper.get(GATEWAY).element)
      wrapper.unmount()
    })

    it('does not check a blank address', async () => {
      const wrapper = mountForm()
      await wrapper.get(GATEWAY).setValue('   ')
      await submit(wrapper)
      expect(wrapper.find(`${GATEWAY}-error`).exists()).toBe(false)
      wrapper.unmount()
    })

    it('focuses the first field in error: name before password before address', async () => {
      const wrapper = mountForm({ ssid: null, passphrase_set: false })
      await wrapper.get(GATEWAY).setValue('nope')
      await submit(wrapper)
      expect(document.activeElement).toBe(wrapper.get(SSID).element)
      await wrapper.get(SSID).setValue('Field')
      await submit(wrapper)
      expect(document.activeElement).toBe(wrapper.get(PASSPHRASE).element)
      await wrapper.get(PASSPHRASE).setValue('correct horse')
      await submit(wrapper)
      expect(document.activeElement).toBe(wrapper.get(GATEWAY).element)
      wrapper.unmount()
    })

    it('clears each message once its field is fixed and the form is saved', async () => {
      const wrapper = mountForm({ ssid: null })
      await submit(wrapper)
      await wrapper.get(SSID).setValue('Field')
      await submit(wrapper)
      expect(wrapper.find(`${SSID}-error`).exists()).toBe(false)
      expect(wrapper.emitted('save')).toHaveLength(1)
      wrapper.unmount()
    })
  })

  it('has no accessibility violations, with and without errors', async () => {
    const wrapper = mountForm({ ssid: null, interface: 'wlan0', enabled: true }, [
      wireless({ carries_default_route: true, station_ssid: 'Home' }),
    ])
    await expectNoAxeViolations(wrapper)
    await submit(wrapper)
    await expectNoAxeViolations(wrapper)
    wrapper.unmount()
  })
})
