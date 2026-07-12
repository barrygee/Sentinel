import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrTrunkSection from './SdrTrunkSection.vue'
import { MENU_OPEN_SETTLE_MS } from '@/composables/useTeleportedMenu'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  // The teleported menu can linger between mounts — clear it so document
  // queries always resolve to the current instance.
  document.querySelectorAll('.sdr-device-menu').forEach((node) => node.remove())
})

interface MountProps {
  expanded?: boolean
  channelMap?: string
  trunkEnabled?: boolean
  channelMaps?: string[]
  canFollow?: boolean
  trunkError?: string
}

function mountSection(props: MountProps = {}): VueWrapper {
  // Both v-models are wired back into props so the component behaves as it
  // does under the panel's v-model bindings (toggle actually collapses, a
  // pick actually changes the selected label).
  const wrapper: VueWrapper = mount(SdrTrunkSection, {
    props: {
      expanded: true,
      channelMap: '',
      trunkEnabled: false,
      channelMaps: ['site-a.csv', 'site-b.csv'],
      canFollow: true,
      trunkError: '',
      'onUpdate:expanded': (value: boolean) => {
        void wrapper.setProps({ expanded: value })
      },
      'onUpdate:channelMap': (value: string) => {
        void wrapper.setProps({ channelMap: value })
      },
      ...props,
    },
    attachTo: document.body,
  })
  return wrapper
}

function menuElement(): HTMLElement | null {
  return document.querySelector('.sdr-trunk-menu')
}

function menuItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.sdr-trunk-menu .sdr-device-menu-item'))
}

describe('SdrTrunkSection — rendering', () => {
  it('shows "No channel map" when none is chosen and the map name when one is', async () => {
    const wrapper = mountSection()
    expect(wrapper.find('.sdr-device-dropdown-text').text()).toBe('No channel map')
    await wrapper.setProps({ channelMap: 'site-b.csv' })
    expect(wrapper.find('.sdr-device-dropdown-text').text()).toBe('site-b.csv')
  })

  it('collapses and expands the accordion body through the expanded model', async () => {
    const wrapper = mountSection()
    expect(wrapper.find('#sdr-trunk-section-body').isVisible()).toBe(true)
    await wrapper.find('.sdr-frequency-manager-accordion-toggle').trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[false]])
    expect(wrapper.find('#sdr-trunk-section-body').isVisible()).toBe(false)
    await wrapper.find('.sdr-frequency-manager-accordion-toggle').trigger('click')
    expect(wrapper.find('#sdr-trunk-section-body').isVisible()).toBe(true)
  })

  it('shows the CSV hint only when the backend offers no channel maps', async () => {
    const wrapper = mountSection({ channelMaps: [] })
    expect(wrapper.find('.sdr-trunk-hint').exists()).toBe(true)
    await wrapper.setProps({ channelMaps: ['site-a.csv'] })
    expect(wrapper.find('.sdr-trunk-hint').exists()).toBe(false)
  })

  it('renders the backend rejection message as an alert', async () => {
    const wrapper = mountSection({ trunkError: 'channel map not found' })
    const error = wrapper.find('.sdr-trunk-error')
    expect(error.text()).toBe('channel map not found')
    expect(error.attributes('role')).toBe('alert')
    await wrapper.setProps({ trunkError: '' })
    expect(wrapper.find('.sdr-trunk-error').exists()).toBe(false)
  })
})

describe('SdrTrunkSection — FOLLOW SYSTEM button', () => {
  it('emits toggle-follow on click and reflects the following state', async () => {
    const wrapper = mountSection()
    const followButton = wrapper.find('.sdr-trunk-follow-btn')
    expect(followButton.text()).toContain('FOLLOW SYSTEM')
    expect(followButton.attributes('aria-pressed')).toBe('false')
    await followButton.trigger('click')
    expect(wrapper.emitted('toggle-follow')).toHaveLength(1)

    await wrapper.setProps({ trunkEnabled: true })
    expect(followButton.text()).toContain('FOLLOWING SYSTEM')
    expect(followButton.classes()).toContain('sdr-trunk-follow-btn--active')
    expect(followButton.attributes('aria-pressed')).toBe('true')
    // Still clickable while following (that's how the follow is stopped).
    expect(followButton.attributes('disabled')).toBeUndefined()
  })

  it('is disabled when a follow may not start and none is active', () => {
    const wrapper = mountSection({ canFollow: false })
    expect(wrapper.find('.sdr-trunk-follow-btn').attributes('disabled')).toBeDefined()
  })
})

describe('SdrTrunkSection — channel-map dropdown', () => {
  it('opens on click, marks the current map selected, picks one and closes', async () => {
    const wrapper = mountSection({ channelMap: 'site-a.csv' })
    await wrapper.find('.sdr-trunk-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    const items = menuItems()
    // 'No channel map' + the two offered files.
    expect(items.map((item) => item.textContent?.trim())).toEqual([
      'No channel map',
      'site-a.csv',
      'site-b.csv',
    ])
    expect(items[1].classList.contains('sdr-device-menu-item--selected')).toBe(true)
    items[2].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:channelMap')).toEqual([['site-b.csv']])
    expect(menuElement()).toBeNull()
    expect(wrapper.find('.sdr-device-dropdown-text').text()).toBe('site-b.csv')
  })

  it('clears the selection through the "No channel map" option', async () => {
    const wrapper = mountSection({ channelMap: 'site-a.csv' })
    await wrapper.find('.sdr-trunk-dropdown').trigger('click')
    menuItems()[0].click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:channelMap')).toEqual([['']])
    expect(wrapper.find('.sdr-device-dropdown-text').text()).toBe('No channel map')
  })

  it('locks the picker while a follow is active (click and keyboard)', async () => {
    const wrapper = mountSection({ channelMap: 'site-a.csv', trunkEnabled: true })
    const dropdown = wrapper.find('.sdr-trunk-dropdown')
    expect(dropdown.classes()).toContain('sdr-device-dropdown--loading')
    await dropdown.trigger('click')
    expect(menuElement()).toBeNull()
    await dropdown.trigger('keydown', { key: 'Enter' })
    expect(menuElement()).toBeNull()
  })

  it('toggles closed on a second click and supports Enter/space/Escape', async () => {
    const wrapper = mountSection()
    const dropdown = wrapper.find('.sdr-trunk-dropdown')
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
    const wrapper = mountSection()
    await wrapper.find('.sdr-trunk-dropdown').trigger('click')
    document.body.click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
    await wrapper.find('.sdr-trunk-dropdown').trigger('click')
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('survives the settle scroll right after opening, then closes on a later scroll', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(80_000)
    const wrapper = mountSection()
    await wrapper.find('.sdr-trunk-dropdown').trigger('click')
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    vi.setSystemTime(80_000 + MENU_OPEN_SETTLE_MS + 1)
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('positions the menu from the trigger rect at open time', async () => {
    const wrapper = mountSection()
    const trigger = wrapper.find('.sdr-trunk-dropdown').element as HTMLElement
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
    await wrapper.find('.sdr-trunk-dropdown').trigger('click')
    const menu = menuElement()!
    expect(menu.style.left).toBe('20px')
    expect(menu.style.top).toBe('50px')
    expect(menu.style.width).toBe('160px')
  })
})

describe('SdrTrunkSection — accessibility', () => {
  it('has no axe violations expanded with the menu open', async () => {
    const wrapper = mountSection()
    await wrapper.find('.sdr-trunk-dropdown').trigger('keydown', { key: 'Enter' })
    expect(
      await axe(document.body.innerHTML, {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
