import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { h } from 'vue'
import * as api from '../../api/sdrManagerLocalApi'
import { useLocalAuthStore } from '../../stores/localAuthStore'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import {
  FakeEventSource,
  makeAuthState,
  makeConstraints,
  makeDevice,
} from '../../testing/factories'
import LocalDevicesControl from './LocalDevicesControl.vue'
import SerialConflictBanner from './SerialConflictBanner.vue'
import SerialFlashPanel from '../serial/SerialFlashPanel.vue'
import LocalSignInForm from '../auth/LocalSignInForm.vue'

vi.mock('../../api/sdrManagerLocalApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/sdrManagerLocalApi')>()
  return {
    ...actual,
    getAuthState: vi.fn(),
    getStatus: vi.fn(),
    listDevices: vi.fn(),
    patchDevice: vi.fn(),
  }
})

const mounted: VueWrapper[] = []

function mountControl(): VueWrapper {
  const wrapper = mount(LocalDevicesControl, { attachTo: document.body })
  mounted.push(wrapper)
  return wrapper
}

function seedDevices(...devices: ReturnType<typeof makeDevice>[]): void {
  useLocalSdrStore().applySnapshot({
    generated_at: 0,
    location: { latitude: 1, longitude: 1 },
    sdrs: devices,
  })
}

describe('LocalDevicesControl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource)
    // A protected console, signed in: the card shows everything. The
    // unprotected case, where it shows only the set-a-password notice, is
    // tested on its own below.
    vi.mocked(api.getAuthState).mockResolvedValue(
      makeAuthState({ password_set: true, authenticated: true }),
    )
    vi.mocked(api.getStatus).mockResolvedValue({
      generated_at: 0,
      location: { latitude: 1, longitude: 1 },
      sdrs: [makeDevice()],
    })
    vi.mocked(api.listDevices).mockResolvedValue({
      devices: [],
      port_suggestion: null,
      constraints: makeConstraints(),
    })
  })
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    vi.unstubAllGlobals()
  })

  it('reads the devices itself when the event stream has not delivered a snapshot', async () => {
    const wrapper = mountControl()
    expect(api.getStatus).toHaveBeenCalledTimes(1)
    await flushPromises()
    expect(wrapper.findAll('.local-device-name').map((name) => name.text())).toEqual(['Roof'])
  })

  it('does not re-read the devices when they are already loaded', () => {
    seedDevices(makeDevice())
    mountControl()
    expect(api.getStatus).not.toHaveBeenCalled()
  })

  it('keeps the event stream open while mounted and closes it on unmount', () => {
    const wrapper = mountControl()
    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.latest.closed).toBe(false)
    wrapper.unmount()
    mounted.pop()
    expect(FakeEventSource.latest.closed).toBe(true)
  })

  it('puts its device-actions slot at the end of every SDR row', async () => {
    seedDevices(
      makeDevice({ device_id: 'serial:1', name: 'Roof' }),
      makeDevice({ device_id: 'serial:2', name: 'Loft', record_id: 2 }),
    )
    const wrapper = mount(LocalDevicesControl, {
      attachTo: document.body,
      slots: {
        'device-actions': ({ deviceId }: { deviceId: string }) =>
          h('button', { type: 'button', class: 'host-action' }, `ADD ${deviceId}`),
      },
    })
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.findAll('.host-action').map((action) => action.text())).toEqual([
      'ADD serial:1',
      'ADD serial:2',
    ])
  })

  it('renders its rows with no action when given no slot', async () => {
    seedDevices(makeDevice())
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findAll('.sdr-device-row')).toHaveLength(1)
    expect(wrapper.find('.host-action').exists()).toBe(false)
  })

  it('holds the page’s one live region', () => {
    const wrapper = mountControl()
    expect(wrapper.findAll('[aria-live="polite"]')).toHaveLength(1)
  })

  it('shows the connection line and devices, and no password warning, on a protected console', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.text()).not.toContain('no console password')
    expect(wrapper.find('.local-connection').exists()).toBe(true)
    expect(wrapper.find('.sdr-devices-list').exists()).toBe(true)
  })

  it('shows only the set-a-password notice while there is no console password', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ password_set: false }))
    vi.mocked(api.getStatus).mockResolvedValue({
      generated_at: 0,
      location: { latitude: null, longitude: null },
      sdrs: [makeDevice()],
    })
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.text()).toContain('no console password')
    // No connection line ("RECONNECTING…", "Could not read…"), warnings or devices.
    expect(wrapper.find('.local-connection').exists()).toBe(false)
    expect(wrapper.find('.sdr-devices-list').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('location')
    // The stream stays open, so setting a password shows the devices at once.
    expect(FakeEventSource.latest.closed).toBe(false)
  })

  it('shows the devices as soon as a password is set', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ password_set: false }))
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.find('.sdr-devices-list').exists()).toBe(false)
    useLocalAuthStore().passwordSet = true
    await flushPromises()
    expect(wrapper.find('.sdr-devices-list').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('no console password')
  })

  it('warns about a blank location', async () => {
    vi.mocked(api.getStatus).mockResolvedValue({
      generated_at: 0,
      location: { latitude: null, longitude: null },
      sdrs: [],
    })
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.text()).toContain('location is not set')
  })

  it('shows notices the stream reports', async () => {
    const wrapper = mountControl()
    FakeEventSource.latest.emit('notice', {
      level: 'warn',
      code: 'x',
      message: 'Port busy.',
      device_id: null,
      ts: 5,
    })
    await flushPromises()
    expect(wrapper.get('ul[aria-label="SDR Manager notices"]').text()).toContain('Port busy.')
  })

  it('shows one banner per shared serial', async () => {
    seedDevices(
      makeDevice({ device_id: 'a' }),
      makeDevice({
        device_id: 'b',
        usb: { manufacturer: null, product: null, serial: '00000001', topology_path: '1-2' },
      }),
      makeDevice({
        device_id: 'c',
        usb: { manufacturer: null, product: null, serial: 'UNIQUE', topology_path: '1-3' },
      }),
    )
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findAllComponents(SerialConflictBanner)).toHaveLength(1)
  })

  it('opens the serial flash panel for the chosen device and closes it again', async () => {
    seedDevices(makeDevice({ device_id: 'device-1', needs_identification: true }))
    const wrapper = mountControl()
    expect(wrapper.findComponent(SerialFlashPanel).exists()).toBe(false)
    useLocalSdrStore().openSerialFlash('device-1')
    await flushPromises()
    expect(wrapper.findComponent(SerialFlashPanel).exists()).toBe(true)
    useLocalSdrStore().closeSerialFlash()
    await flushPromises()
    expect(wrapper.findComponent(SerialFlashPanel).exists()).toBe(false)
  })

  it('shows the sign-in form and hides everything else while signed out', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(
      makeAuthState({ password_set: true, authenticated: false }),
    )
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.findComponent(LocalSignInForm).exists()).toBe(true)
    expect(wrapper.find('.local-connection').exists()).toBe(false)
    expect(wrapper.find('.sdr-devices-list').exists()).toBe(false)
    expect(useLocalAuthStore().mustSignIn).toBe(true)
  })

  describe('staged device edits', () => {
    async function openFormAndRename(wrapper: VueWrapper, name: string): Promise<void> {
      await wrapper.get('button[title="Edit"]').trigger('click')
      await wrapper.get('#sdr-manager-local-device-1-name').setValue(name)
    }

    it('emits stage with a closure that saves the edit only when called', async () => {
      vi.mocked(api.patchDevice).mockResolvedValue(undefined as never)
      seedDevices(makeDevice())
      const wrapper = mountControl()
      await openFormAndRename(wrapper, 'Attic')
      expect(api.patchDevice).not.toHaveBeenCalled()
      const staged = wrapper.emitted('stage')!
      expect(staged.length).toBeGreaterThan(0)
      await (staged[0]![0] as () => Promise<void>)()
      expect(api.patchDevice).toHaveBeenCalledWith('device-1', { name: 'Attic' })
    })

    it('rejects the closure and shows the error under the field when a value is invalid', async () => {
      seedDevices(makeDevice())
      const wrapper = mountControl()
      await openFormAndRename(wrapper, '')
      await expect((wrapper.emitted('stage')![0]![0] as () => Promise<void>)()).rejects.toThrow()
      await flushPromises()
      expect(wrapper.get('#sdr-manager-local-device-1-name-error').text()).toBe('Enter a name.')
      expect(api.patchDevice).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(wrapper.get('#sdr-manager-local-device-1-name').element)
    })

    it('closes the open form after a successful apply', async () => {
      vi.mocked(api.patchDevice).mockResolvedValue(undefined as never)
      seedDevices(makeDevice())
      const wrapper = mountControl()
      await openFormAndRename(wrapper, 'Attic')
      await (wrapper.emitted('stage')![0]![0] as () => Promise<void>)()
      await flushPromises()
      expect(wrapper.find('form.sdr-devices-accordion').exists()).toBe(false)
    })
  })

  it('has no accessibility violations with devices, a warning and the serial panel', async () => {
    seedDevices(
      makeDevice({ needs_identification: true }),
      makeDevice({ device_id: 'device-2', present: false, usb: null }),
    )
    const wrapper = mountControl()
    await flushPromises()
    useLocalSdrStore().openSerialFlash('device-1')
    await flushPromises()
    await expectNoAxeViolations(wrapper)
  })
})
