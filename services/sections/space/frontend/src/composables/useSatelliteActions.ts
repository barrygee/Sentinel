import { ref, type Ref } from 'vue'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import { useDocumentEvent } from '@sentinel/ui/composables/useDocumentEvent'
import type { SatelliteControl } from '../controls/satellite/SatelliteControl'
import {
  isPassNotifEnabled,
  isAutoTuneEnabled,
  setAutoTuneEnabled,
  isRecordOnPassEnabled,
  setRecordOnPassEnabled,
} from '../controls/satellite/passNotifStore'

/** The fields of a satellite (or one of its passes) the action row acts on. */
export interface SatelliteActionTarget {
  norad_id: string
  name: string
  downlink_hz?: number | null
  downlink_mode?: string | null
}

/** Options for {@link useSatelliteActions}. */
export interface SatelliteActionsOptions {
  /** Read on every action, so a control that arrives after mount is still used. */
  getSatelliteControl: () => SatelliteControl | null
  /** Called after this pane arms or disarms auto-tune for a satellite. */
  onAutoTuneToggled?: (noradId: string) => void
}

/** What {@link useSatelliteActions} gives a pane. */
export interface SatelliteActions {
  /** The satellite the map camera is following, or null. */
  followedNoradId: Ref<string | null>
  /** The satellite whose pass alerts this pane last saw switched on, or null. */
  notifNoradId: Ref<string | null>
  /**
   * Bumped whenever auto-tune arming changes, here or elsewhere. Arming lives in
   * passNotifStore, which is not reactive, so a computed that reads arming must
   * also read this to re-evaluate.
   */
  armedTick: Ref<number>
  isArmed: (noradId: string) => boolean
  isRecordArmed: (noradId: string) => boolean
  /** Re-reads whether pass alerts are on for a satellite that has just been opened. */
  syncPassNotifState: (noradId: string) => void
  trackSat: (satellite: SatelliteActionTarget) => void
  togglePassNotif: (satellite: SatelliteActionTarget) => void
  toggleAutoTune: (satellite: SatelliteActionTarget) => void
  toggleRecord: (satellite: SatelliteActionTarget) => void
}

// Persistent "armed" alert-card wording. One card per satellite represents the
// auto-tune arming; record folds into its detail rather than adding a 2nd card.
const ARMED_DETAIL_AUTOTUNE = 'Auto-tune on pass enabled'
const ARMED_DETAIL_RECORD = 'Auto-tune and record on pass enabled'

function isArmedCardDetail(detail: string): boolean {
  return detail === ARMED_DETAIL_AUTOTUNE || detail === ARMED_DETAIL_RECORD
}

/**
 * The track / pass-alert / auto-tune / record actions an expanded satellite
 * offers, shared by the FILTER and PASSES panes. Owns the state those buttons
 * show and keeps it in step with the document events other components raise.
 */
export function useSatelliteActions(options: SatelliteActionsOptions): SatelliteActions {
  const initialControl = options.getSatelliteControl()
  const followedNoradId = ref<string | null>(initialControl?.followedNoradId ?? null)
  const notifNoradId = ref<string | null>(
    initialControl?.passNotificationsEnabled ? initialControl.activeNoradId : null,
  )
  const armedTick = ref(0)
  const notificationsStore = useNotificationsStore()

  function isArmed(noradId: string): boolean {
    void armedTick.value
    return isAutoTuneEnabled(noradId)
  }

  function isRecordArmed(noradId: string): boolean {
    void armedTick.value
    return isRecordOnPassEnabled(noradId)
  }

  function syncPassNotifState(noradId: string): void {
    notifNoradId.value = isPassNotifEnabled(noradId) ? noradId : null
  }

  function trackSat(satellite: SatelliteActionTarget): void {
    const satelliteControl = options.getSatelliteControl()
    if (followedNoradId.value === satellite.norad_id) {
      satelliteControl?.stopFollowing()
    } else {
      satelliteControl?.switchSatellite(
        satellite.norad_id,
        satellite.name || satellite.norad_id,
        true,
      )
    }
  }

  function togglePassNotif(satellite: SatelliteActionTarget): void {
    const satelliteControl = options.getSatelliteControl()
    if (!satelliteControl) return
    // Pass alerts belong to the map's active satellite, so select this one first.
    if (satelliteControl.activeNoradId !== satellite.norad_id) {
      satelliteControl.switchSatellite(satellite.norad_id, satellite.name || satellite.norad_id)
    }
    satelliteControl.togglePassNotifications()
  }

  function toggleAutoTune(satellite: SatelliteActionTarget): void {
    /* v8 ignore start -- defensive: the auto-tune button only renders for a satellite with a
       downlink frequency, so this handler never runs without one. */
    if (!satellite.downlink_hz) return
    /* v8 ignore stop */
    const noradId = satellite.norad_id
    const name = satellite.name || noradId
    const enabled = !isAutoTuneEnabled(noradId)
    setAutoTuneEnabled(noradId, enabled, {
      name,
      downlinkHz: satellite.downlink_hz,
      downlinkMode: satellite.downlink_mode ?? undefined,
    })
    armedTick.value++
    options.onAutoTuneToggled?.(noradId)
    document.dispatchEvent(
      new CustomEvent('satellite-auto-tune-changed', { detail: { noradId, enabled } }),
    )
    if (enabled) {
      notificationsStore.add({
        type: 'autotune',
        title: name,
        detail: ARMED_DETAIL_AUTOTUNE,
        noradId,
        satName: name,
      })
    } else {
      // Remove the persistent armed card so the alerts list stays in sync. Record
      // folds its state into this one card's detail (see toggleRecord), so match
      // either wording. The live pass/tune trace alerts share the noradId but have
      // a different detail, so they're left untouched.
      notificationsStore.items
        .filter(
          (item) =>
            item.type === 'autotune' && item.noradId === noradId && isArmedCardDetail(item.detail),
        )
        .forEach((item) => notificationsStore.dismiss(item.id))
    }
  }

  function toggleRecord(satellite: SatelliteActionTarget): void {
    /* v8 ignore start -- defensive: the record button only renders for a downlink-bearing
       satellite and is disabled until auto-tune is armed; jsdom also suppresses clicks on
       the disabled state. */
    if (!satellite.downlink_hz) return
    const noradId = satellite.norad_id
    // Record needs a live tune — only togglable while auto-tune is armed.
    if (!isAutoTuneEnabled(noradId)) return
    /* v8 ignore stop */
    const name = satellite.name || noradId
    const enabled = !isRecordOnPassEnabled(noradId)
    setRecordOnPassEnabled(noradId, enabled, { name })
    armedTick.value++
    // Notify the alerts service so enabling record mid-pass starts recording the
    // overhead pass now, rather than only taking effect on the next pass.
    document.dispatchEvent(
      new CustomEvent('satellite-record-on-pass-changed', { detail: { noradId, enabled } }),
    )
    // Don't add a second card for record — fold its state into the existing
    // auto-tune armed card by retitling its detail. If for some reason that card
    // is gone (e.g. dismissed), add a fresh one with the combined wording.
    const detail = enabled ? ARMED_DETAIL_RECORD : ARMED_DETAIL_AUTOTUNE
    const existing = notificationsStore.items.find(
      (item) =>
        item.type === 'autotune' && item.noradId === noradId && isArmedCardDetail(item.detail),
    )
    if (existing) {
      notificationsStore.update({ id: existing.id, detail })
    } else {
      notificationsStore.add({ type: 'autotune', title: name, detail, noradId, satName: name })
    }
  }

  useDocumentEvent('satellite-follow-changed', (event: Event) => {
    const { noradId, following } = (event as CustomEvent<{ noradId: string; following: boolean }>)
      .detail
    followedNoradId.value = following ? noradId : null
  })
  useDocumentEvent('satellite-pass-notif-changed', (event: Event) => {
    const { noradId, enabled } = (event as CustomEvent<{ noradId: string; enabled: boolean }>)
      .detail
    // Switching another satellite off must not clear this pane's highlight.
    if (enabled) notifNoradId.value = noradId
    else if (notifNoradId.value === noradId) notifNoradId.value = null
  })
  useDocumentEvent('satellite-auto-tune-changed', () => {
    // Another component may have toggled arming; re-read it from the store.
    armedTick.value++
  })

  return {
    followedNoradId,
    notifNoradId,
    armedTick,
    isArmed,
    isRecordArmed,
    syncPassNotifState,
    trackSat,
    togglePassNotif,
    toggleAutoTune,
    toggleRecord,
  }
}
