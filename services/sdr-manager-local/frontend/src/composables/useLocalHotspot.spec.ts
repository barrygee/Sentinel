import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import type { LocalHotspotConfigRequest } from '../api/types'
import { makeHotspotState } from '../testing/factories'
import { useLocalSdrStore } from '../stores/localSdrStore'
import { useLocalHotspot } from './useLocalHotspot'

const api = vi.hoisted(() => ({
  getHotspot: vi.fn(),
  listHotspotInterfaces: vi.fn(),
  listHotspotClients: vi.fn(),
  saveHotspot: vi.fn(),
  startHotspot: vi.fn(),
  stopHotspot: vi.fn(),
  confirmHotspot: vi.fn(),
  deleteHotspot: vi.fn(),
  setHotspotControl: vi.fn(),
  releaseHotspotLease: vi.fn(),
}))
vi.mock('../api/sdrManagerLocalApi', () => api)

const WIRELESS = [{ name: 'wlan0' }]
const CLIENTS = [{ mac_address: 'aa:bb', ip_address: '10.42.0.2' }]

function saveBody(enabled: boolean): LocalHotspotConfigRequest {
  return {
    ssid: 'Sentinel',
    security: 'wpa2',
    hidden: false,
    enabled,
    interface: null,
    band: 'bg',
    channel: 0,
    gateway_cidr: null,
    confirm_uplink_loss: false,
  }
}

function refusal(code: string, message = 'API words', context = {}) {
  return new SdrManagerApiError(409, code, message, context)
}

describe('useLocalHotspot', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    for (const mock of Object.values(api)) mock.mockReset()
    api.getHotspot.mockResolvedValue(makeHotspotState())
    api.listHotspotInterfaces.mockResolvedValue(WIRELESS)
    api.listHotspotClients.mockResolvedValue({ clients: CLIENTS, generated_at: 0 })
  })

  describe('canChange', () => {
    it('is false before the hotspot has been read', () => {
      expect(useLocalHotspot().canChange.value).toBe(false)
    })

    it.each([
      ['unavailable', { available: false }],
      ['control disabled', { control_enabled: false }],
      ['no console password', { auth_token_configured: false }],
    ])('is false when %s', async (_reason, override) => {
      api.getHotspot.mockResolvedValue(makeHotspotState(override))
      const hotspot = useLocalHotspot()

      await hotspot.refresh()

      expect(hotspot.canChange.value).toBe(false)
    })

    it('is true when available, controllable and a password is set', async () => {
      const hotspot = useLocalHotspot()

      await hotspot.refresh()

      expect(hotspot.canChange.value).toBe(true)
    })
  })

  describe('refresh', () => {
    it('loads state, interfaces and clients and clears old messages', async () => {
      const hotspot = useLocalHotspot()
      hotspot.errorMessage.value = 'old'
      hotspot.commandOutput.value = 'old output'
      hotspot.rollbackMessage.value = 'old rollback'

      await hotspot.refresh()

      expect(hotspot.state.value).toEqual(makeHotspotState())
      expect(hotspot.interfaces.value).toEqual(WIRELESS)
      expect(hotspot.clients.value).toEqual(CLIENTS)
      expect(hotspot.errorMessage.value).toBeNull()
      expect(hotspot.commandOutput.value).toBeNull()
      expect(hotspot.rollbackMessage.value).toBeNull()
    })

    it('records the error and command output, keeps the old state, and still reads clients', async () => {
      const hotspot = useLocalHotspot()
      await hotspot.refresh()
      api.getHotspot.mockRejectedValue(
        refusal('hotspot_command_failed', 'x', { stderr_tail: 'nmcli: boom' }),
      )

      await hotspot.refresh()

      expect(hotspot.errorMessage.value).toContain('The network command failed.')
      expect(hotspot.commandOutput.value).toBe('nmcli: boom')
      expect(hotspot.state.value).toEqual(makeHotspotState())
      expect(api.listHotspotClients).toHaveBeenCalledTimes(2)
    })

    it('falls back to a generic message for a non-API failure', async () => {
      api.listHotspotInterfaces.mockRejectedValue(new Error('down'))
      const hotspot = useLocalHotspot()

      await hotspot.refresh()

      expect(hotspot.errorMessage.value).toBe('Could not read the hotspot settings.')
      expect(hotspot.state.value).toBeNull()
    })

    it('treats unreadable leases as no client list', async () => {
      api.listHotspotClients.mockRejectedValue(new Error('no lease file'))
      const hotspot = useLocalHotspot()

      await hotspot.refresh()

      expect(hotspot.clients.value).toBeNull()
    })

    it('keeps a null client list when the API reports one', async () => {
      api.listHotspotClients.mockResolvedValue({ clients: null, generated_at: 0 })
      const hotspot = useLocalHotspot()

      await hotspot.refresh()

      expect(hotspot.clients.value).toBeNull()
    })
  })

  describe('actions that answer with the new state', () => {
    it('save announces "saved and started" for an enabled hotspot', async () => {
      const next = makeHotspotState({ active: true })
      api.saveHotspot.mockResolvedValue(next)
      const hotspot = useLocalHotspot()
      const store = useLocalSdrStore()

      await expect(hotspot.save(saveBody(true))).resolves.toBe(true)
      await flushPromises()

      expect(api.saveHotspot).toHaveBeenCalledWith(saveBody(true))
      expect(hotspot.state.value).toEqual(next)
      expect(store.announcement).toBe('Hotspot saved and started.')
      expect(api.listHotspotClients).toHaveBeenCalledOnce()
    })

    it('save announces plain "saved" for a disabled hotspot', async () => {
      api.saveHotspot.mockResolvedValue(makeHotspotState())
      const hotspot = useLocalHotspot()
      const store = useLocalSdrStore()

      await hotspot.save(saveBody(false))
      await flushPromises()

      expect(store.announcement).toBe('Hotspot saved.')
    })

    it.each([
      ['start', 'startHotspot', 'Hotspot started.', 'Could not start the hotspot.'],
      ['stop', 'stopHotspot', 'Hotspot stopped.', 'Could not stop the hotspot.'],
    ] as const)(
      '%s passes the uplink confirmation and announces',
      async (method, apiName, success, failure) => {
        api[apiName].mockResolvedValueOnce(makeHotspotState({ active: true }))
        const hotspot = useLocalHotspot()
        const store = useLocalSdrStore()

        await expect(hotspot[method](true)).resolves.toBe(true)
        await flushPromises()

        expect(api[apiName]).toHaveBeenCalledWith(true)
        expect(store.announcement).toBe(success)

        api[apiName].mockRejectedValueOnce(new Error('down'))
        await expect(hotspot[method](false)).resolves.toBe(false)
        expect(hotspot.errorMessage.value).toBe(failure)
      },
    )

    it('confirm keeps the hotspot', async () => {
      api.confirmHotspot.mockResolvedValue(makeHotspotState({ pending_confirmation: false }))
      const hotspot = useLocalHotspot()
      const store = useLocalSdrStore()

      await expect(hotspot.confirm()).resolves.toBe(true)
      await flushPromises()

      expect(store.announcement).toBe('Hotspot kept. It will start with this machine from now on.')
    })

    it('confirm reports a failure with the caller-specific wording', async () => {
      api.confirmHotspot.mockRejectedValue(new Error('down'))
      const hotspot = useLocalHotspot()

      await expect(hotspot.confirm()).resolves.toBe(false)

      expect(hotspot.errorMessage.value).toBe('Could not keep the hotspot.')
    })

    it('a refusal returns false, shows the translated message and command output, and clears busy', async () => {
      api.startHotspot.mockRejectedValue(
        refusal('hotspot_busy', 'x', { stderr_tail: 'device busy' }),
      )
      const hotspot = useLocalHotspot()
      const store = useLocalSdrStore()

      await expect(hotspot.start(false)).resolves.toBe(false)

      expect(hotspot.errorMessage.value).toContain('Another hotspot change is still running')
      expect(hotspot.commandOutput.value).toBe('device busy')
      expect(hotspot.busy.value).toBe(false)
      expect(hotspot.state.value).toBeNull()
      expect(api.listHotspotClients).not.toHaveBeenCalled()
      await flushPromises()
      expect(store.announcement).toBe('')
    })

    it('is busy while an action runs and clears earlier messages first', async () => {
      let finish: (value: unknown) => void = () => undefined
      api.startHotspot.mockReturnValue(new Promise((resolve) => (finish = resolve)))
      const hotspot = useLocalHotspot()
      hotspot.errorMessage.value = 'old'
      hotspot.rollbackMessage.value = 'old rollback'

      const pending = hotspot.start(false)

      expect(hotspot.busy.value).toBe(true)
      expect(hotspot.errorMessage.value).toBeNull()
      expect(hotspot.rollbackMessage.value).toBeNull()
      finish(makeHotspotState())
      await pending
      expect(hotspot.busy.value).toBe(false)
    })
  })

  describe('forget', () => {
    it('deletes, announces and refreshes', async () => {
      api.deleteHotspot.mockResolvedValue(undefined)
      const hotspot = useLocalHotspot()
      const store = useLocalSdrStore()

      await expect(hotspot.forget()).resolves.toBe(true)
      await flushPromises()

      expect(store.announcement).toBe('Hotspot settings deleted.')
      expect(api.getHotspot).toHaveBeenCalledOnce()
      expect(hotspot.busy.value).toBe(false)
    })

    it('returns false with a message when the delete is refused, without refreshing', async () => {
      api.deleteHotspot.mockRejectedValue(new Error('down'))
      const hotspot = useLocalHotspot()

      await expect(hotspot.forget()).resolves.toBe(false)

      expect(hotspot.errorMessage.value).toBe('Could not delete the hotspot settings.')
      expect(api.getHotspot).not.toHaveBeenCalled()
      expect(hotspot.busy.value).toBe(false)
    })
  })

  describe('setControl', () => {
    it('sets control then refreshes', async () => {
      api.setHotspotControl.mockResolvedValue({
        control_enabled: true,
        forced_by_environment: false,
      })
      const hotspot = useLocalHotspot()

      await hotspot.setControl(true)

      expect(api.setHotspotControl).toHaveBeenCalledWith(true)
      expect(api.getHotspot).toHaveBeenCalledOnce()
      expect(hotspot.busy.value).toBe(false)
    })

    it('shows the failure and does not refresh', async () => {
      api.setHotspotControl.mockRejectedValue(new Error('down'))
      const hotspot = useLocalHotspot()

      await hotspot.setControl(false)

      expect(hotspot.errorMessage.value).toBe('Could not change hotspot control.')
      expect(api.getHotspot).not.toHaveBeenCalled()
      expect(hotspot.busy.value).toBe(false)
    })
  })

  describe('releaseLease', () => {
    it('releases, announces and re-reads the clients', async () => {
      api.releaseHotspotLease.mockResolvedValue(undefined)
      const hotspot = useLocalHotspot()
      const store = useLocalSdrStore()

      await hotspot.releaseLease('aa:bb')
      await flushPromises()

      expect(api.releaseHotspotLease).toHaveBeenCalledWith('aa:bb')
      expect(store.announcement).toBe('Lease released.')
      expect(hotspot.clients.value).toEqual(CLIENTS)
    })

    it('shows a failure but still re-reads the clients', async () => {
      api.releaseHotspotLease.mockRejectedValue(new Error('down'))
      const hotspot = useLocalHotspot()

      await hotspot.releaseLease('aa:bb')

      expect(hotspot.errorMessage.value).toBe('Could not release that lease.')
      expect(api.listHotspotClients).toHaveBeenCalledOnce()
    })
  })

  describe('onRollback', () => {
    it('refreshes first, then shows the API’s explanation (refresh would clear it)', async () => {
      const hotspot = useLocalHotspot()

      await hotspot.onRollback('Rolled back after 60 s')

      expect(api.getHotspot).toHaveBeenCalledOnce()
      expect(hotspot.rollbackMessage.value).toBe('Rolled back after 60 s')
    })
  })
})
