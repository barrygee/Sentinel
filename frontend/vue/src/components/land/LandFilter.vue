<template>
  <BaseFilterPanel
    :items="items"
    :query="landStore.searchQuery"
    :expanded-key="landStore.searchExpandedCallsign"
    id-prefix="land-filter"
    :input-label="inputLabel"
    :placeholder="placeholder"
    :listbox-label="listboxLabel"
    :empty-message="emptyMessage"
    groups-collapsed-by-default
    @update:query="landStore.setSearchQuery"
    @update:expanded-key="landStore.setSearchExpandedCallsign"
  >
    <!-- Band, mode and status chips narrow the REPEATERS list and the map
         together, folded under the search box. -->
    <template v-if="repeatersOn" #below-input>
      <LandRepeaterFilters />
    </template>
    <template #accordion="{ item }">
      <div class="land-filter-accordion">
        <LandCameraDetails
          v-if="cameraFor(item.key)"
          :camera="cameraFor(item.key)!"
          :refresh-seconds="refreshSecondsFor(cameraFor(item.key)!.properties.sourceId)"
          @preview="previewCamera"
        />
        <LandRepeaterDetails
          v-else-if="repeaterFor(item.key)"
          :station="repeaterFor(item.key)!"
          :sdr-connected="sdrStore.connected"
          :is-saved="isFrequencySaved"
          :tune-notice="tuneNotice === item.key"
          @locate="locateRepeater"
          @tune="(channel, side) => tuneRepeater(repeaterFor(item.key)!, channel, side)"
          @save="(channel, side) => saveRepeaterFrequency(repeaterFor(item.key)!, channel, side)"
          @unsave="
            (channel, side) => removeRepeaterFrequency(repeaterFor(item.key)!, channel, side)
          "
        />
        <template v-else-if="stationFor(item.key)">
          <BaseDataGrid title="STATION" :columns="3">
            <BaseDataCell label="CALLSIGN" :value="stationFor(item.key)!.callsign" />
            <BaseDataCell label="SYMBOL">
              <!-- The icon itself, not its name: the same glyph the map draws,
                   so the panel and the map agree at a glance. It carries the
                   type as its accessible name, so nothing is lost by dropping
                   the text. -->
              <SdrAprsSymbol :symbol="stationFor(item.key)!.symbol" />
            </BaseDataCell>
            <BaseDataCell
              label="TIME"
              :value="formatHeardTime(stationFor(item.key)!.last_heard_ms)"
            />
          </BaseDataGrid>
          <BaseDataGrid title="POSITION" :columns="3">
            <BaseDataCell label="LATITUDE" :value="stationFor(item.key)!.latitude.toFixed(5)" />
            <BaseDataCell label="LONGITUDE" :value="stationFor(item.key)!.longitude.toFixed(5)" />
            <BaseDataCell
              label="ALTITUDE"
              :value="formatAltitude(stationFor(item.key)!.altitude) ?? '—'"
            />
          </BaseDataGrid>
          <BaseDataGrid title="MOVEMENT" :columns="2">
            <BaseDataCell
              label="COURSE"
              :value="formatCourse(stationFor(item.key)!.course) ?? '—'"
            />
            <BaseDataCell label="SPEED" :value="formatSpeed(stationFor(item.key)!.speed) ?? '—'" />
          </BaseDataGrid>
          <!-- Free text, not telemetry: sized and weighted like the Space
               pane's NOTES list so prose reads as prose across both panels. -->
          <div class="land-filter-packet">
            <BaseDataGrid title="PACKET" :columns="2" collapse-on-narrow>
              <BaseDataCell label="PATH" :value="stationFor(item.key)!.path ?? '—'" wide />
              <BaseDataCell label="COMMENT" :value="stationFor(item.key)!.comment ?? '—'" wide />
            </BaseDataGrid>
            <!-- The raw frame runs to several wrapped lines and is reference
                 material, not something to read at a glance, so it collapses. -->
            <div class="land-filter-raw">
              <button
                type="button"
                class="land-filter-raw-toggle"
                :aria-expanded="rawExpanded"
                :aria-controls="rawBodyId"
                @click.stop="rawExpanded = !rawExpanded"
              >
                <span class="land-filter-raw-label">RAW</span>
                <!-- Rotated by CSS, like the row chevron above, rather than by
                     the icon's own `open` prop: that flips down to up, where a
                     disclosure in this panel points right when closed and down
                     when open. -->
                <span class="land-filter-raw-chevron" :class="{ open: rawExpanded }">
                  <ChevronIcon />
                </span>
              </button>
              <div v-if="rawExpanded" :id="rawBodyId" class="land-filter-raw-body">
                {{ stationFor(item.key)!.raw ?? '—' }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </BaseFilterPanel>
</template>

<script setup lang="ts">
/**
 * Land FILTER pane — one searchable list per data layer the map is drawing,
 * each under its own heading. The sidebar's sub-tabs beneath FILTER switch
 * the layers on and off (several at once), and the pane lists exactly what
 * is on:
 *
 * - APRS STATIONS — every station currently heard, showing every field the
 *   beacon carried rather than only those enabled for map labels.
 * - one heading per traffic-camera source (TfL JamCams, Durham CC, …) — the
 *   cameras in the map's viewport, with the in-view count and licence line,
 *   expanding to `LandCameraDetails` (the live still).
 * - REPEATERS — every filtered UK repeater (ukrepeater.net) in the viewport,
 *   expanding to `LandRepeaterDetails`, with BAND/MODE/STATUS chips above the
 *   search box that narrow the map and the list together.
 *
 * Each list tracks the map exactly: it renders the same snapshot the map
 * plots, so a station that ages out, a camera whose feed is disabled or a
 * repeater filtered away leaves both at the same moment. Clicking a marker on
 * the map expands its row here — the pane holds all the detail; nothing
 * opens on the map itself.
 */
import { computed, onMounted, ref, watch } from 'vue'
import BaseFilterPanel, {
  type FilterPanelItem,
} from '@/components/shared/filter/BaseFilterPanel.vue'
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import SdrAprsSymbol from '@/components/sdr/SdrAprsSymbol.vue'
import LandCameraDetails from '@/components/land/LandCameraDetails.vue'
import LandRepeaterFilters from '@/components/land/LandRepeaterFilters.vue'
import LandRepeaterDetails from '@/components/land/LandRepeaterDetails.vue'
import { useRepeatersStore } from '@/stores/repeaters'
import {
  formatRepeaterAccess,
  formatRepeaterModes,
  formatMhz,
  channelHasDigitalDecode,
  REPEATER_FREQUENCY_GROUP_NAME,
  REPEATER_SDR_MODE,
  REPEATER_SOURCE_NAME,
  repeaterMhzToHz,
  repeaterCallsignFromSearchKey,
  repeaterSearchKey,
  stationBands,
  stationModes,
  stationOffAir,
} from '@/constants/repeaters'
import type { RepeaterStation } from '@/types/repeaters'
import { useLandStore, type AprsStation } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
import { useSdrStore } from '@/stores/sdr'
import { useNotificationsStore } from '@/stores/notifications'
import type { RepeaterFrequencySide } from '@/components/land/LandRepeaterDetails.vue'
import { REPEATER_LOCATE_EVENT } from '@/components/land/controls/repeaters/RepeatersControl'
import { CAMERA_PREVIEW_EVENT } from '@/components/land/controls/traffic-cameras/TrafficCamerasControl'
import type { RepeaterChannel } from '@/types/repeaters'
import { useVisibleCameras } from '@/composables/useVisibleCameras'
import type { CameraFeature } from '@/types/landFeeds'
import { aprsSymbolIcon } from '@/utils/aprsSymbols'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import {
  formatAltitude,
  formatCourse,
  formatHeardTime,
  formatSpeed,
} from './controls/aprs/AprsStationsControl'

const landStore = useLandStore()
const landFeedsStore = useLandFeedsStore()
const repeatersStore = useRepeatersStore()
const sdrStore = useSdrStore()
const notificationsStore = useNotificationsStore()
const { sources: cameraSources, cameraById } = useVisibleCameras()

/** Whether cameras take part in this pane at all (layer on + a source enabled). */
const camerasOn = computed(
  () => landStore.trafficCamerasLayerVisible && cameraSources.value.length > 0,
)

/** Whether repeaters take part in this pane (layer on + directory loaded). */
const repeatersOn = computed(
  () => landStore.repeatersLayerVisible && repeatersStore.stations.length > 0,
)

/** The search box describes whichever sets are currently listed. */
const listedSets = computed<string[]>(() => {
  const sets: string[] = []
  if (landStore.aprsLayerVisible) sets.push('APRS stations')
  if (camerasOn.value) sets.push('traffic cameras')
  if (repeatersOn.value) sets.push('repeaters')
  return sets
})
const listboxLabel = computed(() => joinSets(listedSets.value) || 'Land map items')
const inputLabel = computed(() => {
  if (listedSets.value.length === 0) return 'Filter Land map items by name or callsign'
  if (listedSets.value.length === 1 && landStore.aprsLayerVisible) {
    return 'Filter APRS stations by callsign, symbol, path or comment'
  }
  return `Filter ${joinSets(listedSets.value)} by name or callsign`
})
const placeholder = computed(() => {
  const parts = ['CALLSIGN']
  if (camerasOn.value) parts.push('CAMERA', 'ROAD')
  if (repeatersOn.value) parts.push('TOWN', 'BAND', 'MODE')
  if (!camerasOn.value && !repeatersOn.value) parts.push('SYMBOL', 'PATH', 'COMMENT')
  return parts.join(' · ')
})

function joinSets(sets: string[]): string {
  if (sets.length <= 1) return sets.join('')
  return `${sets.slice(0, -1).join(', ')} and ${sets[sets.length - 1]}`
}

// Whether the expanded station's raw frame is showing. Only one station is open
// at a time, so one flag covers the pane; it closes again whenever a different
// station is opened, so a frame never appears already-expanded.
const rawExpanded = ref(false)
const rawBodyId = 'land-filter-raw-body'
watch(
  () => landStore.searchExpandedCallsign,
  () => {
    rawExpanded.value = false
  },
)

function symbolLabel(station: AprsStation): string {
  return aprsSymbolIcon(station.symbol).label
}

/** Stations matching the search text, over callsign, symbol type, path and
 *  comment — the fields an operator would recognise a station by. */
const matchingStations = computed<AprsStation[]>(() => {
  // The list shows exactly what the map plots: hiding the APRS layer empties
  // both, rather than leaving the panel listing stations that aren't there.
  if (!landStore.aprsLayerVisible) return []
  const needle = landStore.searchQuery.trim().toLowerCase()
  if (!needle) return landStore.aprsStations
  return landStore.aprsStations.filter((station) =>
    [station.callsign, symbolLabel(station), station.path ?? '', station.comment ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle),
  )
})

/** Element-id-safe token for a camera key ("durham-cc:dutmc_24" has a colon). */
function cameraIdToken(featureId: string): string {
  return `cam-${featureId.replace(/[^A-Za-z0-9_-]/g, '-')}`
}

function cameraMatches(camera: CameraFeature, needle: string): boolean {
  const { name, view, sourceName, description } = camera.properties
  return [name, view ?? '', sourceName, description].join(' ').toLowerCase().includes(needle)
}

/** One grouped row per in-view camera, per source. */
const cameraItems = computed<FilterPanelItem[]>(() => {
  if (!camerasOn.value) return []
  const needle = landStore.searchQuery.trim().toLowerCase()
  return cameraSources.value.flatMap((source) => {
    const matching = needle
      ? source.visible.filter((camera) => cameraMatches(camera, needle))
      : source.visible
    return matching.map((camera) => ({
      key: camera.properties.id,
      idKey: cameraIdToken(camera.properties.id),
      primary: camera.properties.name,
      secondary: [camera.properties.view, camera.properties.state.toUpperCase()]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      optionLabel: `Traffic camera ${camera.properties.name}, ${source.feed.name}, ${camera.properties.state}`,
      // Heading only: the count and the licence line are left off so each
      // source folds into one clean row.
      groupLabel: source.feed.name,
    }))
  })
})

/** Callsign, town, bands and modes — what an operator would search a repeater by. */
function repeaterMatches(station: RepeaterStation, needle: string): boolean {
  return [
    station.callsign,
    station.location ?? '',
    station.locator ?? '',
    stationBands(station).join(' '),
    formatRepeaterModes(stationModes(station)),
  ]
    .join(' ')
    .toLowerCase()
    .includes(needle)
}

/** One row per in-view repeater — a flat list, since the map draws one layer at a time. */
const repeaterItems = computed<FilterPanelItem[]>(() => {
  if (!repeatersOn.value) return []
  const needle = landStore.searchQuery.trim().toLowerCase()
  const visible = repeatersStore.visibleStations
  const matching = needle ? visible.filter((station) => repeaterMatches(station, needle)) : visible
  return matching.map((station) => {
    const bands = stationBands(station).join(' · ')
    const modes = formatRepeaterModes(stationModes(station))
    const offAir = stationOffAir(station)
    return {
      key: repeaterSearchKey(station.callsign),
      idKey: `rpt-${station.callsign}`,
      primary: station.callsign,
      secondary: [station.location, bands, modes, offAir ? 'OFF AIR' : null]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      optionLabel: `Repeater ${station.callsign}, ${station.location ?? 'location withheld'}, ${bands}, ${modes}${offAir ? ', not operational' : ''}`,
    }
  })
})

const items = computed<FilterPanelItem[]>(() => {
  const grouped = camerasOn.value || repeatersOn.value
  const stationItems: FilterPanelItem[] = matchingStations.value.map((station) => ({
    key: station.callsign,
    primary: station.callsign,
    secondary: `${symbolLabel(station)} · ${formatHeardTime(station.last_heard_ms)}`,
    optionLabel: `${station.callsign}, ${symbolLabel(station)}, heard ${formatHeardTime(station.last_heard_ms)}`,
    // Stations only get a heading once another set shares the list; alone
    // they read as they always have.
    groupLabel: grouped ? 'APRS STATIONS' : undefined,
  }))
  return [...stationItems, ...cameraItems.value, ...repeaterItems.value]
})

const emptyMessage = computed(() => {
  if (listedSets.value.length === 0) return 'No layers on — use the tabs to add one'
  if (camerasOn.value || repeatersOn.value) {
    const anyCameraVisible = cameraSources.value.some((source) => source.visible.length > 0)
    const anyRepeaterVisible = repeatersStore.visibleStations.length > 0
    if (!landStore.aprsLayerVisible && !anyCameraVisible && !anyRepeaterVisible) {
      return `Nothing in view — ${joinSets(listedSets.value)}`
    }
    return 'Nothing matches'
  }
  return landStore.aprsStations.length === 0 ? 'No APRS stations heard' : 'No stations match'
})

/** Camera keys are "feedId:ref"; APRS callsigns never carry a colon, and
 *  repeater keys carry their own prefix (checked first). */
function isCameraKey(key: string): boolean {
  return repeaterCallsignFromSearchKey(key) === null && key.includes(':')
}

function repeaterFor(key: string): RepeaterStation | undefined {
  const callsign = repeaterCallsignFromSearchKey(key)
  return callsign === null ? undefined : repeatersStore.stationByCallsign(callsign)
}

function cameraFor(key: string): CameraFeature | undefined {
  return isCameraKey(key) ? cameraById(key) : undefined
}

/** The camera's feed cadence — undefined lets `LandCameraDetails` apply its default. */
function refreshSecondsFor(feedId: string): number | undefined {
  return landFeedsStore.feeds.find((feed) => feed.id === feedId)?.refreshSeconds
}

function stationFor(callsign: string): AprsStation | undefined {
  return landStore.aprsStations.find((station) => station.callsign === callsign)
}

// ── tuning / saving a repeater frequency ───────────────────────────────────
// Which repeater row is showing the "connect an SDR" hint (by row key).
const tuneNotice = ref<string | null>(null)

// The bookmark's filled state reads the Frequency Manager list, which only
// the SDR panel loads otherwise — fetch it once so the pane is right from
// the first open.
onMounted(() => {
  if (sdrStore.frequencies.length === 0) void sdrStore.loadFrequencies()
})

function isFrequencySaved(mhz: number): boolean {
  return sdrStore.hasStoredFrequency(repeaterMhzToHz(mhz))
}

function channelSideMhz(channel: RepeaterChannel, side: RepeaterFrequencySide): number {
  return side === 'output' ? channel.txMhz : channel.rxMhz
}

/** Tune the SDR to a repeater's output or input, the way the Sea pane tunes a port channel. */
function tuneRepeater(
  station: RepeaterStation,
  channel: RepeaterChannel,
  side: RepeaterFrequencySide,
): void {
  const rowKey = repeaterSearchKey(station.callsign)
  if (!sdrStore.connected) {
    tuneNotice.value = rowKey
    return
  }
  tuneNotice.value = null
  const mhz = channelSideMhz(channel, side)
  // A DMR / D-STAR / Fusion / P25 / NXDN channel also switches the SDR's
  // digital decoder on; an FM-only one switches it off so audio isn't muted.
  const digital = channelHasDigitalDecode(channel)
  document.dispatchEvent(
    new CustomEvent('sentinel:sdr-tune-external', {
      detail: {
        hz: repeaterMhzToHz(mhz),
        mode: REPEATER_SDR_MODE,
        satName: `${station.callsign} ${channel.band} ${side}`,
        digital,
      },
    }),
  )
  notificationsStore.add({
    type: 'system',
    title: `${station.callsign} ${channel.band} ${side.toUpperCase()}`,
    detail: `Tuned ${formatMhz(mhz)} ${REPEATER_SDR_MODE}${digital ? ' · digital decode on' : ''}`,
  })
}

/** A row's preview still clicked — fly the map to the camera and open its popup. */
function previewCamera(featureId: string): void {
  document.dispatchEvent(new CustomEvent(CAMERA_PREVIEW_EVENT, { detail: { featureId } }))
}

/** LAT/LONG clicked in an expanded row — fly the map to the site, zoomed out of any count. */
function locateRepeater(callsign: string): void {
  document.dispatchEvent(new CustomEvent(REPEATER_LOCATE_EVENT, { detail: { callsign } }))
}

/** Add a repeater's output or input to the SDR Frequency Manager. */
async function saveRepeaterFrequency(
  station: RepeaterStation,
  channel: RepeaterChannel,
  side: RepeaterFrequencySide,
): Promise<void> {
  const mhz = channelSideMhz(channel, side)
  const label = `${station.callsign} ${channel.band} ${side === 'output' ? 'OUT' : 'IN'}`
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
    const groupId = await sdrStore.ensureFrequencyGroup(REPEATER_FREQUENCY_GROUP_NAME)
    await sdrStore.saveFrequency({
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

/** Take a repeater's output or input back out of the SDR Frequency Manager. */
async function removeRepeaterFrequency(
  station: RepeaterStation,
  channel: RepeaterChannel,
  side: RepeaterFrequencySide,
): Promise<void> {
  const mhz = channelSideMhz(channel, side)
  const label = `${station.callsign} ${channel.band} ${side === 'output' ? 'OUT' : 'IN'}`
  try {
    await sdrStore.removeStoredFrequency(repeaterMhzToHz(mhz))
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

// A station clicked on the map expands here. The sidebar tab switch is App.vue's
// job (it owns the sidebar); this side only has to open the right row. (The
// camera and repeater controls set the row on the store themselves before
// firing their open events.)
useDocumentEvent('aprs-station-selected', (event: Event) => {
  const { callsign } = (event as CustomEvent<{ callsign: string }>).detail
  landStore.setSearchExpandedCallsign(callsign)
})

// Collapse the accordion if its station ages out of the retention window, so the
// pane never holds an expanded row for a station that is no longer on the map.
watch(
  () => landStore.aprsStations,
  (stations) => {
    const expanded = landStore.searchExpandedCallsign
    // Camera and repeater rows share this expanded-key slot; an APRS poll
    // must not shut one.
    if (
      expanded &&
      !isCameraKey(expanded) &&
      repeaterCallsignFromSearchKey(expanded) === null &&
      !stations.some((station) => station.callsign === expanded)
    ) {
      landStore.setSearchExpandedCallsign('')
    }
  },
  { deep: true },
)

// And for repeaters: collapse a repeater row the band/mode filters (or the
// layer switch) have just removed from the map.
watch(
  () => [repeatersStore.filteredStations, landStore.repeatersLayerVisible] as const,
  ([filtered, layerOn]) => {
    const expanded = landStore.searchExpandedCallsign
    const callsign = repeaterCallsignFromSearchKey(expanded)
    if (callsign === null) return
    if (!layerOn || !filtered.some((station) => station.callsign === callsign)) {
      landStore.setSearchExpandedCallsign('')
    }
  },
)

// The same courtesy for cameras: collapse a camera row whose camera has left
// the feed (or whose feed was disabled), so the pane never holds an expanded
// row for something no longer on the map.
watch(
  () => cameraSources.value,
  () => {
    const expanded = landStore.searchExpandedCallsign
    if (expanded && isCameraKey(expanded) && !cameraById(expanded)) {
      landStore.setSearchExpandedCallsign('')
    }
  },
)
</script>

<style scoped>
/* With the REPEATER FILTERS bar between the search box and the list, the
   shell's input→first-row gap (held inside the first row's header) would
   stack on the bar's own height; drop it so the first repeater sits as close
   under the bar as the rows do under each other. Unscoped selector by
   design — the results body is the shell's, rendered outside this scope. */
:global(.lrf ~ #land-filter-results .bfp-results-body) {
  --bfp-results-top-gap: 0px;
}

.land-filter-accordion {
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}
/* Only the free-text packet fields deviate from the shared cell styling the
   Space pane uses for telemetry: they wrap rather than being ellipsized at the
   column edge (a raw frame is unreadable truncated to one line) and take the
   size, weight and colour of that pane's NOTES list, so prose reads the same in
   both panels. */
.land-filter-packet {
  display: contents;
  --ba-cell-value-white-space: normal;
  --ba-cell-value-word-break: break-word;
  --ba-cell-align: flex-start;
  --ba-cell-value-font-size: 13px;
  --ba-cell-value-font-weight: 400;
  --ba-cell-value-line-height: 1.45;
  --ba-cell-value-letter-spacing: normal;
  --ba-cell-value-color: rgba(255, 255, 255, 0.82);
}

.land-filter-raw {
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* Set off from the fields above: it is a control, not another field. */
  padding: 12px 24px 14px;
}
/* Matches the data cells' own label, so the disclosure reads as another field
   in the section rather than a control bolted onto it. */
.land-filter-raw-toggle {
  display: flex;
  align-items: center;
  /* Full width with the chevron pushed to the far edge, so it lines up with
     the row chevron above rather than floating beside the label. */
  justify-content: space-between;
  width: 100%;
  gap: 6px;
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.35);
}
.land-filter-raw-chevron {
  display: flex;
  align-items: center;
  transform: rotate(-90deg);
  transition: transform 0.2s ease;
}
.land-filter-raw-chevron.open {
  transform: rotate(0deg);
}
.land-filter-raw-toggle:hover {
  color: rgba(255, 255, 255, 0.6);
}
.land-filter-raw-label {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
/* Declared to match a packet field's value exactly — same family, size,
   weight, line height, colour and spacing — so the frame reads as the same
   kind of text as the COMMENT above it. */
.land-filter-raw-body {
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.45;
  letter-spacing: normal;
  color: rgba(255, 255, 255, 0.82);
  word-break: break-word;
}
</style>
