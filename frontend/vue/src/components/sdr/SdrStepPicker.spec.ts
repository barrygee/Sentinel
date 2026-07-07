import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrStepPicker from './SdrStepPicker.vue'
import { MENU_OPEN_SETTLE_MS } from './sdrPanelUtils'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  // The teleported menu can linger between mounts — clear it so document
  // queries always resolve to the current instance.
  document.querySelectorAll('.sdr-step-menu').forEach((node) => node.remove())
})

function mountPicker(props: { modelValue?: string; disabled?: boolean } = {}): VueWrapper {
  return mount(SdrStepPicker, {
    props: { modelValue: '12.5', ...props },
    attachTo: document.body,
  })
}

function menuElement(): HTMLElement | null {
  return document.querySelector('.sdr-step-menu')
}

describe('SdrStepPicker — trigger', () => {
  it('renders the current step as a kHz label', () => {
    const wrapper = mountPicker({ modelValue: '8.33' })
    expect(wrapper.find('.sdr-device-dropdown-text').text()).toBe('8.33 kHz')
  })

  it('applies the loading style when disabled', () => {
    const wrapper = mountPicker({ disabled: true })
    expect(wrapper.find('.sdr-step-dropdown').classes()).toContain('sdr-device-dropdown--loading')
  })
})

describe('SdrStepPicker — menu open/close', () => {
  it('opens on click, marks the current step selected, and closes on a second click', async () => {
    const wrapper = mountPicker({ modelValue: '25' })
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    expect(wrapper.find('.sdr-step-dropdown').classes()).toContain('sdr-device-dropdown--open')
    const selected = document.querySelector('.sdr-device-menu-item--selected')
    expect(selected?.textContent?.trim()).toBe('25 kHz')
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    expect(menuElement()).toBeNull()
  })

  it('ignores clicks when disabled', async () => {
    const wrapper = mountPicker({ disabled: true })
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    expect(menuElement()).toBeNull()
  })

  it('opens with Enter and space, and closes with Escape (even when disabled)', async () => {
    const wrapper = mountPicker({ disabled: true })
    await wrapper.find('.sdr-step-dropdown').trigger('keydown', { key: 'Enter' })
    expect(menuElement()).not.toBeNull()
    await wrapper.find('.sdr-step-dropdown').trigger('keydown', { key: 'Escape' })
    expect(menuElement()).toBeNull()
    await wrapper.find('.sdr-step-dropdown').trigger('keydown', { key: ' ' })
    expect(menuElement()).not.toBeNull()
  })

  it('ignores unrelated keys', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-step-dropdown').trigger('keydown', { key: 'a' })
    expect(menuElement()).toBeNull()
  })

  it('closes on an outside document click', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    document.body.click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('survives the settle scroll right after opening, then closes on a later scroll', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(100_000)
    const wrapper = mountPicker()
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    // Settle scroll (the browser scrolling the focused trigger into view).
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    // A genuine user scroll after the settle window dismisses the menu.
    vi.setSystemTime(100_000 + MENU_OPEN_SETTLE_MS + 1)
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('closes on window resize', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })
})

describe('SdrStepPicker — picking', () => {
  it('emits the picked step as a string and closes the menu', async () => {
    const wrapper = mountPicker({ modelValue: '12.5' })
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    const items = Array.from(document.querySelectorAll('.sdr-step-menu .sdr-device-menu-item'))
    const target = items.find((item) => item.textContent?.trim() === '8.33 kHz') as HTMLElement
    target.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toEqual([['8.33']])
    expect(menuElement()).toBeNull()
  })

  it('positions the menu from the trigger rect at open time', async () => {
    const wrapper = mountPicker()
    const trigger = wrapper.find('.sdr-step-dropdown').element as HTMLElement
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      bottom: 42,
      width: 120,
      top: 20,
      right: 130,
      height: 22,
      x: 10,
      y: 20,
      toJSON: () => ({}),
    } as DOMRect)
    await wrapper.find('.sdr-step-dropdown').trigger('click')
    const menu = menuElement()!
    expect(menu.style.left).toBe('10px')
    expect(menu.style.top).toBe('42px')
    expect(menu.style.width).toBe('120px')
  })
})

describe('SdrStepPicker — accessibility', () => {
  it('has no axe violations with the menu open', async () => {
    const wrapper = mountPicker()
    await wrapper.find('.sdr-step-dropdown').trigger('keydown', { key: 'Enter' })
    expect(
      await axe(document.body.innerHTML, {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
