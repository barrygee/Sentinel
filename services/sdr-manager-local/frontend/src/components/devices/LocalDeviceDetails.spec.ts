import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import type { LocalDeviceStatus } from '../../api/types'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import LocalDeviceDetails from './LocalDeviceDetails.vue'

/** The text of the `dd` that follows the `dt` called `term`, or null when there is no such row. */
function valueOf(device: LocalDeviceStatus, term: string): string | null {
  const wrapper = mount(LocalDeviceDetails, { props: { device } })
  const row = wrapper.findAll('div').find((candidate) => candidate.get('dt').text() === term)
  return row ? row.get('dd').text().replace(/\s+/g, ' ') : null
}

describe('LocalDeviceDetails', () => {
  it('shows the model as manufacturer and product, and the serial and USB port', () => {
    const device = makeDevice()
    expect(valueOf(device, 'MODEL')).toBe('Realtek RTL2838')
    expect(valueOf(device, 'SERIAL')).toBe('00000001')
    expect(valueOf(device, 'USB PORT')).toBe('1-1')
  })

  it('shows only the part of the model that is known', () => {
    const usb = { manufacturer: null, product: 'RTL2838', serial: null, topology_path: null }
    expect(valueOf(makeDevice({ usb }), 'MODEL')).toBe('RTL2838')
    expect(
      valueOf(makeDevice({ usb: { ...usb, manufacturer: 'Realtek', product: null } }), 'MODEL'),
    ).toBe('Realtek')
  })

  it('shows Unknown and dashes when the USB identity has nothing in it', () => {
    const usb = { manufacturer: null, product: null, serial: null, topology_path: null }
    const device = makeDevice({ usb })
    expect(valueOf(device, 'MODEL')).toBe('Unknown')
    expect(valueOf(device, 'SERIAL')).toBe('—')
    expect(valueOf(device, 'USB PORT')).toBe('—')
  })

  it('falls back to what an unplugged device was last seen as', () => {
    const device = makeDevice({
      present: false,
      usb: null,
      usb_last_known: {
        manufacturer: 'Nooelec',
        product: 'NESDR',
        serial: 'ABC',
        topology_path: '2-3',
      },
    })
    expect(valueOf(device, 'MODEL')).toBe('Nooelec NESDR')
    expect(valueOf(device, 'SERIAL')).toBe('ABC')
    expect(valueOf(device, 'USB PORT')).toBe('2-3')
  })

  it('shows Unknown when there is no USB identity at all', () => {
    const device = makeDevice({ usb: null, usb_last_known: null })
    expect(valueOf(device, 'MODEL')).toBe('Unknown')
    expect(valueOf(device, 'USB PORT')).toBe('—')
  })

  it('lists the IQ and control ports when the device has output', () => {
    expect(valueOf(makeDevice(), 'PORTS')).toBe('IQ 1234 · CONTROL 1236')
  })

  it('has no PORTS row for a device that was never set up', () => {
    expect(valueOf(makeDevice({ output: null }), 'PORTS')).toBeNull()
  })

  it('has no TUNED TO row while the tuner has reported nothing', () => {
    expect(valueOf(makeDevice({ tuner: null }), 'TUNED TO')).toBeNull()
  })

  it('shows the tuner’s frequency, sample rate and fixed gain', () => {
    const tuner = {
      center_hz: 433_920_000,
      sample_rate: 2_048_000,
      gain_db: 28.5,
      gain_auto: false,
      locked: false,
      observed_at: 0,
    }
    expect(valueOf(makeDevice({ tuner }), 'TUNED TO')).toBe('433.920 MHz · 2048 kS/s · 28.5 dB')
  })

  it('shows AUTO GAIN instead of a gain figure when the tuner is on automatic gain', () => {
    const tuner = {
      center_hz: 1_090_000_000,
      sample_rate: 2_400_000,
      gain_db: 40,
      gain_auto: true,
      locked: false,
      observed_at: 0,
    }
    const text = valueOf(makeDevice({ tuner }), 'TUNED TO')
    expect(text).toBe('1090.000 MHz · 2400 kS/s · AUTO GAIN')
    expect(text).not.toContain('dB')
  })

  it('has no accessibility violations', async () => {
    const tuner = {
      center_hz: 100e6,
      sample_rate: 2e6,
      gain_db: 1,
      gain_auto: false,
      locked: false,
      observed_at: 0,
    }
    await expectNoAxeViolations(
      mount(LocalDeviceDetails, { props: { device: makeDevice({ tuner }) } }),
    )
  })
})
