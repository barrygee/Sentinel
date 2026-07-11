import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSettingsAccordion from './SdrSettingsAccordion.vue'
import { MENU_OPEN_SETTLE_MS } from './sdrPanelUtils'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  // The teleported menu can linger between mounts — clear it so document
  // queries always resolve to the current instance.
  document.querySelectorAll('.sdr-device-menu').forEach((node) => node.remove())
})

interface MountProps {
  volume?: number
  squelch?: number
  bwHz?: number
  bwMax?: number
  gainDb?: number
  gainAuto?: boolean
  sampleRateHz?: number
  controlsDisabled?: boolean
  tuningDisabled?: boolean
}

function mountAccordion(props: MountProps = {}): VueWrapper {
  return mount(SdrSettingsAccordion, {
    props: {
      volume: 80,
      squelch: -60,
      bwHz: 10_000,
      bwMax: 2_048_000,
      gainDb: 30,
      gainAuto: false,
      sampleRateHz: 2_048_000,
      controlsDisabled: false,
      tuningDisabled: false,
      ...props,
    },
    attachTo: document.body,
  })
}

function slider(wrapper: VueWrapper, ariaLabel: string) {
  return wrapper.find(`input[aria-label="${ariaLabel}"]`)
}

function menuElement(): HTMLElement | null {
  return document.querySelector('.sdr-device-menu')
}

describe('SdrSettingsAccordion — rendering', () => {
  it('shows the current values in each slider header', () => {
    const wrapper = mountAccordion({ volume: 120, squelch: -80, bwHz: 12_500 })
    const values = wrapper.findAll('.sdr-slider-val').map((value) => value.text())
    expect(values[0]).toBe('120%')
    expect(values[1]).toBe('-80 dBFS')
    expect(values[2]).toBe('13 kHz') // formatBwHz rounds kHz values
    expect(values[3]).toBe('30.0 dB')
    expect(values[4]).toBe('2.05 MHz')
  })

  it('renders AUTO for the gain value and disables the gain slider when AGC is on', () => {
    const wrapper = mountAccordion({ gainAuto: true })
    expect(wrapper.findAll('.sdr-slider-val')[3].text()).toBe('AUTO')
    expect(slider(wrapper, 'RF gain in dB').attributes('disabled')).toBeDefined()
    expect((wrapper.find('.sdr-checkbox').element as HTMLInputElement).checked).toBe(true)
  })

  it('dims values and disables controls per the disabled flags', () => {
    const wrapper = mountAccordion({ controlsDisabled: true, tuningDisabled: true })
    expect(wrapper.findAll('.sdr-slider-val--dimmed')).toHaveLength(5)
    expect(slider(wrapper, 'Volume').attributes('disabled')).toBeDefined()
    expect(slider(wrapper, 'Squelch in dBFS').attributes('disabled')).toBeDefined()
    expect(slider(wrapper, 'Bandwidth').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.sdr-checkbox').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.sdr-device-dropdown').classes()).toContain('sdr-device-dropdown--loading')
  })

  it('collapses and expands the accordion body', async () => {
    const wrapper = mountAccordion()
    expect(wrapper.find('#sdr-settings-section').isVisible()).toBe(true)
    await wrapper.find('.sdr-frequency-manager-accordion-toggle').trigger('click')
    expect(wrapper.find('#sdr-settings-section').isVisible()).toBe(false)
    await wrapper.find('.sdr-frequency-manager-accordion-toggle').trigger('click')
    expect(wrapper.find('#sdr-settings-section').isVisible()).toBe(true)
  })

  it('caps the bandwidth slider at bwMax', () => {
    const wrapper = mountAccordion({ bwMax: 1_024_000 })
    expect(slider(wrapper, 'Bandwidth').attributes('max')).toBe('1024000')
  })
})

describe('SdrSettingsAccordion — event forwarding', () => {
  it('forwards the raw DOM event from every slider and the AGC checkbox', async () => {
    const wrapper = mountAccordion()
    await slider(wrapper, 'Volume').setValue('120')
    await slider(wrapper, 'Squelch in dBFS').setValue('-90')
    await slider(wrapper, 'Bandwidth').setValue('12000')
    await slider(wrapper, 'RF gain in dB').setValue('20.5')
    await wrapper.find('.sdr-checkbox').setValue(true)
    for (const [eventName, expectedValue] of [
      ['volume-input', '120'],
      ['squelch-input', '-90'],
      ['bw-input', '12000'],
      ['gain-input', '20.5'],
    ] as const) {
      const emitted = wrapper.emitted(eventName)
      expect(emitted).toHaveLength(1)
      // The RAW event is forwarded — the parent handler reads event.target
      // itself so its debounce/worklet side effects stay byte-identical.
      const domEvent = emitted![0][0] as Event
      expect((domEvent.target as HTMLInputElement).value).toBe(expectedValue)
    }
    const agc = wrapper.emitted('agc-change')
    expect(agc).toHaveLength(1)
    expect(((agc![0][0] as Event).target as HTMLInputElement).checked).toBe(true)
  })
})

describe('SdrSettingsAccordion — sample-rate dropdown', () => {
  it('opens on click, marks the current rate selected, picks a rate and emits it', async () => {
    const wrapper = mountAccordion({ sampleRateHz: 2_048_000 })
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    const items = Array.from(document.querySelectorAll('.sdr-device-menu-item'))
    expect(
      items.find((item) => item.classList.contains('sdr-device-menu-item--selected'))?.textContent,
    ).toContain('2.05 MHz')
    ;(items.find((item) => item.textContent?.includes('1.02 MHz')) as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('pick-sample-rate')).toEqual([[1024000]])
    expect(menuElement()).toBeNull()
  })

  it('ignores clicks while controls are disabled', async () => {
    const wrapper = mountAccordion({ controlsDisabled: true })
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    expect(menuElement()).toBeNull()
  })

  it('toggles closed on a second click and supports Enter/space/Escape', async () => {
    const wrapper = mountAccordion()
    const dropdown = wrapper.find('.sdr-device-dropdown')
    await dropdown.trigger('click')
    await dropdown.trigger('click')
    expect(menuElement()).toBeNull()
    await dropdown.trigger('keydown', { key: 'Enter' })
    expect(menuElement()).not.toBeNull()
    await dropdown.trigger('keydown', { key: 'Escape' })
    expect(menuElement()).toBeNull()
    await dropdown.trigger('keydown', { key: ' ' })
    expect(menuElement()).not.toBeNull()
    await dropdown.trigger('keydown', { key: 'x' })
    expect(menuElement()).not.toBeNull()
  })

  it('closes on an outside click and on window resize', async () => {
    const wrapper = mountAccordion()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    document.body.click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('survives the settle scroll right after opening, then closes on a later scroll', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(80_000)
    const wrapper = mountAccordion()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    vi.setSystemTime(80_000 + MENU_OPEN_SETTLE_MS + 1)
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('positions the menu from the trigger rect at open time', async () => {
    const wrapper = mountAccordion()
    const trigger = wrapper.find('.sdr-device-dropdown').element as HTMLElement
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 20,
      bottom: 50,
      width: 160,
      top: 30,
      right: 180,
      height: 20,
      x: 20,
      y: 30,
      toJSON: () => ({}),
    } as DOMRect)
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    const menu = menuElement()!
    expect(menu.style.left).toBe('20px')
    expect(menu.style.top).toBe('50px')
    expect(menu.style.width).toBe('160px')
  })
})

describe('SdrSettingsAccordion — accessibility', () => {
  it('has no axe violations expanded with the menu open', async () => {
    const wrapper = mountAccordion()
    await wrapper.find('.sdr-device-dropdown').trigger('keydown', { key: 'Enter' })
    expect(
      await axe(document.body.innerHTML, {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
