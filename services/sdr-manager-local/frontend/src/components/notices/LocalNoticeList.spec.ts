import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import type { LocalNoticeEvent } from '../../api/types'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { makeDevice } from '../../testing/factories'
import LocalNoticeList from './LocalNoticeList.vue'

function notice(overrides: Partial<LocalNoticeEvent> = {}): LocalNoticeEvent {
  return {
    level: 'warn',
    code: 'port_bind_failed',
    message: 'Port 1234 is busy.',
    device_id: null,
    ts: 100,
    ...overrides,
  }
}

describe('LocalNoticeList', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders nothing at all while there are no notices', () => {
    const wrapper = mount(LocalNoticeList)
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('lists each notice with its level word and message in a labelled list', () => {
    const store = useLocalSdrStore()
    store.applyNotice(notice({ level: 'info', message: 'Serial written.', ts: 1 }))
    store.applyNotice(notice({ level: 'warn', message: 'Port 1234 is busy.', ts: 2 }))
    store.applyNotice(notice({ level: 'error', message: 'It crashed.', ts: 3 }))
    const wrapper = mount(LocalNoticeList)
    expect(wrapper.get('ul').attributes('aria-label')).toBe('SDR Manager notices')
    const items = wrapper.findAll('li')
    expect(items.map((item) => item.get('.local-notice-level').text())).toEqual([
      'ERROR',
      'WARNING',
      'INFO',
    ])
    expect(items[0]!.classes()).toContain('local-notice--error')
    expect(items[0]!.text()).toContain('It crashed.')
  })

  it('prefixes a notice about a known device with that device’s name', () => {
    const store = useLocalSdrStore()
    store.applyDeviceChanged(makeDevice({ device_id: 'device-1', name: 'Roof' }))
    store.applyNotice(notice({ device_id: 'device-1', message: 'Flapping.' }))
    const message = mount(LocalNoticeList).get('.local-notice-message').text()
    expect(message).toBe('Roof: Flapping.')
  })

  it('falls back to the device id when the device is not in the store', () => {
    useLocalSdrStore().applyNotice(notice({ device_id: 'gone-9', message: 'Flapping.' }))
    expect(mount(LocalNoticeList).get('.local-notice-message').text()).toBe('gone-9: Flapping.')
  })

  it('names an unnamed device by its id', () => {
    const store = useLocalSdrStore()
    store.applyDeviceChanged(makeDevice({ device_id: 'device-2', name: '' }))
    store.applyNotice(notice({ device_id: 'device-2', message: 'Flapping.' }))
    expect(mount(LocalNoticeList).get('.local-notice-message').text()).toBe('device-2: Flapping.')
  })

  it('shows no device prefix and no repeat count for a first, device-less notice', () => {
    useLocalSdrStore().applyNotice(notice())
    const wrapper = mount(LocalNoticeList)
    expect(wrapper.get('.local-notice-message').text()).toBe('Port 1234 is busy.')
    expect(wrapper.find('.local-notice-repeat').exists()).toBe(false)
  })

  it('counts an identical notice that repeats instead of listing it again', () => {
    const store = useLocalSdrStore()
    store.applyNotice(notice({ ts: 1 }))
    store.applyNotice(notice({ ts: 2 }))
    store.applyNotice(notice({ ts: 3 }))
    const wrapper = mount(LocalNoticeList)
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.get('.local-notice-repeat').text()).toBe('×3')
  })

  it('dismisses a notice from its labelled button and keeps the others', async () => {
    const store = useLocalSdrStore()
    store.applyNotice(notice({ message: 'First.', ts: 1 }))
    store.applyNotice(notice({ message: 'Second.', ts: 2, code: 'other' }))
    const wrapper = mount(LocalNoticeList)
    await wrapper.get('button[aria-label="Dismiss: First."]').trigger('click')
    expect(wrapper.findAll('li')).toHaveLength(1)
    expect(wrapper.text()).toContain('Second.')
    expect(wrapper.text()).not.toContain('First.')
  })

  it('removes the whole list once the last notice is dismissed', async () => {
    useLocalSdrStore().applyNotice(notice())
    const wrapper = mount(LocalNoticeList)
    await wrapper.get('button[aria-label^="Dismiss"]').trigger('click')
    expect(wrapper.find('ul').exists()).toBe(false)
  })

  it('has no accessibility violations', async () => {
    const store = useLocalSdrStore()
    store.applyDeviceChanged(makeDevice())
    store.applyNotice(notice({ device_id: 'device-1', level: 'error' }))
    store.applyNotice(notice({ device_id: 'device-1', level: 'error', ts: 2 }))
    await expectNoAxeViolations(mount(LocalNoticeList))
  })
})
