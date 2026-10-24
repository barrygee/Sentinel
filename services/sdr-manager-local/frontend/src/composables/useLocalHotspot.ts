import { computed, ref } from 'vue'
import * as api from '../api/sdrManagerLocalApi'
import type {
  LocalHotspotClient,
  LocalHotspotConfigRequest,
  LocalHotspotState,
  LocalWirelessInterface,
} from '../api/types'
import { useLocalSdrStore } from '../stores/localSdrStore'
import { hotspotCommandOutput, hotspotErrorMessage } from '../utils/errorMessages'

/**
 * The HOTSPOT card's state: this machine's Wi-Fi access point, its wireless
 * interfaces and who is connected, plus every action on them.
 *
 * Read when the card mounts and after each action; the API can also roll a
 * change back on its own timer, which `useLocalSdrEvents` reports as a notice
 * and the card answers with `refresh()`.
 */
export function useLocalHotspot() {
  const devices = useLocalSdrStore()
  const state = ref<LocalHotspotState | null>(null)
  const interfaces = ref<LocalWirelessInterface[]>([])
  /** Null when the leases can't be read (no hotspot, or no lease file). */
  const clients = ref<LocalHotspotClient[] | null>(null)
  const busy = ref(false)
  const errorMessage = ref<string | null>(null)
  /** The tail of a failed network command's output, for the operator to read or copy. */
  const commandOutput = ref<string | null>(null)
  /** What the API said when it rolled a change back by itself, until the next action. */
  const rollbackMessage = ref<string | null>(null)

  /** Whether the API may change the hotspot at all right now. */
  const canChange = computed(
    () =>
      state.value !== null &&
      state.value.available &&
      state.value.control_enabled &&
      state.value.auth_token_configured,
  )

  function recordError(error: unknown, fallback: string): void {
    errorMessage.value = hotspotErrorMessage(error, fallback)
    commandOutput.value = hotspotCommandOutput(error)
  }

  function clearError(): void {
    errorMessage.value = null
    commandOutput.value = null
    rollbackMessage.value = null
  }

  async function refreshClients(): Promise<void> {
    try {
      clients.value = (await api.listHotspotClients()).clients
    } catch {
      clients.value = null
    }
  }

  async function refresh(): Promise<void> {
    try {
      const [nextState, nextInterfaces] = await Promise.all([
        api.getHotspot(),
        api.listHotspotInterfaces(),
      ])
      state.value = nextState
      interfaces.value = nextInterfaces
      clearError()
    } catch (error) {
      recordError(error, 'Could not read the hotspot settings.')
    }
    await refreshClients()
  }

  /** Run one action that answers with the new state, announcing `success`. */
  async function run(
    action: () => Promise<LocalHotspotState>,
    success: string,
    fallback: string,
  ): Promise<boolean> {
    busy.value = true
    clearError()
    try {
      state.value = await action()
      devices.announce(success)
      void refreshClients()
      return true
    } catch (error) {
      recordError(error, fallback)
      return false
    } finally {
      busy.value = false
    }
  }

  function save(body: LocalHotspotConfigRequest): Promise<boolean> {
    return run(
      () => api.saveHotspot(body),
      body.enabled ? 'Hotspot saved and started.' : 'Hotspot saved.',
      'Could not save the hotspot settings.',
    )
  }

  function start(confirmUplinkLoss: boolean): Promise<boolean> {
    return run(
      () => api.startHotspot(confirmUplinkLoss),
      'Hotspot started.',
      'Could not start the hotspot.',
    )
  }

  function stop(confirmUplinkLoss: boolean): Promise<boolean> {
    return run(
      () => api.stopHotspot(confirmUplinkLoss),
      'Hotspot stopped.',
      'Could not stop the hotspot.',
    )
  }

  function confirm(): Promise<boolean> {
    return run(
      () => api.confirmHotspot(),
      'Hotspot kept. It will start with this machine from now on.',
      'Could not keep the hotspot.',
    )
  }

  async function forget(): Promise<boolean> {
    busy.value = true
    clearError()
    try {
      await api.deleteHotspot()
      devices.announce('Hotspot settings deleted.')
      await refresh()
      return true
    } catch (error) {
      recordError(error, 'Could not delete the hotspot settings.')
      return false
    } finally {
      busy.value = false
    }
  }

  async function setControl(enabled: boolean): Promise<void> {
    busy.value = true
    clearError()
    try {
      await api.setHotspotControl(enabled)
      await refresh()
    } catch (error) {
      recordError(error, 'Could not change hotspot control.')
    } finally {
      busy.value = false
    }
  }

  async function releaseLease(macAddress: string): Promise<void> {
    clearError()
    try {
      await api.releaseHotspotLease(macAddress)
      devices.announce('Lease released.')
    } catch (error) {
      recordError(error, 'Could not release that lease.')
    }
    await refreshClients()
  }

  /** The API rolled a change back by itself: say so out loud and show what is true now. */
  async function onRollback(message: string): Promise<void> {
    await refresh()
    rollbackMessage.value = message
  }

  return {
    state,
    interfaces,
    clients,
    busy,
    errorMessage,
    commandOutput,
    rollbackMessage,
    canChange,
    refresh,
    save,
    start,
    stop,
    confirm,
    forget,
    setControl,
    releaseLease,
    onRollback,
  }
}

export type LocalHotspot = ReturnType<typeof useLocalHotspot>
