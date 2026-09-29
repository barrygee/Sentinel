import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { computed, nextTick, ref } from 'vue'
import { axe } from 'jest-axe'
import NotificationSubscriptionsControl from './NotificationSubscriptionsControl.vue'
import { useNotificationsStore } from '@/stores/notifications'
import { useSettingsStore } from '@/stores/settings'
import type { NotificationSubscription } from '@/composables/useNotificationSubscriptions'

const subscriptionList = ref<NotificationSubscription[]>([])
const refresh = vi.fn()
const turnOff = vi.fn()
vi.mock('@/composables/useNotificationSubscriptions', () => ({
  useNotificationSubscriptions: () => ({
    subscriptions: computed(() => subscriptionList.value),
    refresh,
    turnOff,
  }),
}))

const AIRCRAFT = { key: 'aircraft:4ca7b1', label: 'BAW123 — landing & departure' }
const SATELLITE = { key: 'satellite:25544', label: 'ISS (ZARYA) — pass alert' }

async function mountControl() {
  const wrapper = mount(NotificationSubscriptionsControl)
  await flushPromises()
  return wrapper
}

type Wrapper = Awaited<ReturnType<typeof mountControl>>

function checkbox(wrapper: Wrapper, label: string) {
  const row = wrapper.findAll('.lft-row').find((node) => node.text().includes(label))
  if (!row) throw new Error(`no row for ${label}`)
  return row.find('input[type="checkbox"]')
}

function button(wrapper: Wrapper, text: RegExp) {
  const match = wrapper.findAll('button').find((node) => text.test(node.text()))
  if (!match) throw new Error(`no button matching ${text}`)
  return match
}

/** Run the most recently staged work, as APPLY CHANGES would. */
async function applyLatest(wrapper: Wrapper): Promise<void> {
  const staged = wrapper.emitted('stage')!
  await (staged[staged.length - 1]![0] as () => Promise<unknown>)()
}

describe('NotificationSubscriptionsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    subscriptionList.value = []
    refresh.mockReset()
    turnOff.mockReset().mockResolvedValue(undefined)
  })

  describe('with nothing enabled', () => {
    it('says so, with no description, list or buttons', async () => {
      const wrapper = await mountControl()
      expect(wrapper.find('.notification-subscriptions-empty').text()).toBe('No alerts enabled')
      expect(wrapper.find('.notification-subscriptions-desc').exists()).toBe(false)
      expect(wrapper.find('.lft-row').exists()).toBe(false)
      expect(wrapper.findAll('button')).toHaveLength(0)
    })
  })

  describe('with alerts enabled', () => {
    beforeEach(() => {
      subscriptionList.value = [AIRCRAFT, SATELLITE]
    })

    it('shows the description and one ticked row per alert, without column titles', async () => {
      const wrapper = await mountControl()
      expect(wrapper.find('.notification-subscriptions-desc').text()).toBe(
        'Uncheck the alerts you no longer need, or click cancel all alerts',
      )
      expect(wrapper.findAll('.lft-row-name').map((node) => node.text())).toEqual([
        AIRCRAFT.label,
        SATELLITE.label,
      ])
      expect(wrapper.find('.lft-header').exists()).toBe(false)
      expect((checkbox(wrapper, 'BAW123').element as HTMLInputElement).checked).toBe(true)
    })

    it('unticking stages turning off just that alert', async () => {
      const wrapper = await mountControl()
      await checkbox(wrapper, 'BAW123').trigger('change')
      expect((checkbox(wrapper, 'BAW123').element as HTMLInputElement).checked).toBe(false)
      expect(turnOff).not.toHaveBeenCalled()
      await applyLatest(wrapper)
      expect(turnOff).toHaveBeenCalledWith([AIRCRAFT.key])
    })

    it('re-ticking takes it back out of what will be turned off', async () => {
      const wrapper = await mountControl()
      await checkbox(wrapper, 'BAW123').trigger('change')
      await checkbox(wrapper, 'BAW123').trigger('change')
      await applyLatest(wrapper)
      expect(turnOff).toHaveBeenCalledWith([])
    })

    it('DESELECT ALL unticks everything and becomes SELECT ALL', async () => {
      const wrapper = await mountControl()
      await button(wrapper, /^DESELECT ALL$/).trigger('click')
      expect(wrapper.findAll('input[type="checkbox"]:checked')).toHaveLength(0)
      expect(button(wrapper, /^SELECT ALL$/).exists()).toBe(true)
      await applyLatest(wrapper)
      expect(turnOff).toHaveBeenCalledWith([AIRCRAFT.key, SATELLITE.key])
    })

    it('SELECT ALL ticks everything again once any box is unticked', async () => {
      const wrapper = await mountControl()
      await checkbox(wrapper, 'ISS').trigger('change')
      await button(wrapper, /^SELECT ALL$/).trigger('click')
      expect(wrapper.findAll('input[type="checkbox"]:checked')).toHaveLength(2)
      expect(button(wrapper, /^DESELECT ALL$/).exists()).toBe(true)
      await applyLatest(wrapper)
      expect(turnOff).toHaveBeenCalledWith([])
    })

    it('CANCEL ALL ALERTS clears received alerts at once, and is disabled when there are none', async () => {
      const notifications = useNotificationsStore()
      const wrapper = await mountControl()
      expect(button(wrapper, /CANCEL ALL ALERTS/).text()).toBe('CANCEL ALL ALERTS (0)')
      expect(button(wrapper, /CANCEL ALL ALERTS/).attributes('disabled')).toBeDefined()

      notifications.add({ title: 'ONE' })
      notifications.add({ title: 'TWO' })
      await nextTick()
      expect(button(wrapper, /CANCEL ALL ALERTS/).text()).toBe('CANCEL ALL ALERTS (2)')
      await button(wrapper, /CANCEL ALL ALERTS/).trigger('click')
      expect(notifications.total).toBe(0)
      // Clearing received alerts is not a setting — nothing is staged for it.
      expect(wrapper.emitted('stage')).toBeUndefined()
    })

    it('has no accessibility violations', async () => {
      const wrapper = await mountControl()
      // `region` is off: a lone control has no page landmarks around it.
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    })
  })

  describe('when the Settings panel opens', () => {
    it('re-reads the list on mount and on each open', async () => {
      await mountControl()
      expect(refresh).toHaveBeenCalledTimes(1)
      useSettingsStore().openPanel()
      await nextTick()
      expect(refresh).toHaveBeenCalledTimes(2)
    })

    it('forgets unapplied unticks, and does nothing on close', async () => {
      subscriptionList.value = [AIRCRAFT]
      const settings = useSettingsStore()
      settings.openPanel()
      const wrapper = await mountControl()
      await checkbox(wrapper, 'BAW123').trigger('change')

      settings.closePanel()
      await nextTick()
      expect(refresh).toHaveBeenCalledTimes(1)
      expect((checkbox(wrapper, 'BAW123').element as HTMLInputElement).checked).toBe(false)

      settings.openPanel()
      await nextTick()
      expect((checkbox(wrapper, 'BAW123').element as HTMLInputElement).checked).toBe(true)
    })
  })
})
