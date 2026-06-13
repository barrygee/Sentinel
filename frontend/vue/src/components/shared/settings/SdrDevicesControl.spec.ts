import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrDevicesControl from './SdrDevicesControl.vue'
import SdrDeviceForm from './SdrDeviceForm.vue'

interface FetchOptions {
  method?: string
}

const RADIO = {
  id: 1,
  name: 'Roof',
  host: '10.0.0.1',
  port: 1234,
  bandwidth: null,
  rf_gain: null,
  agc: null,
  enabled: true,
  description: '',
}

/**
 * Route a fetch mock by URL: the radios list, per-radio status, and DELETE.
 */
function routeFetch(options: {
  radios?: unknown[]
  radiosOk?: boolean
  statusOk?: boolean
  connected?: boolean
  deleteOk?: boolean
}): ReturnType<typeof vi.fn> {
  const {
    radios = [],
    radiosOk = true,
    statusOk = true,
    connected = true,
    deleteOk = true,
  } = options
  const fetchMock = vi.fn((url: string, init?: FetchOptions) => {
    if (url === '/api/sdr/radios' && !init) {
      return Promise.resolve({ ok: radiosOk, json: async () => radios })
    }
    if (url.startsWith('/api/sdr/status/')) {
      return Promise.resolve({ ok: statusOk, json: async () => ({ connected }) })
    }
    if (url.startsWith('/api/sdr/radios/') && init?.method === 'DELETE') {
      return Promise.resolve({ ok: deleteOk })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('SdrDevicesControl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('shows an empty message when no SDRs are configured', async () => {
    routeFetch({ radios: [] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(true)
  })

  it('lists configured radios and reflects a connected status', async () => {
    routeFetch({ radios: [RADIO], connected: true })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    expect(wrapper.findAll('.sdr-device-item')).toHaveLength(1)
    expect(wrapper.find('.sdr-status-dot--connected').exists()).toBe(true)
  })

  it('marks a radio disconnected when the status request is not ok', async () => {
    routeFetch({ radios: [RADIO], statusOk: false })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(true)
  })

  it('marks a radio disconnected when the status request reports not connected', async () => {
    routeFetch({ radios: [RADIO], connected: false })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(true)
  })

  it('renders nothing extra when the radios request is not ok', async () => {
    routeFetch({ radios: [RADIO], radiosOk: false })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    expect(wrapper.find('.sdr-devices-empty').exists()).toBe(true)
  })

  it('tolerates a status request that throws', async () => {
    const fetchMock = vi.fn((url: string, init?: FetchOptions) => {
      if (url === '/api/sdr/radios' && !init) {
        return Promise.resolve({ ok: true, json: async () => [RADIO] })
      }
      return Promise.reject(new Error('network'))
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    // The thrown status check is caught and treated as disconnected.
    expect(wrapper.find('.sdr-status-dot--connected').exists()).toBe(false)
    expect(wrapper.find('.sdr-status-dot--disconnected').exists()).toBe(true)
  })

  it('opens and closes the edit form', async () => {
    routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(true)
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('opens and cancels a blank form via ADD SDR', async () => {
    routeFetch({ radios: [] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(true)
    wrapper.findComponent(SdrDeviceForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('toggles the blank form closed when ADD SDR is clicked again', async () => {
    routeFetch({ radios: [] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(true)
    await wrapper.find('.sdr-devices-add-btn').trigger('click')
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('skips the status poll while no radios are configured', async () => {
    vi.useFakeTimers()
    const fetchMock = routeFetch({ radios: [] })
    mount(SdrDevicesControl)
    await vi.runOnlyPendingTimersAsync()
    fetchMock.mockClear()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sdr/status/1')
  })

  it('confirms then performs a delete and broadcasts the change', async () => {
    const changed = vi.fn()
    document.addEventListener('sdr:radios-changed', changed)
    const fetchMock = routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(true)
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/sdr/radios/1', { method: 'DELETE' })
    expect(changed).toHaveBeenCalled()
    document.removeEventListener('sdr:radios-changed', changed)
  })

  it('does not reload when the delete request fails', async () => {
    const fetchMock = routeFetch({ radios: [RADIO], deleteOk: false })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    fetchMock.mockClear()
    await wrapper.find('.sdr-device-confirm-btn--yes').trigger('click')
    await flushPromises()
    // The radios list is not re-fetched after a failed delete.
    expect(fetchMock).not.toHaveBeenCalledWith('/api/sdr/radios')
  })

  it('cancels a pending delete with NO', async () => {
    routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn--danger').trigger('click')
    const noButton = wrapper.findAll('.sdr-device-confirm-btn').at(-1)!
    await noButton.trigger('click')
    expect(wrapper.find('.sdr-device-confirm').exists()).toBe(false)
  })

  it('reloads and broadcasts when the form emits save', async () => {
    const changed = vi.fn()
    document.addEventListener('sdr:radios-changed', changed)
    routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    wrapper.findComponent(SdrDeviceForm).vm.$emit('save')
    await flushPromises()
    expect(changed).toHaveBeenCalled()
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
    document.removeEventListener('sdr:radios-changed', changed)
  })

  it('closes the form when it emits cancel', async () => {
    routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    await wrapper.find('.sdr-device-btn[title="Edit"]').trigger('click')
    wrapper.findComponent(SdrDeviceForm).vm.$emit('cancel')
    await flushPromises()
    expect(wrapper.findComponent(SdrDeviceForm).exists()).toBe(false)
  })

  it('re-checks statuses on the polling interval', async () => {
    vi.useFakeTimers()
    const fetchMock = routeFetch({ radios: [RADIO] })
    mount(SdrDevicesControl)
    await vi.runOnlyPendingTimersAsync()
    fetchMock.mockClear()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchMock).toHaveBeenCalledWith('/api/sdr/status/1')
  })

  it('reloads on an external sdr:radios-changed event', async () => {
    const fetchMock = routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    fetchMock.mockClear()
    document.dispatchEvent(new CustomEvent('sdr:radios-changed'))
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledWith('/api/sdr/radios')
    wrapper.unmount()
  })

  it('clears the poll interval and listener on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval')
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    wrapper.unmount()
    expect(clearSpy).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('sdr:radios-changed', expect.any(Function))
  })

  it('has no accessibility violations', async () => {
    routeFetch({ radios: [RADIO] })
    const wrapper = mount(SdrDevicesControl)
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
