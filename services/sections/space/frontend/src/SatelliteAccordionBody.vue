<template>
  <SatTelemetryGrids :telemetry="telemetry" />
  <SatRadioInfoSection :radio="satellite" />
  <SatelliteActionRow
    :following="following"
    :notifying="notifying"
    :has-downlink="!!satellite.downlink_hz"
    :auto-tune-armed="autoTuneArmed"
    :record-armed="recordArmed"
    :conflict-text="conflictText"
    @track="emit('track')"
    @toggle-pass-notif="emit('toggle-pass-notif')"
    @toggle-auto-tune="emit('toggle-auto-tune')"
    @toggle-record="emit('toggle-record')"
  />
  <SatPolarPassSection
    :passes="passes"
    :now="now"
    :is-pass-active="isPassActive"
    :live-az-el="liveAzEl"
    :loading="loading"
  />
  <UpcomingPassesSection :passes="passes" :loading="loading" :status="status" :now="now" />
</template>

<script setup lang="ts">
/**
 * The content of an expanded satellite accordion, shared by the satellite list
 * (SpaceFilter) and the PASSES pane (SpacePasses): live position and orbit,
 * radio details, the track / alert / auto-tune / record actions, the polar plot
 * and the upcoming passes. Presentational — the pane owns the state and
 * handles the action events.
 */
import SatTelemetryGrids from './SatTelemetryGrids.vue'
import SatRadioInfoSection from './SatRadioInfoSection.vue'
import SatelliteActionRow from './SatelliteActionRow.vue'
import SatPolarPassSection from './SatPolarPassSection.vue'
import UpcomingPassesSection from './UpcomingPassesSection.vue'
import type { SatRadioInfo } from './satRadioInfo'
import type { SatelliteTelemetry } from './composables/useLiveSatelliteTelemetry'
import type { AccPass, SkyPoint } from './spacePassesUtils'

defineProps<{
  /** The expanded satellite's radio fields (a list entry or a pass both fit). */
  satellite: SatRadioInfo
  /** Live position fields from `useLiveSatelliteTelemetry`. */
  telemetry: SatelliteTelemetry
  /** Live look-angles for the polar plot's marker. */
  liveAzEl: SkyPoint | null
  /** The satellite's passes in the next 24 hours, soonest first. */
  passes: AccPass[]
  /** True while the passes are being computed. */
  loading: boolean
  /** Status line beside the UPCOMING PASSES title. */
  status: string
  /** Current time (ms), ticked by the pane. */
  now: number
  /** Whether a pass is in progress (see SatPolarPassSection). */
  isPassActive: (pass: AccPass) => boolean
  /** The map camera is following this satellite. */
  following: boolean
  /** Pass alerts are on for this satellite. */
  notifying: boolean
  autoTuneArmed: boolean
  recordArmed: boolean
  /** Overlap warning for an armed auto-tune; empty when there is none. */
  conflictText: string
}>()

const emit = defineEmits<{
  track: []
  'toggle-pass-notif': []
  'toggle-auto-tune': []
  'toggle-record': []
}>()
</script>
