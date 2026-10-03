import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { TransitionGroup } from 'vue'
import { axe } from 'jest-axe'

const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))

import NotificationsPanel from './NotificationsPanel.vue'
import { useNotificationsStore, type NotificationItem } from '@/stores/notifications'
import {
  registerNotificationDismissHook,
  registerNotificationTarget,
  resetNotificationRegistryForTests,
  type NotificationTarget,
} from '@/shell/notificationRegistry'

// The panel holds no section knowledge: sections register click targets and
// dismiss hooks with the shell. These specs register stand-ins and check the
// panel delegates to them (the real Air/Space targets have their own specs).
function aircraftLikeTarget(): NotificationTarget {
  return { sectionId: 'air', priority: 20, matches: (item) => Boolean(item.hex), open: vi.fn() }
}

// Capture the ResizeObserver callback so the scroll-hint logic can be driven by hand.
const observerRegistry = vi.hoisted(() => ({ callback: null as null | (() => void) }))
class ResizeObserverStub {
  constructor(callback: () => void) {
    observerRegistry.callback = callback
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function makeItem(overrides: Partial<NotificationItem> & { id: string }): NotificationItem {
  return {
    type: 'system',
    title: 'Title',
    detail: '',
    ts: 1_700_000_000_000,
    ...overrides,
  }
}

function seedItems(items: NotificationItem[]): void {
  const store = useNotificationsStore()
  store.items.splice(0, store.items.length, ...items)
}

enableAutoUnmount(afterEach)

describe('NotificationsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    observerRegistry.callback = null
    // restoreMocks only resets vi.spyOn spies — the vi.fn()s from the vi.mock
    // factory leak call history across tests, so clear them by hand.
    vi.clearAllMocks()
    resetNotificationRegistryForTests()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the empty state when there are no notifications', () => {
    const wrapper = mount(NotificationsPanel)
    expect(wrapper.find('#msb-alerts-empty').text()).toBe('No alerts')
    expect(wrapper.find('#notif-clear-all-btn').exists()).toBe(false)
  })

  it('renders a notification with its label, title, detail and formatted time', () => {
    seedItems([makeItem({ id: '1', type: 'flight', title: 'BA123', detail: 'Landed at LHR' })])
    const wrapper = mount(NotificationsPanel)
    expect(wrapper.find('.notif-label').text()).toBe('LANDED')
    expect(wrapper.find('.notif-title').text()).toBe('BA123')
    expect(wrapper.find('.notif-detail').text()).toBe('Landed at LHR')
    expect(wrapper.find('.notif-time').text()).toMatch(/^\d{2}:\d{2} LOCAL$/)
  })

  describe('autotune labels', () => {
    it('shows "AUTOTUNE & RECORD" for the armed record detail', () => {
      seedItems([
        makeItem({
          id: '1',
          type: 'autotune',
          noradId: '25544',
          detail: 'Auto-tune and record on pass enabled',
        }),
      ])
      const wrapper = mount(NotificationsPanel)
      expect(wrapper.find('.notif-label-default').text()).toBe('AUTOTUNE & RECORD')
    })

    it('shows "AUTOTUNE & RECORD" for the live recording trace detail', () => {
      seedItems([
        makeItem({
          id: '1',
          type: 'autotune',
          noradId: '25544',
          detail: 'Auto-tuning & recording ISS',
        }),
      ])
      const wrapper = mount(NotificationsPanel)
      expect(wrapper.find('.notif-label-default').text()).toBe('AUTOTUNE & RECORD')
    })

    it('shows the plain label for any other autotune detail', () => {
      seedItems([
        makeItem({ id: '1', type: 'autotune', noradId: '25544', detail: 'Pass starting' }),
      ])
      const wrapper = mount(NotificationsPanel)
      expect(wrapper.find('.notif-label-default').text()).toBe('AUTOTUNE')
    })
  })

  describe('item click routing', () => {
    it('invokes a custom clickAction and routes nowhere else', async () => {
      const target = aircraftLikeTarget()
      registerNotificationTarget(target)
      const clickAction = vi.fn()
      seedItems([makeItem({ id: '1', clickAction, hex: 'abc123' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(clickAction).toHaveBeenCalledOnce()
      expect(target.open).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('opens the alert through the section target that matches it, passing the router', async () => {
      const target = aircraftLikeTarget()
      registerNotificationTarget(target)
      const item = makeItem({ id: '1', type: 'flight', hex: 'ab12cd' })
      seedItems([item])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(target.open).toHaveBeenCalledOnce()
      const [openedItem, context] = (target.open as ReturnType<typeof vi.fn>).mock.calls[0]!
      expect(openedItem).toMatchObject({ id: '1', hex: 'ab12cd' })
      expect(context.router.push).toBe(routerPush)
    })

    it('does nothing when no registered section can open the alert', async () => {
      const target = aircraftLikeTarget()
      registerNotificationTarget(target)
      seedItems([makeItem({ id: '1', type: 'tracking', noradId: '25544' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(target.open).not.toHaveBeenCalled()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('shows a pointer only on alerts that do something when clicked', () => {
      registerNotificationTarget(aircraftLikeTarget())
      seedItems([
        makeItem({ id: 'target', hex: 'ab12cd', ts: 3 }),
        makeItem({ id: 'action', clickAction: vi.fn(), ts: 2 }),
        makeItem({ id: 'inert', noradId: '25544', ts: 1 }),
      ])
      const wrapper = mount(NotificationsPanel)
      const styles = wrapper.findAll('.notif-item').map((row) => row.attributes('style') ?? '')
      expect(styles[0]).toContain('cursor: pointer')
      expect(styles[1]).toContain('cursor: pointer')
      expect(styles[2]).not.toContain('cursor')
    })
  })

  describe('action and dismiss buttons', () => {
    it('runs the inline action then dismisses the notification', async () => {
      const callback = vi.fn()
      seedItems([makeItem({ id: '1', type: 'tracking', action: { label: 'OFF', callback } })])
      const wrapper = mount(NotificationsPanel)
      expect(wrapper.find('.notif-label-disable').text()).toBe('DISABLE ALERTS')

      await wrapper.find('.notif-action').trigger('click')
      expect(callback).toHaveBeenCalledOnce()
      expect(useNotificationsStore().items).toHaveLength(0)
    })

    it('dismisses a plain notification', async () => {
      seedItems([makeItem({ id: '1', type: 'system' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-dismiss').trigger('click')
      expect(useNotificationsStore().items).toHaveLength(0)
    })

    it('clears all notifications via the CLEAR button', async () => {
      seedItems([makeItem({ id: '1', type: 'system' }), makeItem({ id: '2', type: 'message' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('#notif-clear-all-btn').trigger('click')
      expect(useNotificationsStore().items).toHaveLength(0)
    })
  })

  describe('closing an autotune card', () => {
    it('runs the registered dismiss hooks, then dismisses the card', async () => {
      const calls: string[] = []
      registerNotificationDismissHook('autotune', (item) => {
        calls.push(`hook ${item.id}, still listed: ${useNotificationsStore().items.length}`)
      })
      seedItems([makeItem({ id: '1', type: 'autotune', noradId: '25544', detail: 'Pass' })])
      const wrapper = mount(NotificationsPanel)
      const close = wrapper.find('.notif-dismiss')
      expect(close.attributes('aria-label')).toBe('Disable autotune')

      await close.trigger('click')

      expect(calls).toEqual(['hook 1, still listed: 1'])
      expect(useNotificationsStore().items).toHaveLength(0)
    })

    it('just dismisses when no section registered a hook', async () => {
      seedItems([makeItem({ id: '1', type: 'autotune', detail: 'Pass' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-dismiss').trigger('click')
      expect(useNotificationsStore().items).toHaveLength(0)
    })
  })

  describe('scroll hint', () => {
    it('reveals the MORE hint when content overflows and scrolls on click', async () => {
      seedItems([makeItem({ id: '1', type: 'system' })])
      const wrapper = mount(NotificationsPanel, { attachTo: document.body })
      const list = wrapper.find('#notif-list').element as HTMLElement
      Object.defineProperties(list, {
        scrollHeight: { configurable: true, value: 500 },
        clientHeight: { configurable: true, value: 100 },
        scrollTop: { configurable: true, value: 0 },
      })
      const scrollBy = vi.fn()
      list.scrollBy = scrollBy

      // Drive the captured ResizeObserver callback (updateScrollHint).
      observerRegistry.callback?.()
      await flushPromises()
      expect(wrapper.find('#notif-scroll-hint').classes()).toContain('notif-scroll-hint-visible')

      await wrapper.find('#notif-scroll-hint').trigger('click')
      expect(scrollBy).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('updates the hint on scroll events', async () => {
      seedItems([makeItem({ id: '1', type: 'system' })])
      const wrapper = mount(NotificationsPanel, { attachTo: document.body })
      const list = wrapper.find('#notif-list').element as HTMLElement
      Object.defineProperties(list, {
        scrollHeight: { configurable: true, value: 50 },
        clientHeight: { configurable: true, value: 100 },
        scrollTop: { configurable: true, value: 0 },
      })
      // Content fits → hint stays hidden after a scroll event.
      list.dispatchEvent(new Event('scroll'))
      await flushPromises()
      expect(wrapper.find('#notif-scroll-hint').classes()).not.toContain(
        'notif-scroll-hint-visible',
      )

      // After unmount the list ref is null — the captured observer callback must
      // short-circuit rather than read a null element.
      wrapper.unmount()
      expect(() => observerRegistry.callback?.()).not.toThrow()
    })
  })

  describe('transition leave hooks', () => {
    it('keeps the empty message hidden while an item is leaving', async () => {
      seedItems([makeItem({ id: '1', type: 'system' })])
      const wrapper = mount(NotificationsPanel)
      const group = wrapper.findComponent(TransitionGroup)

      // A leave is in flight: empty message must not appear even with no visible items.
      group.vm.$emit('before-leave')
      useNotificationsStore().items.splice(0)
      await flushPromises()
      expect(wrapper.find('#msb-alerts-empty').exists()).toBe(false)

      // Leave completes → counter returns to zero and the empty message shows.
      group.vm.$emit('after-leave')
      await flushPromises()
      expect(wrapper.find('#msb-alerts-empty').exists()).toBe(true)
    })

    it('never lets the leaving counter go negative', async () => {
      seedItems([makeItem({ id: '1', type: 'system' })])
      const wrapper = mount(NotificationsPanel)
      const group = wrapper.findComponent(TransitionGroup)
      // after-leave without a matching before-leave clamps at zero.
      group.vm.$emit('after-leave')
      useNotificationsStore().items.splice(0)
      await flushPromises()
      expect(wrapper.find('#msb-alerts-empty').exists()).toBe(true)
    })
  })

  it('has no accessibility violations', async () => {
    seedItems([
      makeItem({ id: '1', type: 'flight', title: 'BA123', detail: 'Landed' }),
      makeItem({ id: '2', type: 'tracking', action: { label: 'OFF', callback: vi.fn() } }),
    ])
    const wrapper = mount(NotificationsPanel)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
