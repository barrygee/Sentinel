import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { TransitionGroup } from 'vue'
import { axe } from 'jest-axe'

// Mock only the module-level click-routing helpers so each test controls whether
// a live map handler is registered; the real store (items, dismiss, clearAll,
// getLabelForType, syncFromBackend) is preserved.
vi.mock('@/stores/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/notifications')>()
  return {
    ...actual,
    getAircraftClickHandler: vi.fn(),
    getSatelliteClickHandler: vi.fn(),
    setPendingAircraftTarget: vi.fn(),
    setPendingSatelliteTarget: vi.fn(),
  }
})

const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }))

import NotificationsPanel from './NotificationsPanel.vue'
import {
  useNotificationsStore,
  getAircraftClickHandler,
  getSatelliteClickHandler,
  setPendingAircraftTarget,
  setPendingSatelliteTarget,
  type NotificationItem,
} from '@/stores/notifications'
import {
  setAutoTuneEnabled,
  isAutoTuneEnabled,
} from '@/components/space/controls/satellite/passNotifStore'

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
      const clickAction = vi.fn()
      seedItems([makeItem({ id: '1', clickAction, hex: 'abc123' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(clickAction).toHaveBeenCalledOnce()
      expect(routerPush).not.toHaveBeenCalled()
    })

    it('calls the registered satellite handler with the satellite name', async () => {
      const handler = vi.fn()
      ;(getSatelliteClickHandler as Mock).mockReturnValue(handler)
      seedItems([makeItem({ id: '1', type: 'tracking', noradId: '25544', satName: 'ISS' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(handler).toHaveBeenCalledWith('25544', 'ISS')
    })

    it('stashes the satellite target and routes to /space/ when no handler is mounted', async () => {
      ;(getSatelliteClickHandler as Mock).mockReturnValue(null)
      // No satName → falls back to the title for the display name.
      seedItems([makeItem({ id: '1', type: 'tracking', noradId: '25544', title: 'ISS PASS' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(setPendingSatelliteTarget).toHaveBeenCalledWith('25544', 'ISS PASS')
      expect(routerPush).toHaveBeenCalledWith('/space/')
    })

    it('falls back to the noradId for the name when satName and title are empty', async () => {
      ;(getSatelliteClickHandler as Mock).mockReturnValue(null)
      seedItems([makeItem({ id: '1', type: 'tracking', noradId: '25544', title: '' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(setPendingSatelliteTarget).toHaveBeenCalledWith('25544', '25544')
    })

    it('calls the registered aircraft handler', async () => {
      const handler = vi.fn()
      ;(getAircraftClickHandler as Mock).mockReturnValue(handler)
      seedItems([makeItem({ id: '1', type: 'flight', hex: 'ab12cd' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(handler).toHaveBeenCalledWith('ab12cd')
    })

    it('stashes the aircraft target and routes to /air/ when no handler is mounted', async () => {
      ;(getAircraftClickHandler as Mock).mockReturnValue(null)
      seedItems([makeItem({ id: '1', type: 'flight', hex: 'ab12cd' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(setPendingAircraftTarget).toHaveBeenCalledWith('ab12cd')
      expect(routerPush).toHaveBeenCalledWith('/air/')
    })

    it('does nothing when the item has no actionable target', async () => {
      seedItems([makeItem({ id: '1', type: 'system' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-item').trigger('click')
      expect(routerPush).not.toHaveBeenCalled()
      expect(setPendingAircraftTarget).not.toHaveBeenCalled()
      expect(setPendingSatelliteTarget).not.toHaveBeenCalled()
    })
  })

  describe('action and dismiss buttons', () => {
    it('runs the inline action then dismisses the notification', async () => {
      const callback = vi.fn()
      seedItems([makeItem({ id: '1', type: 'tracking', action: { label: 'OFF', callback } })])
      const wrapper = mount(NotificationsPanel)
      expect(wrapper.find('.notif-label-disable').text()).toBe('DISABLE NOTIFICATIONS')

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

  describe('cancelAutoTune', () => {
    it('disables auto-tune, announces it, and dismisses the card', async () => {
      setAutoTuneEnabled('25544', true, { name: 'ISS' })
      expect(isAutoTuneEnabled('25544')).toBe(true)
      const dispatched = vi.fn()
      document.addEventListener('satellite-auto-tune-changed', dispatched)

      seedItems([makeItem({ id: '1', type: 'autotune', noradId: '25544', detail: 'Pass' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-dismiss').trigger('click')

      expect(isAutoTuneEnabled('25544')).toBe(false)
      expect(dispatched).toHaveBeenCalledOnce()
      expect(useNotificationsStore().items).toHaveLength(0)
      document.removeEventListener('satellite-auto-tune-changed', dispatched)
    })

    it('only dismisses when auto-tune was not enabled for the satellite', async () => {
      const dispatched = vi.fn()
      document.addEventListener('satellite-auto-tune-changed', dispatched)
      seedItems([makeItem({ id: '1', type: 'autotune', noradId: '99999', detail: 'Pass' })])
      const wrapper = mount(NotificationsPanel)
      await wrapper.find('.notif-dismiss').trigger('click')

      expect(dispatched).not.toHaveBeenCalled()
      expect(useNotificationsStore().items).toHaveLength(0)
      document.removeEventListener('satellite-auto-tune-changed', dispatched)
    })

    it('dismisses an autotune card that carries no noradId', async () => {
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
