import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSampleRatePicker from './SdrSampleRatePicker.vue'
import { MENU_OPEN_SETTLE_MS } from './sdrPanelUtils'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  // The teleported menu can linger between mounts — clear it so document
  // queries always resolve to the current instance.
  document.querySelectorAll('.sdr-device-menu').forEach((node) => node.remove())
})

function mountPicker(props: { modelValue?: number } = {}): VueWrapper {
  return mount(SdrSampleRatePicker, {
    props: { modelValue: 2048000, ...props },
    attachTo: document.body,
  })
}

function menuElement(): HTMLElement | null {
  return document.querySelector('.sdr-device-menu[role="listbox"]')
}

describe('SdrSampleRatePicker — trigger', () => {
  it('renders the current rate formatted and exposes listbox ARIA on the trigger', () => {
    const wrapper = mountPicker({ modelValue: 1024000 })
    const trigger = wrapper.find('.sdr-ef-setting-dropdown')
    expect(trigger.find('.sdr-device-dropdown-text').text()).toBe('1.02 MHz')
    expect(trigger.attributes('role')).toBe('button')
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.attributes('aria-label')).toBe('Device sample rate')
  })
})

describe('SdrSampleRatePicker — menu open/close', () => {
  it('opens on click, marks the current rate selected, and closes on a second click', async () => {
    const wrapper = mountPicker({ modelValue: 1536000 })
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    expect(wrapper.find('.sdr-ef-setting-dropdown').attributes('aria-expanded')).toBe('true')
    const selected = document.querySelector('.sdr-device-menu-item--selected')
    expect(selected?.textContent?.trim()).toBe('1.54 MHz')
    expect(selected?.getAttribute('aria-selected')).toBe('true')
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    expect(menuElement()).toBeNull()
  })

  it('opens with Enter and space, and closes with Escape', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('keydown', { key: 'Enter' })
    expect(menuElement()).not.toBeNull()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('keydown', { key: 'Escape' })
    expect(menuElement()).toBeNull()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('keydown', { key: ' ' })
    expect(menuElement()).not.toBeNull()
  })

  it('ignores unrelated keys', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('keydown', { key: 'a' })
    expect(menuElement()).toBeNull()
  })

  it('closes on an outside document click', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    document.body.click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('survives the settle scroll right after opening, then closes on a later scroll', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(200_000)
    const wrapper = mountPicker()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    // Settle scroll (the browser scrolling the focused trigger into view).
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    // A genuine user scroll after the settle window dismisses the menu.
    vi.setSystemTime(200_000 + MENU_OPEN_SETTLE_MS + 1)
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('closes on window resize', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })
})

describe('SdrSampleRatePicker — picking', () => {
  it('emits the picked rate as a number and closes the menu', async () => {
    const wrapper = mountPicker({ modelValue: 2048000 })
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    const items = Array.from(document.querySelectorAll('.sdr-device-menu-item'))
    const target = items.find((item) => item.textContent?.trim() === '1.02 MHz') as HTMLElement
    target.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([[1024000]])
    expect(menuElement()).toBeNull()
  })

  it('positions the menu from the trigger rect at open time', async () => {
    const wrapper = mountPicker()
    const trigger = wrapper.find('.sdr-ef-setting-dropdown').element as HTMLElement
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 30,
      bottom: 60,
      width: 140,
      top: 40,
      right: 170,
      height: 20,
      x: 30,
      y: 40,
      toJSON: () => ({}),
    } as DOMRect)
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('click')
    const menu = menuElement()!
    expect(menu.style.left).toBe('30px')
    expect(menu.style.top).toBe('60px')
    expect(menu.style.width).toBe('140px')
  })
})

describe('SdrSampleRatePicker — accessibility', () => {
  it('has no axe violations with the menu open', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-ef-setting-dropdown').trigger('keydown', { key: 'Enter' })
    expect(
      await axe(document.body.innerHTML, {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
