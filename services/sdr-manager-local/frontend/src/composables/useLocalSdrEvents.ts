import { onBeforeUnmount, onMounted, watch, type WatchStopHandle } from 'vue'
import { EVENTS_URL } from '../api/sdrManagerLocalApi'
import type {
  LocalDeviceRemovedEvent,
  LocalDeviceStatus,
  LocalNoticeEvent,
  LocalStatusResponse,
} from '../api/types'
import { useLocalAuthStore } from '../stores/localAuthStore'
import { useLocalSdrStore } from '../stores/localSdrStore'

/** The API sends `health` every 5 s, so this long without any event means the stream is stuck. */
export const STALL_TIMEOUT_MS = 15_000
/** Reconnect back-off: doubles from the first delay up to the cap. */
export const RECONNECT_FIRST_DELAY_MS = 1_000
export const RECONNECT_MAX_DELAY_MS = 30_000

/** Notice codes that mean the hotspot changed on its own (a rollback on the API's timer). */
export const HOTSPOT_ROLLBACK_CODES: ReadonlySet<string> = new Set([
  'hotspot_rollback',
  'hotspot_rollback_failed',
])

type HotspotRollbackListener = (message: string) => void

let subscriberCount = 0
let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let stallTimer: ReturnType<typeof setInterval> | null = null
let reconnectDelayMs = RECONNECT_FIRST_DELAY_MS
let lastEventAt = 0
let stopAuthWatch: WatchStopHandle | null = null
const rollbackListeners = new Set<HotspotRollbackListener>()

function parse<TPayload>(event: MessageEvent<string>): TPayload | null {
  try {
    return JSON.parse(event.data) as TPayload
  } catch {
    return null
  }
}

function clearTimers(): void {
  if (reconnectTimer !== null) clearTimeout(reconnectTimer)
  if (stallTimer !== null) clearInterval(stallTimer)
  reconnectTimer = null
  stallTimer = null
}

function closeSource(): void {
  eventSource?.close()
  eventSource = null
}

function scheduleReconnect(): void {
  const store = useLocalSdrStore()
  closeSource()
  if (reconnectTimer !== null) return
  store.setConnection('reconnecting')
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    open()
  }, reconnectDelayMs)
  reconnectDelayMs = Math.min(reconnectDelayMs * 2, RECONNECT_MAX_DELAY_MS)
}

function open(): void {
  const store = useLocalSdrStore()
  closeSource()
  const source = new EventSource(EVENTS_URL)
  eventSource = source
  lastEventAt = Date.now()

  const received = (): void => {
    lastEventAt = Date.now()
    reconnectDelayMs = RECONNECT_FIRST_DELAY_MS
    store.setConnection('live')
  }
  const on = <TPayload>(name: string, apply: (payload: TPayload) => void): void => {
    source.addEventListener(name, (event) => {
      const payload = parse<TPayload>(event as MessageEvent<string>)
      received()
      if (payload !== null) apply(payload)
    })
  }

  on<LocalStatusResponse>('snapshot', (payload) => store.applySnapshot(payload))
  on<LocalDeviceStatus>('device_changed', (payload) => store.applyDeviceChanged(payload))
  on<LocalDeviceRemovedEvent>('device_removed', (payload) =>
    store.applyDeviceRemoved(payload.device_id),
  )
  on<unknown>('health', () => undefined)
  on<LocalNoticeEvent>('notice', (payload) => {
    store.applyNotice(payload)
    if (HOTSPOT_ROLLBACK_CODES.has(payload.code)) {
      for (const listener of rollbackListeners) listener(payload.message)
    }
  })
  source.addEventListener('error', () => {
    // The browser retries a dropped connection itself; a refused one (401
    // signed out, 503 too many streams) it closes for good, so retry that here.
    if (source.readyState === EventSource.CLOSED) scheduleReconnect()
    else store.setConnection('reconnecting')
  })

  if (stallTimer === null) {
    stallTimer = setInterval(() => {
      if (Date.now() - lastEventAt > STALL_TIMEOUT_MS) scheduleReconnect()
    }, STALL_TIMEOUT_MS / 3)
  }
}

function start(): void {
  const store = useLocalSdrStore()
  const auth = useLocalAuthStore()
  store.setConnection('connecting')
  void store.refreshConstraints()
  open()
  // The stream is refused while signed out; reopen as soon as the operator
  // signs in rather than waiting out the back-off.
  stopAuthWatch = watch(
    () => auth.authenticated,
    (authenticated, wasAuthenticated) => {
      if (authenticated && !wasAuthenticated) {
        clearTimers()
        reconnectDelayMs = RECONNECT_FIRST_DELAY_MS
        void store.refreshConstraints()
        open()
      }
    },
  )
}

function stop(): void {
  clearTimers()
  closeSource()
  stopAuthWatch?.()
  stopAuthWatch = null
  reconnectDelayMs = RECONNECT_FIRST_DELAY_MS
  useLocalSdrStore().setConnection('offline')
}

/**
 * Keep the store live from sdr-manager-local's event stream while the
 * calling component is mounted.
 *
 * Several THIS MACHINE cards call it at once, so they share one stream: the
 * first to mount opens it and the last to unmount closes it. `onHotspotRollback`
 * hears a hotspot rolling itself back, which happens on the API's timer with
 * no request from this browser.
 */
export function useLocalSdrEvents(
  options: { onHotspotRollback?: HotspotRollbackListener } = {},
): void {
  onMounted(() => {
    if (options.onHotspotRollback) rollbackListeners.add(options.onHotspotRollback)
    subscriberCount += 1
    if (subscriberCount === 1) start()
  })
  onBeforeUnmount(() => {
    if (options.onHotspotRollback) rollbackListeners.delete(options.onHotspotRollback)
    subscriberCount -= 1
    if (subscriberCount === 0) stop()
  })
}
