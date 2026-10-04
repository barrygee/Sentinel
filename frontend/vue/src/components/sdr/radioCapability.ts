import { useSdrStore } from '@/stores/sdr'
import { listRadios } from '@/services/sdrRadiosApi'
import type { SdrMode } from '@/stores/sdr'
import { MODES } from './sdrPanelUtils'
import type {
  RadioCapability,
  RadioRestoreRequest,
  RadioTuneRequest,
} from '@/shell/radioCapability'

/**
 * The sdr section's `radio` capability (docs/plans/section-containers.md §3.6,
 * F6). Provided at registration (`section.ts`), before the app mounts, so the
 * store-backed parts — `connected`, the Frequency Manager — work from the
 * first render of any section.
 *
 * Tuning needs the engine (the always-mounted `SdrPanel`), which attaches its
 * handlers with `attachRadioEngine`. A tune or restore that arrives before it
 * attaches is queued and delivered, in order, the moment it does — the same
 * "apply once ready" rule the engine already uses for its control socket.
 */
export interface RadioEngine {
  tune(request: RadioTuneRequest): void
  restore(request: RadioRestoreRequest): void
}

type QueuedCall =
  | { kind: 'tune'; request: RadioTuneRequest }
  | { kind: 'restore'; request: RadioRestoreRequest }

let attachedEngine: RadioEngine | null = null
let queuedCalls: QueuedCall[] = []

/**
 * Connects the SDR engine to the capability. Returns a function that detaches
 * it (on the panel's unmount); calls after that are queued again until the
 * next attach.
 */
export function attachRadioEngine(engine: RadioEngine): () => void {
  attachedEngine = engine
  const pending = queuedCalls
  queuedCalls = []
  for (const call of pending) {
    if (call.kind === 'tune') engine.tune(call.request)
    else engine.restore(call.request)
  }
  return () => {
    if (attachedEngine === engine) attachedEngine = null
  }
}

/** Test seam: forget the attached engine and any queued calls. */
export function resetRadioEngineForTests(): void {
  attachedEngine = null
  queuedCalls = []
}

function isSdrMode(mode: string): mode is SdrMode {
  return (MODES as readonly string[]).includes(mode)
}

/** Builds the capability. Store access is deferred to each call, since this runs before Pinia is installed. */
export function createSdrRadioCapability(): RadioCapability {
  return {
    get connected() {
      return useSdrStore().connected
    },
    tune(request) {
      if (attachedEngine) attachedEngine.tune(request)
      else queuedCalls.push({ kind: 'tune', request })
    },
    restore(request) {
      if (attachedEngine) attachedEngine.restore(request)
      else queuedCalls.push({ kind: 'restore', request })
    },
    frequencies: {
      ensureLoaded() {
        const store = useSdrStore()
        if (store.frequencies.length === 0) void store.loadFrequencies()
      },
      has(frequencyHz) {
        return useSdrStore().hasStoredFrequency(frequencyHz)
      },
      async save(frequency) {
        // The shell types `mode` as a plain string so it needn't know the
        // SDR's modes; anything the Frequency Manager can't store is refused
        // here, as the backend would refuse it.
        const { mode } = frequency
        if (!isSdrMode(mode)) throw new Error(`Unsupported SDR mode "${mode}"`)
        await useSdrStore().saveFrequency({ ...frequency, mode })
      },
      remove(frequencyHz) {
        return useSdrStore().removeStoredFrequency(frequencyHz)
      },
      ensureGroup(name) {
        return useSdrStore().ensureFrequencyGroup(name)
      },
    },
    // Land's APRS and Sea's AIS decoders (F10). The SDR store stays the one
    // record of which radio each holds — the SDR panel locks those radios out
    // with it — so the sections reach it through here instead of importing it.
    decoders: {
      activeRadioId(kind) {
        const store = useSdrStore()
        return kind === 'aprs' ? store.aprsRadioId : store.aisRadioId
      },
      refresh(kind) {
        const store = useSdrStore()
        return kind === 'aprs' ? store.hydrateAprsFromDb() : store.hydrateAisFromDb()
      },
      async start(kind, radioId) {
        const store = useSdrStore()
        if (kind === 'ais') return store.startAis(radioId)
        const started = await store.startAprs(radioId)
        // The SDR panel's APRS button reads this flag; only a running decoder sets it.
        if (started) store.setAprsEnabled(true)
        return started
      },
      async stop(kind, radioId) {
        const store = useSdrStore()
        if (kind === 'ais') return store.stopAis(radioId)
        const stopped = await store.stopAprs(radioId)
        // Cleared even when the stop was refused: the operator asked for it off.
        store.setAprsEnabled(false)
        return stopped
      },
    },
    async listRadios() {
      const records = await listRadios()
      return records.map((record) => ({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
        available: record.device_available !== false,
      }))
    },
  }
}
