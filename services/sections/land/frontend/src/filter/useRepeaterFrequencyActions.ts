import { onMounted, ref, type Ref } from 'vue'
import { useRadio } from '@sentinel/shell-api/shell/useRadio'
import type { RadioFrequencies } from '@sentinel/shell-api/shell/radioCapability'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import {
  formatRepeaterAccess,
  formatRepeaterModes,
  formatMhz,
  channelHasDigitalDecode,
  REPEATER_FREQUENCY_GROUP_NAME,
  REPEATER_SDR_MODE,
  REPEATER_SOURCE_NAME,
  repeaterMhzToHz,
  repeaterSearchKey,
} from '../constants/repeaters'
import type { RepeaterChannel, RepeaterStation } from '../types/repeaters'
import type { RepeaterFrequencySide } from '../LandRepeaterDetails.vue'
import { REPEATER_LOCATE_EVENT } from '../controls/repeaters/RepeatersControl'

/** What `useRepeaterFrequencyActions` hands the FILTER pane. */
export interface RepeaterFrequencyActions {
  /** Whether an SDR is connected, so the tune buttons can say so. */
  radioConnected: Readonly<Ref<boolean>>
  /** The row key of the repeater showing the "connect an SDR" hint, or null. */
  tuneNotice: Ref<string | null>
  /** Whether a frequency (in MHz) is already in the SDR Frequency Manager. */
  isFrequencySaved: (mhz: number) => boolean
  /** Tunes the SDR to a repeater's output or input. */
  tuneRepeater: (
    station: RepeaterStation,
    channel: RepeaterChannel,
    side: RepeaterFrequencySide,
  ) => void
  /** Adds a repeater's output or input to the SDR Frequency Manager. */
  saveRepeaterFrequency: (
    station: RepeaterStation,
    channel: RepeaterChannel,
    side: RepeaterFrequencySide,
  ) => Promise<void>
  /** Takes a repeater's output or input back out of the SDR Frequency Manager. */
  removeRepeaterFrequency: (
    station: RepeaterStation,
    channel: RepeaterChannel,
    side: RepeaterFrequencySide,
  ) => Promise<void>
  /** Flies the map to a repeater's site (LAT/LONG clicked in an expanded row). */
  locateRepeater: (callsign: string) => void
}

function channelSideMhz(channel: RepeaterChannel, side: RepeaterFrequencySide): number {
  return side === 'output' ? channel.txMhz : channel.rxMhz
}

/** The Frequency Manager label for one side of a channel, e.g. `GB3XX 2M OUT`. */
function frequencyLabel(
  station: RepeaterStation,
  channel: RepeaterChannel,
  side: RepeaterFrequencySide,
): string {
  return `${station.callsign} ${channel.band} ${side === 'output' ? 'OUT' : 'IN'}`
}

/**
 * What an expanded repeater row does with the SDR — tune to a channel, save it
 * to or remove it from the Frequency Manager — plus the locate-on-map link.
 * Each outcome is reported as a system notification, the way the Sea pane's
 * port channels report theirs.
 */
export function useRepeaterFrequencyActions(): RepeaterFrequencyActions {
  const { radio, connected: radioConnected } = useRadio()
  const notificationsStore = useNotificationsStore()

  const tuneNotice = ref<string | null>(null)

  // The bookmark's filled state reads the Frequency Manager list, which only
  // the SDR panel loads otherwise — fetch it once so the pane is right from
  // the first open.
  onMounted(() => {
    radio.value?.frequencies.ensureLoaded()
  })

  /**
   * The SDR's Frequency Manager, or a throw — inside the save/remove `try`
   * blocks, so a missing SDR section reads as the same "could not save" notice
   * as an unreachable backend.
   */
  function requireRadioFrequencies(): RadioFrequencies {
    const frequencies = radio.value?.frequencies
    if (!frequencies) throw new Error('No SDR section provides the radio capability')
    return frequencies
  }

  function isFrequencySaved(mhz: number): boolean {
    return radio.value?.frequencies.has(repeaterMhzToHz(mhz)) ?? false
  }

  function tuneRepeater(
    station: RepeaterStation,
    channel: RepeaterChannel,
    side: RepeaterFrequencySide,
  ): void {
    const rowKey = repeaterSearchKey(station.callsign)
    if (!radio.value || !radioConnected.value) {
      tuneNotice.value = rowKey
      return
    }
    tuneNotice.value = null
    const mhz = channelSideMhz(channel, side)
    // A DMR / D-STAR / Fusion / P25 / NXDN channel also switches the SDR's
    // digital decoder on; an FM-only one switches it off so audio isn't muted.
    const digital = channelHasDigitalDecode(channel)
    radio.value.tune({
      hz: repeaterMhzToHz(mhz),
      mode: REPEATER_SDR_MODE,
      satName: `${station.callsign} ${channel.band} ${side}`,
      digital,
    })
    notificationsStore.add({
      type: 'system',
      title: `${station.callsign} ${channel.band} ${side.toUpperCase()}`,
      detail: `Tuned ${formatMhz(mhz)} ${REPEATER_SDR_MODE}${digital ? ' · digital decode on' : ''}`,
    })
  }

  function locateRepeater(callsign: string): void {
    document.dispatchEvent(new CustomEvent(REPEATER_LOCATE_EVENT, { detail: { callsign } }))
  }

  async function saveRepeaterFrequency(
    station: RepeaterStation,
    channel: RepeaterChannel,
    side: RepeaterFrequencySide,
  ): Promise<void> {
    const mhz = channelSideMhz(channel, side)
    const label = frequencyLabel(station, channel, side)
    const notes = [
      station.location,
      formatRepeaterModes(channel.modes),
      formatRepeaterAccess(channel) === '—' ? null : `Access ${formatRepeaterAccess(channel)}`,
      REPEATER_SOURCE_NAME,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
    try {
      // Filed under a REPEATERS group so they stay together in the manager —
      // created on first use if the operator has not made one.
      const frequencies = requireRadioFrequencies()
      const groupId = await frequencies.ensureGroup(REPEATER_FREQUENCY_GROUP_NAME)
      await frequencies.save({
        label,
        frequency_hz: repeaterMhzToHz(mhz),
        mode: REPEATER_SDR_MODE,
        notes,
        group_ids: [groupId],
      })
      notificationsStore.add({
        type: 'system',
        title: label,
        detail: `Saved ${formatMhz(mhz)} ${REPEATER_SDR_MODE} to the frequency manager`,
      })
    } catch {
      notificationsStore.add({
        type: 'system',
        title: label,
        detail: 'Could not save the frequency — is the backend reachable?',
      })
    }
  }

  async function removeRepeaterFrequency(
    station: RepeaterStation,
    channel: RepeaterChannel,
    side: RepeaterFrequencySide,
  ): Promise<void> {
    const mhz = channelSideMhz(channel, side)
    const label = frequencyLabel(station, channel, side)
    try {
      await requireRadioFrequencies().remove(repeaterMhzToHz(mhz))
      notificationsStore.add({
        type: 'system',
        title: label,
        detail: `Removed ${formatMhz(mhz)} from the frequency manager`,
      })
    } catch {
      notificationsStore.add({
        type: 'system',
        title: label,
        detail: 'Could not remove the frequency — is the backend reachable?',
      })
    }
  }

  return {
    radioConnected,
    tuneNotice,
    isFrequencySaved,
    tuneRepeater,
    saveRepeaterFrequency,
    removeRepeaterFrequency,
    locateRepeater,
  }
}
