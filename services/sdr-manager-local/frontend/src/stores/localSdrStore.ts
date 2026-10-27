import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../api/sdrManagerLocalApi'
import type {
  LocalDevicePatch,
  LocalDeviceStatus,
  LocalLocation,
  LocalNoticeEvent,
  LocalPortConstraints,
  LocalSerialFlashAccepted,
  LocalStatusResponse,
} from '../api/types'

/** The event stream's state, for the connection line above the devices. */
export type LocalConnectionState = 'connecting' | 'live' | 'reconnecting' | 'offline'

/** One entry in the notice log: a `notice` event, counted when it repeats. */
export interface LocalNoticeItem extends LocalNoticeEvent {
  id: string
  dismissed: boolean
  /** How many times this identical notice has arrived. */
  repeatCount: number
  /** `ts` of the latest occurrence. */
  lastSeenTs: number
}

/** A present device sharing its factory serial with another, so neither can be told apart. */
export interface LocalSerialConflict {
  serial: string
  deviceIds: string[]
}

/** Notices kept; the oldest go first. */
const MAX_NOTICES = 50

/** The name to show for a device: its own, else its device id. */
export function deviceLabel(device: Pick<LocalDeviceStatus, 'name' | 'device_id'>): string {
  return device.name || device.device_id
}

/** Whether a device is idle enough to take an EEPROM write (not starting or streaming). */
export function isDeviceIdle(device: LocalDeviceStatus): boolean {
  return device.state !== 'starting' && device.state !== 'streaming'
}

function topologyPath(device: LocalDeviceStatus): string | null {
  return device.usb?.topology_path ?? device.usb_last_known?.topology_path ?? null
}

/** USB port order, absent devices (no known port) last — the order the API sorts by. */
function compareByTopology(first: LocalDeviceStatus, second: LocalDeviceStatus): number {
  const firstPath = topologyPath(first)
  const secondPath = topologyPath(second)
  if (firstPath === secondPath) return 0
  if (firstPath === null) return 1
  if (secondPath === null) return -1
  return firstPath.localeCompare(secondPath, undefined, { numeric: true })
}

/**
 * The RTL-SDRs plugged into this machine, as sdr-manager-local reports them.
 *
 * `useLocalSdrEvents` keeps it live from the event stream (`snapshot`
 * replaces everything, `device_changed`/`device_removed` merge, `notice` adds
 * to the log); the screens render from here and call its actions.
 */
export const useLocalSdrStore = defineStore('sdrManagerLocalDevices', () => {
  const devicesById = ref<Record<string, LocalDeviceStatus>>({})
  const order = ref<string[]>([])
  const loaded = ref(false)
  const constraints = ref<LocalPortConstraints | null>(null)
  /** A free output port the API suggests for the next device it configures. */
  const portSuggestion = ref<number | null>(null)
  const location = ref<LocalLocation | null>(null)
  const notices = ref<LocalNoticeItem[]>([])
  const connection = ref<LocalConnectionState>('connecting')
  /** Why the devices couldn't be read, when they couldn't. */
  const loadError = ref<string | null>(null)
  /** The device the serial-flash panel is open for, or null. */
  const serialFlashDeviceId = ref<string | null>(null)
  /** The latest sentence for screen readers (one polite live region reads it). */
  const announcement = ref('')
  let noticeSequence = 0

  const devices = computed(() =>
    order.value
      .map((deviceId) => devicesById.value[deviceId])
      .filter((device): device is LocalDeviceStatus => device !== undefined),
  )
  const presentDevices = computed(() => devices.value.filter((device) => device.present))
  /** Configured devices that are not plugged in; a detected device is simply gone when unplugged. */
  const absentDevices = computed(() =>
    devices.value.filter((device) => !device.present && device.record_id !== null),
  )
  const visibleNotices = computed(() => notices.value.filter((notice) => !notice.dismissed))
  const serialFlashDevice = computed(() =>
    serialFlashDeviceId.value === null
      ? null
      : (devicesById.value[serialFlashDeviceId.value] ?? null),
  )
  /** Present devices reporting the same factory serial (each needs a unique one flashed). */
  const serialConflicts = computed<LocalSerialConflict[]>(() => {
    const bySerial = new Map<string, string[]>()
    for (const device of presentDevices.value) {
      const serial = device.usb?.serial
      if (!serial) continue
      bySerial.set(serial, [...(bySerial.get(serial) ?? []), device.device_id])
    }
    return [...bySerial.entries()]
      .filter(([, deviceIds]) => deviceIds.length > 1)
      .map(([serial, deviceIds]) => ({ serial, deviceIds }))
  })
  /** This machine's position is blank, so other Sentinels can't place it on their maps. */
  const locationMissing = computed(
    () =>
      location.value !== null &&
      (location.value.latitude === null || location.value.longitude === null),
  )

  function announce(sentence: string): void {
    // Cleared first so the same sentence twice is still read out twice.
    announcement.value = ''
    queueMicrotask(() => {
      announcement.value = sentence
    })
  }

  function announceTransition(
    previous: LocalDeviceStatus | undefined,
    next: LocalDeviceStatus,
  ): void {
    const label = deviceLabel(next)
    if (previous === undefined) {
      if (next.present) announce(`${label} connected.`)
      return
    }
    if (previous.present && !next.present) announce(`${label} disconnected.`)
    else if (!previous.present && next.present) announce(`${label} connected.`)
    else if (previous.state !== next.state) {
      announce(
        next.state === 'error'
          ? `${label} error${next.state_reason ? `: ${next.state_reason}` : ''}.`
          : `${label} now ${next.state}.`,
      )
    }
  }

  function applySnapshot(snapshot: LocalStatusResponse): void {
    const nextById: Record<string, LocalDeviceStatus> = {}
    for (const device of snapshot.sdrs) nextById[device.device_id] = device
    devicesById.value = nextById
    order.value = [...snapshot.sdrs].sort(compareByTopology).map((device) => device.device_id)
    location.value = snapshot.location
    loaded.value = true
    loadError.value = null
  }

  function applyDeviceChanged(device: LocalDeviceStatus): void {
    const previous = devicesById.value[device.device_id]
    announceTransition(previous, device)
    devicesById.value = { ...devicesById.value, [device.device_id]: device }
    if (previous === undefined) {
      order.value = [...order.value, device.device_id].sort((firstId, secondId) =>
        compareByTopology(devicesById.value[firstId]!, devicesById.value[secondId]!),
      )
    }
  }

  function applyDeviceRemoved(deviceId: string): void {
    const previous = devicesById.value[deviceId]
    if (previous === undefined) return
    const remaining = { ...devicesById.value }
    delete remaining[deviceId]
    devicesById.value = remaining
    order.value = order.value.filter((id) => id !== deviceId)
    if (serialFlashDeviceId.value === deviceId) serialFlashDeviceId.value = null
    announce(`${deviceLabel(previous)} disconnected.`)
  }

  /**
   * Add a notice, folding an identical undismissed one into a counter: a
   * flapping dongle repeats the same notice forever and would otherwise push
   * every other one out of the log. The folded notice keeps its place, so
   * rows don't reorder under an operator mid-read.
   */
  function applyNotice(notice: LocalNoticeEvent): void {
    const repeatIndex = notices.value.findIndex(
      (candidate) =>
        !candidate.dismissed &&
        candidate.device_id === notice.device_id &&
        candidate.code === notice.code &&
        candidate.message === notice.message,
    )
    const repeated = notices.value[repeatIndex]
    if (repeated !== undefined) {
      const next = [...notices.value]
      next[repeatIndex] = {
        ...repeated,
        repeatCount: repeated.repeatCount + 1,
        lastSeenTs: notice.ts,
      }
      notices.value = next
      return
    }
    noticeSequence += 1
    const item: LocalNoticeItem = {
      ...notice,
      id: `${notice.ts}-${noticeSequence}`,
      dismissed: false,
      repeatCount: 1,
      lastSeenTs: notice.ts,
    }
    notices.value = [item, ...notices.value].slice(0, MAX_NOTICES)
  }

  function dismissNotice(noticeId: string): void {
    notices.value = notices.value.map((notice) =>
      notice.id === noticeId ? { ...notice, dismissed: true } : notice,
    )
  }

  function setConnection(state: LocalConnectionState): void {
    connection.value = state
  }

  /** Read the devices once (`GET /status`), for before the stream's first snapshot. */
  async function refreshStatus(): Promise<void> {
    try {
      applySnapshot(await api.getStatus())
    } catch {
      loaded.value = true
      loadError.value = 'Could not read this machine’s SDRs.'
    }
  }

  /** Read the port rules (`GET /devices`). Advisory: the API checks every port anyway. */
  async function refreshConstraints(): Promise<void> {
    try {
      const response = await api.listDevices()
      constraints.value = response.constraints
      portSuggestion.value = response.port_suggestion
    } catch {
      /* The port field then leaves checking to the API. */
    }
  }

  /**
   * Save a device edit. The confirmed device arrives as a `device_changed`
   * event; the caller shows a refusal (it throws `SdrManagerApiError`).
   */
  async function patchDevice(
    deviceId: string,
    patch: LocalDevicePatch,
    summary: string,
  ): Promise<void> {
    await api.patchDevice(deviceId, patch)
    announce(summary)
    // A new or moved output port changes which ports are free.
    if (patch.output_port !== undefined) void refreshConstraints()
  }

  /** Forget an absent device's saved configuration. */
  async function forgetDevice(deviceId: string): Promise<void> {
    const device = devicesById.value[deviceId]
    await api.forgetDevice(deviceId)
    applyDeviceRemoved(deviceId)
    announce(`Forgot ${device ? deviceLabel(device) : deviceId}.`)
    void refreshConstraints()
  }

  function flashSerial(deviceId: string, serial: string): Promise<LocalSerialFlashAccepted> {
    return api.flashSerial(deviceId, serial)
  }

  function openSerialFlash(deviceId: string): void {
    serialFlashDeviceId.value = deviceId
  }

  function closeSerialFlash(): void {
    serialFlashDeviceId.value = null
  }

  return {
    devicesById,
    loaded,
    constraints,
    portSuggestion,
    location,
    notices,
    connection,
    loadError,
    serialFlashDeviceId,
    announcement,
    devices,
    presentDevices,
    absentDevices,
    visibleNotices,
    serialFlashDevice,
    serialConflicts,
    locationMissing,
    announce,
    applySnapshot,
    applyDeviceChanged,
    applyDeviceRemoved,
    applyNotice,
    dismissNotice,
    setConnection,
    refreshStatus,
    refreshConstraints,
    patchDevice,
    forgetDevice,
    flashSerial,
    openSerialFlash,
    closeSerialFlash,
  }
})
