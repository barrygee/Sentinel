import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import type { LocalHotspotState } from '../../api/types'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import { FakeEventSource, makeAuthState, makeHotspotState } from '../../testing/factories'
import HotspotClientsTable from './HotspotClientsTable.vue'
import HotspotControl from './HotspotControl.vue'
import HotspotRollbackBanner from './HotspotRollbackBanner.vue'
import HotspotSettingsForm from './HotspotSettingsForm.vue'

vi.mock('../../api/sdrManagerLocalApi')

const mounted: VueWrapper[] = []

async function mountControl(state: Partial<LocalHotspotState> = {}): Promise<VueWrapper> {
  vi.mocked(api.getHotspot).mockResolvedValue(makeHotspotState(state))
  const wrapper = mount(HotspotControl)
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function button(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((candidate) => candidate.text() === text)
}

describe('HotspotControl', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    FakeEventSource.reset()
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.mocked(api.getAuthState).mockResolvedValue(makeAuthState({ password_set: false }))
    vi.mocked(api.listDevices).mockRejectedValue(new Error('offline'))
    vi.mocked(api.listHotspotInterfaces).mockResolvedValue([])
    vi.mocked(api.listHotspotClients).mockResolvedValue({ clients: [], generated_at: 0 })
  })
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    vi.unstubAllGlobals()
  })

  it('says it is reading the hotspot until the first answer', () => {
    vi.mocked(api.getHotspot).mockReturnValue(new Promise(() => undefined))
    const wrapper = mount(HotspotControl)
    mounted.push(wrapper)
    expect(wrapper.get('.sdr-devices-empty').text()).toBe('Reading the hotspot…')
  })

  it('shows the failure, not "Reading", when the hotspot cannot be read', async () => {
    vi.mocked(api.getHotspot).mockRejectedValue(new TypeError('offline'))
    const wrapper = mount(HotspotControl)
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Reading the hotspot')
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not read the hotspot settings.')
  })

  it('shows the command output of a failed network command beside the error', async () => {
    vi.mocked(api.getHotspot).mockRejectedValue(
      new SdrManagerApiError(500, 'hotspot_command_failed', 'x', { stderr_tail: 'nmcli: boom' }),
    )
    const wrapper = mount(HotspotControl)
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.get('pre.hotspot-command-output').text()).toBe('nmcli: boom')
  })

  it('shows no command output block when the error carries none', async () => {
    vi.mocked(api.getHotspot).mockRejectedValue(new TypeError('offline'))
    const wrapper = mount(HotspotControl)
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.find('pre').exists()).toBe(false)
  })

  it('explains a machine that cannot host a hotspot and shows nothing else', async () => {
    const wrapper = await mountControl({ available: false })
    expect(wrapper.get('.sdr-devices-empty').text()).toContain('NetworkManager isn’t reachable')
    expect(wrapper.find('[role="switch"]').exists()).toBe(false)
    expect(wrapper.findComponent(HotspotSettingsForm).exists()).toBe(false)
  })

  describe('ALLOW CHANGES', () => {
    it('is off by default with a note, hiding the hotspot controls', async () => {
      const wrapper = await mountControl({ control_enabled: false })
      const toggle = wrapper.get('[role="switch"]')
      expect(toggle.attributes('aria-label')).toBe('Let SDR Manager change this machine’s Wi-Fi')
      expect(toggle.attributes('aria-checked')).toBe('false')
      expect(wrapper.text()).toContain('SDR Manager may not change this machine’s Wi-Fi.')
      expect(wrapper.findComponent(HotspotSettingsForm).exists()).toBe(false)
    })

    it('turns control on at once and re-reads the hotspot', async () => {
      vi.mocked(api.setHotspotControl).mockResolvedValue({
        control_enabled: true,
        forced_by_environment: false,
      })
      const wrapper = await mountControl({ control_enabled: false })
      vi.mocked(api.getHotspot).mockResolvedValue(makeHotspotState({ control_enabled: true }))
      await wrapper.get('[role="switch"]').trigger('click')
      await flushPromises()
      expect(api.setHotspotControl).toHaveBeenCalledWith(true)
      expect(wrapper.findComponent(HotspotSettingsForm).exists()).toBe(true)
    })

    it('shows the refusal when control cannot be changed', async () => {
      vi.mocked(api.setHotspotControl).mockRejectedValue(new TypeError('x'))
      const wrapper = await mountControl({ control_enabled: false })
      await wrapper.get('[role="switch"]').trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain('Could not change hotspot control.')
    })
  })

  it('asks for a console password first when none is set', async () => {
    const wrapper = await mountControl({ auth_token_configured: false })
    expect(wrapper.get('.warning-notice').text()).toContain('Set a console password')
    expect((await mountControl()).find('.warning-notice').exists()).toBe(false)
  })

  describe('actions on a configured hotspot', () => {
    it('shows none for a hotspot that is not set up', async () => {
      const wrapper = await mountControl({ configured: false })
      expect(wrapper.find('.hotspot-actions').exists()).toBe(false)
      expect(wrapper.findComponent(HotspotSettingsForm).exists()).toBe(true)
    })

    it('STARTs a stopped hotspot, passing whether the uplink would be lost', async () => {
      vi.mocked(api.startHotspot).mockResolvedValue(makeHotspotState({ active: true }))
      const wrapper = await mountControl({
        active: false,
        uplink_interface_is_hotspot_interface: true,
      })
      expect(button(wrapper, 'STOP')).toBeUndefined()
      await button(wrapper, 'START')!.trigger('click')
      await flushPromises()
      expect(api.startHotspot).toHaveBeenCalledWith(true)
      expect(button(wrapper, 'STOP')).toBeDefined()
    })

    it('STOPs a running hotspot, passing whether the uplink would be lost', async () => {
      vi.mocked(api.stopHotspot).mockResolvedValue(makeHotspotState({ active: false }))
      const wrapper = await mountControl({ active: true })
      expect(button(wrapper, 'START')).toBeUndefined()
      await button(wrapper, 'STOP')!.trigger('click')
      await flushPromises()
      expect(api.stopHotspot).toHaveBeenCalledWith(false)
    })

    it('cannot START while the API would refuse changes', async () => {
      const wrapper = await mountControl({ active: false, auth_token_configured: false })
      expect(button(wrapper, 'START')!.attributes('disabled')).toBeDefined()
    })

    it('disables START, STOP and DELETE while an action is running', async () => {
      vi.mocked(api.startHotspot).mockReturnValue(new Promise(() => undefined))
      const wrapper = await mountControl({ active: false })
      await button(wrapper, 'START')!.trigger('click')
      expect(button(wrapper, 'START')!.attributes('disabled')).toBeDefined()
      expect(button(wrapper, 'DELETE…')!.attributes('disabled')).toBeDefined()
    })

    it('asks before deleting: DELETE… then DELETE HOTSPOT SETTINGS', async () => {
      vi.mocked(api.deleteHotspot).mockResolvedValue(undefined)
      const wrapper = await mountControl()
      expect(button(wrapper, 'DELETE HOTSPOT SETTINGS')).toBeUndefined()
      await button(wrapper, 'DELETE…')!.trigger('click')
      expect(button(wrapper, 'DELETE…')).toBeUndefined()
      expect(api.deleteHotspot).not.toHaveBeenCalled()
      await button(wrapper, 'DELETE HOTSPOT SETTINGS')!.trigger('click')
      await flushPromises()
      expect(api.deleteHotspot).toHaveBeenCalledTimes(1)
      expect(button(wrapper, 'DELETE…')).toBeDefined()
      expect(useLocalSdrStore().announcement).toBe('Hotspot settings deleted.')
    })

    it('shows the API’s reason when an action is refused', async () => {
      vi.mocked(api.startHotspot).mockRejectedValue(
        new SdrManagerApiError(409, 'hotspot_busy', 'raw'),
      )
      const wrapper = await mountControl({ active: false })
      await button(wrapper, 'START')!.trigger('click')
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toContain(
        'Another hotspot change is still running',
      )
    })
  })

  describe('trial period', () => {
    const TRIAL = { pending_confirmation: true, confirm_deadline_ms: Date.now() + 120_000 }

    it('shows the countdown banner only while a change is on trial with a deadline', async () => {
      expect((await mountControl(TRIAL)).findComponent(HotspotRollbackBanner).exists()).toBe(true)
      expect(
        (await mountControl({ pending_confirmation: true, confirm_deadline_ms: null }))
          .findComponent(HotspotRollbackBanner)
          .exists(),
      ).toBe(false)
      expect(
        (await mountControl({ pending_confirmation: false, confirm_deadline_ms: 5 }))
          .findComponent(HotspotRollbackBanner)
          .exists(),
      ).toBe(false)
    })

    it('KEEP IT confirms the hotspot', async () => {
      vi.mocked(api.confirmHotspot).mockResolvedValue(makeHotspotState())
      const wrapper = await mountControl(TRIAL)
      await button(wrapper, 'KEEP IT')!.trigger('click')
      await flushPromises()
      expect(api.confirmHotspot).toHaveBeenCalledTimes(1)
      expect(wrapper.findComponent(HotspotRollbackBanner).exists()).toBe(false)
      expect(useLocalSdrStore().announcement).toContain('Hotspot kept.')
    })

    it('UNDO NOW stops the hotspot without confirming an uplink loss', async () => {
      vi.mocked(api.stopHotspot).mockResolvedValue(makeHotspotState())
      const wrapper = await mountControl({ ...TRIAL, uplink_interface_is_hotspot_interface: true })
      await button(wrapper, 'UNDO NOW')!.trigger('click')
      await flushPromises()
      expect(api.stopHotspot).toHaveBeenCalledWith(false)
    })
  })

  describe('connected devices', () => {
    it('lists them only while the hotspot is running', async () => {
      expect(
        (await mountControl({ active: false })).findComponent(HotspotClientsTable).exists(),
      ).toBe(false)
      expect(
        (await mountControl({ active: true })).findComponent(HotspotClientsTable).exists(),
      ).toBe(true)
    })

    it('releases a lease from the table', async () => {
      vi.mocked(api.releaseHotspotLease).mockResolvedValue(undefined)
      vi.mocked(api.listHotspotClients).mockResolvedValue({
        generated_at: 0,
        clients: [
          {
            mac_address: 'aa:aa',
            ip_address: '10.42.0.10',
            hostname: 'phone',
            lease_expires_at_ms: 0,
            expired: true,
          },
        ],
      })
      const wrapper = await mountControl({ active: true })
      await button(wrapper, 'RELEASE')!.trigger('click')
      await flushPromises()
      expect(api.releaseHotspotLease).toHaveBeenCalledWith('aa:aa')
    })
  })

  it('saves the settings form through the API', async () => {
    vi.mocked(api.saveHotspot).mockResolvedValue(makeHotspotState())
    const wrapper = await mountControl({ ssid: 'Field' })
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(api.saveHotspot).toHaveBeenCalledWith(
      expect.objectContaining({ ssid: 'Field', enabled: false }),
    )
  })

  describe('rollback reported by the stream', () => {
    it('re-reads the hotspot and shows what the API said', async () => {
      const wrapper = await mountControl({ active: true })
      vi.mocked(api.getHotspot).mockResolvedValue(makeHotspotState({ active: false }))
      FakeEventSource.latest.emit('notice', {
        level: 'warn',
        code: 'hotspot_rollback',
        message: 'The hotspot was undone.',
        device_id: null,
        ts: 1,
      })
      await flushPromises()
      expect(wrapper.get('[role="alert"]').text()).toBe('The hotspot was undone.')
      expect(button(wrapper, 'START')).toBeDefined()
    })

    it('ignores notices that are not rollbacks', async () => {
      const wrapper = await mountControl()
      FakeEventSource.latest.emit('notice', {
        level: 'info',
        code: 'other',
        message: 'Unrelated.',
        device_id: null,
        ts: 1,
      })
      await flushPromises()
      expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    })
  })

  it('shows the pointer instead of the card while this browser is signed out', async () => {
    vi.mocked(api.getAuthState).mockResolvedValue(
      makeAuthState({ password_set: true, authenticated: false }),
    )
    vi.mocked(api.getHotspot).mockResolvedValue(makeHotspotState())
    const wrapper = mount(HotspotControl)
    mounted.push(wrapper)
    await flushPromises()
    expect(wrapper.find('.hotspot').exists()).toBe(false)
    expect(wrapper.text()).toContain('Sign in under DEVICES above')
  })

  it('has no accessibility violations across its states', async () => {
    const running = await mountControl({
      active: true,
      pending_confirmation: true,
      confirm_deadline_ms: Date.now() + 120_000,
      gateway_address: '10.42.0.1',
    })
    await expectNoAxeViolations(running)
    await expectNoAxeViolations(await mountControl({ control_enabled: false }))
    await expectNoAxeViolations(await mountControl({ available: false }))
    vi.mocked(api.getHotspot).mockRejectedValue(
      new SdrManagerApiError(500, 'hotspot_command_failed', 'x', { stderr_tail: 'boom' }),
    )
    const failed = mount(HotspotControl)
    mounted.push(failed)
    await flushPromises()
    await expectNoAxeViolations(failed)
  })
})
