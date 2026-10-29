import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useLocalSdrStore, type LocalConnectionState } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocalConnectionStatus from './LocalConnectionStatus.vue'

const CASES: {
  state: Exclude<LocalConnectionState, 'live'>
  visible: string
  spoken: string
  dotClass: string | null
}[] = [
  {
    state: 'connecting',
    visible: 'CONNECTING…',
    spoken: 'Connecting…',
    dotClass: null,
  },
  {
    state: 'reconnecting',
    visible: 'RECONNECTING…',
    spoken: 'Not connected',
    dotClass: 'sdr-status-dot--disconnected',
  },
  {
    state: 'offline',
    visible: 'NOT CONNECTED',
    spoken: 'Not connected',
    dotClass: 'sdr-status-dot--disconnected',
  },
]

describe('LocalConnectionStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it.each(CASES)(
    'shows $visible and tells a screen reader "$spoken" while $state',
    ({ state, visible, spoken, dotClass }) => {
      useLocalSdrStore().setConnection(state)
      const wrapper = mount(LocalConnectionStatus)
      expect(wrapper.get('[aria-hidden="true"]').text()).toBe(visible)
      expect(wrapper.get('.sr-only').text()).toBe(spoken)
      const dot = wrapper.get('.sdr-status-dot')
      for (const candidate of ['sdr-status-dot--connected', 'sdr-status-dot--disconnected']) {
        expect(dot.classes().includes(candidate)).toBe(candidate === dotClass)
      }
    },
  )

  it('shows nothing while live, the normal state', () => {
    useLocalSdrStore().setConnection('live')
    const wrapper = mount(LocalConnectionStatus)
    expect(wrapper.find('.local-connection').exists()).toBe(false)
    expect(wrapper.text()).toBe('')
  })

  it('appears when the connection drops and goes once it is live again', async () => {
    const store = useLocalSdrStore()
    store.setConnection('live')
    const wrapper = mount(LocalConnectionStatus)
    store.setConnection('offline')
    await wrapper.vm.$nextTick()
    expect(wrapper.get('[aria-hidden="true"]').text()).toBe('NOT CONNECTED')
    store.setConnection('live')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.local-connection').exists()).toBe(false)
  })

  it.each(CASES)('has no accessibility violations while $state', async ({ state }) => {
    useLocalSdrStore().setConnection(state)
    await expectNoAxeViolations(mount(LocalConnectionStatus))
  })
})
