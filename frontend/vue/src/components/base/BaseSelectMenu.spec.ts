import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseSelectMenu from './BaseSelectMenu.vue'
import { MENU_OPEN_SETTLE_MS } from '@/composables/useTeleportedMenu'

enableAutoUnmount(afterEach)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  // The teleported menu can linger between mounts — clear it so document
  // queries always resolve to the current instance.
  document.querySelectorAll('.sdr-device-menu').forEach((node) => node.remove())
})

interface BaseSelectMenuTestProps {
  loading?: boolean
  disabled?: boolean
  triggerRole?: 'button' | 'combobox'
  customKeyboard?: boolean
  menuClass?: string
  menuAttrs?: Record<string, string>
}

interface MountOptions {
  props?: BaseSelectMenuTestProps
  attrs?: Record<string, unknown>
}

function mountMenu(options: MountOptions = {}): VueWrapper {
  return mount(BaseSelectMenu, {
    props: options.props,
    attrs: options.attrs,
    slots: {
      selected: '<span class="test-selected-label">CHOSEN</span>',
      options: `
        <template #options="{ close }">
          <div class="test-option" @click="close()">row</div>
        </template>
      `,
    },
    attachTo: document.body,
  })
}

function menuElement(): HTMLElement | null {
  return document.querySelector('.sdr-device-menu')
}

describe('BaseSelectMenu — trigger rendering', () => {
  it('renders the dropdown shell with the selected slot before the arrow and no popup ARIA by default', () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('.sdr-device-dropdown')
    expect(trigger.attributes('tabindex')).toBe('0')
    expect(trigger.attributes('role')).toBeUndefined()
    expect(trigger.attributes('aria-haspopup')).toBeUndefined()
    expect(trigger.attributes('aria-expanded')).toBeUndefined()
    expect(trigger.classes()).not.toContain('sdr-device-dropdown--loading')
    const selectedWrapper = trigger.find('.sdr-device-dropdown-selected')
    expect(selectedWrapper.find('.test-selected-label').text()).toBe('CHOSEN')
    // The arrow glyph is the wrapper's last child, after the slot content.
    expect(
      selectedWrapper.element.lastElementChild?.classList.contains('sdr-device-dropdown-arrow'),
    ).toBe(true)
  })

  it('applies the loading style when loading', () => {
    const wrapper = mountMenu({ props: { loading: true } })
    expect(wrapper.find('.sdr-device-dropdown').classes()).toContain('sdr-device-dropdown--loading')
  })

  it('renders popup ARIA with a live aria-expanded when triggerRole is set', async () => {
    const wrapper = mountMenu({ props: { triggerRole: 'combobox' } })
    const trigger = wrapper.find('.sdr-device-dropdown')
    expect(trigger.attributes('role')).toBe('combobox')
    expect(trigger.attributes('aria-haspopup')).toBe('listbox')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    await trigger.trigger('click')
    expect(trigger.attributes('aria-expanded')).toBe('true')
  })

  it('merges fallthrough attributes onto the trigger element', () => {
    const wrapper = mountMenu({
      attrs: { class: 'test-extra-class', 'aria-label': 'Test picker' },
    })
    const trigger = wrapper.find('.sdr-device-dropdown')
    expect(trigger.classes()).toContain('test-extra-class')
    expect(trigger.attributes('aria-label')).toBe('Test picker')
  })
})

describe('BaseSelectMenu — open/close', () => {
  it('toggles the menu on trigger clicks, emitting open and close', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('.sdr-device-dropdown')
    await trigger.trigger('click')
    expect(menuElement()).not.toBeNull()
    expect(trigger.classes()).toContain('sdr-device-dropdown--open')
    expect(wrapper.emitted('open')).toHaveLength(1)
    await trigger.trigger('click')
    expect(menuElement()).toBeNull()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('ignores trigger clicks when disabled', async () => {
    const wrapper = mountMenu({ props: { disabled: true } })
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    expect(menuElement()).toBeNull()
    expect(wrapper.emitted('open')).toBeUndefined()
  })

  it('closes on an outside document click and emits close', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    expect(menuElement()).not.toBeNull()
    document.body.click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('survives the settle scroll right after opening, then closes on a later scroll', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(300_000)
    const wrapper = mountMenu()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    // Settle scroll (the browser scrolling the focused trigger into view).
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    // A genuine user scroll after the settle window dismisses the menu.
    vi.setSystemTime(300_000 + MENU_OPEN_SETTLE_MS + 1)
    document.dispatchEvent(new Event('scroll'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('closes on window resize', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
  })

  it('positions the menu from the trigger rect at open time', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('.sdr-device-dropdown').element as HTMLElement
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 15,
      bottom: 48,
      width: 130,
      top: 28,
      right: 145,
      height: 20,
      x: 15,
      y: 28,
      toJSON: () => ({}),
    } as DOMRect)
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    const menu = menuElement()!
    expect(menu.style.left).toBe('15px')
    expect(menu.style.top).toBe('48px')
    expect(menu.style.width).toBe('130px')
  })
})

describe('BaseSelectMenu — default keyboard model', () => {
  it('opens with Enter and space (preventing their default), and closes with Escape', async () => {
    const wrapper = mountMenu()
    const trigger = wrapper.find('.sdr-device-dropdown')
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(menuElement()).not.toBeNull()
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(menuElement()).toBeNull()
    await trigger.trigger('keydown', { key: ' ' })
    expect(menuElement()).not.toBeNull()
  })

  it('ignores unrelated keys', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.sdr-device-dropdown').trigger('keydown', { key: 'a' })
    expect(menuElement()).toBeNull()
  })

  it('gates the Enter/space toggle on disabled but still closes with Escape', async () => {
    const wrapper = mountMenu({ props: { disabled: true } })
    const trigger = wrapper.find('.sdr-device-dropdown')
    await trigger.trigger('keydown', { key: 'Enter' })
    expect(menuElement()).toBeNull()
    // Open via the exposed control (callers own quirkier gates that way),
    // then confirm Escape still dismisses while disabled.
    ;(wrapper.vm as unknown as { openMenu: () => void }).openMenu()
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    await trigger.trigger('keydown', { key: 'Escape' })
    expect(menuElement()).toBeNull()
  })
})

describe('BaseSelectMenu — custom keyboard model', () => {
  it('re-emits trigger keydowns without running the default handling', async () => {
    const wrapper = mountMenu({ props: { customKeyboard: true } })
    const trigger = wrapper.find('.sdr-device-dropdown')
    await trigger.trigger('keydown', { key: 'Enter' })
    // Default Enter handling is suppressed…
    expect(menuElement()).toBeNull()
    // …and the caller receives the raw event instead.
    const emitted = wrapper.emitted('trigger-keydown')!
    expect(emitted).toHaveLength(1)
    expect((emitted[0][0] as KeyboardEvent).key).toBe('Enter')
  })
})

describe('BaseSelectMenu — menu rendering', () => {
  it('applies menuClass and menuAttrs to the teleported menu element', async () => {
    const wrapper = mountMenu({
      props: {
        menuClass: 'test-menu-class',
        menuAttrs: { role: 'listbox', 'aria-label': 'Test options' },
      },
    })
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    const menu = menuElement()!
    expect(menu.classList.contains('test-menu-class')).toBe(true)
    expect(menu.classList.contains('sdr-device-menu--open')).toBe(true)
    expect(menu.getAttribute('role')).toBe('listbox')
    expect(menu.getAttribute('aria-label')).toBe('Test options')
  })

  it('keeps the menu open on inside clicks but closes via the options slot close()', async () => {
    const wrapper = mountMenu()
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    const menu = menuElement()!
    // A click on the menu surface itself must not bubble to the document
    // dismiss handler.
    menu.click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).not.toBeNull()
    // A row using the scoped close() dismisses the menu.
    ;(menu.querySelector('.test-option') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(menuElement()).toBeNull()
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('BaseSelectMenu — exposed controls', () => {
  it('exposes menuOpen, openMenu, toggleMenu and closeMenu for custom-keyboard callers', async () => {
    const wrapper = mountMenu({ props: { customKeyboard: true } })
    const exposed = wrapper.vm as unknown as {
      menuOpen: boolean
      openMenu: () => void
      toggleMenu: () => void
      closeMenu: () => void
    }
    expect(exposed.menuOpen).toBe(false)
    exposed.openMenu()
    await wrapper.vm.$nextTick()
    expect(exposed.menuOpen).toBe(true)
    expect(menuElement()).not.toBeNull()
    exposed.closeMenu()
    await wrapper.vm.$nextTick()
    expect(exposed.menuOpen).toBe(false)
    expect(menuElement()).toBeNull()
    exposed.toggleMenu()
    await wrapper.vm.$nextTick()
    expect(exposed.menuOpen).toBe(true)
    exposed.toggleMenu()
    await wrapper.vm.$nextTick()
    expect(exposed.menuOpen).toBe(false)
  })
})

describe('BaseSelectMenu — accessibility', () => {
  it('has no axe violations with the listbox menu open', async () => {
    const wrapper = mount(BaseSelectMenu, {
      props: {
        triggerRole: 'button',
        menuAttrs: { role: 'listbox', 'aria-label': 'Test options' },
      },
      attrs: { 'aria-label': 'Test picker' },
      slots: {
        selected: '<span>CHOSEN</span>',
        options: '<div role="option" aria-selected="true">row</div>',
      },
      attachTo: document.body,
    })
    await wrapper.find('.sdr-device-dropdown').trigger('click')
    expect(
      await axe(document.body.innerHTML, {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
