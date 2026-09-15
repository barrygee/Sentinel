<template>
  <BaseFilterPanel
    :items="items"
    :query="landStore.searchQuery"
    :expanded-key="landStore.searchExpandedCallsign"
    id-prefix="land-filter"
    :input-label="
      camerasOn
        ? 'Filter APRS stations and traffic cameras by name, callsign, source or road'
        : 'Filter APRS stations by callsign, symbol, path or comment'
    "
    :placeholder="
      camerasOn ? 'CALLSIGN · CAMERA · ROAD · SOURCE' : 'CALLSIGN · SYMBOL · PATH · COMMENT'
    "
    :listbox-label="camerasOn ? 'APRS stations and traffic cameras' : 'APRS stations'"
    :empty-message="emptyMessage"
    @update:query="landStore.setSearchQuery"
    @update:expanded-key="landStore.setSearchExpandedCallsign"
  >
    <template #accordion="{ item }">
      <div class="land-filter-accordion">
        <LandCameraDetails
          v-if="cameraFor(item.key)"
          :camera="cameraFor(item.key)!"
          :refresh-seconds="refreshSecondsFor(cameraFor(item.key)!.properties.sourceId)"
          @locate="locateCamera"
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
 * Land FILTER pane — the searchable list of APRS stations currently heard.
 *
 * Mirrors the Space pane's shape (shared BaseFilterPanel shell, an expandable
 * per-item accordion of BaseDataGrid sections) over APRS data, and shows every
 * field the beacon carried rather than only those enabled for map labels.
 *
 * The list tracks the map exactly: it renders the same polled snapshot the map
 * plots, so a station that stops beaconing and ages out of the retention window
 * disappears from both at the same moment.
 *
 * Traffic cameras share the pane: while the layer is on, every camera in the
 * map's viewport is listed after the stations, grouped under a heading per
 * source (TfL JamCams, Durham CC, …) with its in-view count and licence line,
 * and expands to `LandCameraDetails` — the still, its position and SHOW ON
 * MAP — the way a vessel does in the Sea pane.
 */
import { computed, ref, watch } from 'vue'
import BaseFilterPanel, {
  type FilterPanelItem,
} from '@/components/shared/filter/BaseFilterPanel.vue'
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import SdrAprsSymbol from '@/components/sdr/SdrAprsSymbol.vue'
import LandCameraDetails from '@/components/land/LandCameraDetails.vue'
import { useLandStore, type AprsStation } from '@/stores/land'
import { useLandFeedsStore } from '@/stores/landFeeds'
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
const { sources: cameraSources, cameraById } = useVisibleCameras()

/** Whether cameras take part in this pane at all (layer on + a source enabled). */
const camerasOn = computed(
  () => landStore.trafficCamerasLayerVisible && cameraSources.value.length > 0,
)

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

/** One grouped row per in-view camera, per source, after the stations. */
const cameraItems = computed<FilterPanelItem[]>(() => {
  if (!camerasOn.value) return []
  const needle = landStore.searchQuery.trim().toLowerCase()
  return cameraSources.value.flatMap((source) => {
    const matching = needle
      ? source.visible.filter((camera) => cameraMatches(camera, needle))
      : source.visible
    const groupMeta =
      source.visible.length === source.total
        ? `${source.total}`
        : `${source.visible.length} of ${source.total} in view`
    return matching.map((camera) => ({
      key: camera.properties.id,
      idKey: cameraIdToken(camera.properties.id),
      primary: camera.properties.name,
      secondary: [camera.properties.view, camera.properties.state.toUpperCase()]
        .filter((part): part is string => Boolean(part))
        .join(' · '),
      optionLabel: `Traffic camera ${camera.properties.name}, ${source.feed.name}, ${camera.properties.state}`,
      groupLabel: source.feed.name,
      groupMeta,
      groupNote: source.attribution || undefined,
    }))
  })
})

const items = computed<FilterPanelItem[]>(() => {
  const stationItems: FilterPanelItem[] = matchingStations.value.map((station) => ({
    key: station.callsign,
    primary: station.callsign,
    secondary: `${symbolLabel(station)} · ${formatHeardTime(station.last_heard_ms)}`,
    optionLabel: `${station.callsign}, ${symbolLabel(station)}, heard ${formatHeardTime(station.last_heard_ms)}`,
    // Stations only get a heading once cameras are in the same list; alone
    // they read as they always have.
    groupLabel: camerasOn.value ? 'APRS STATIONS' : undefined,
  }))
  return [...stationItems, ...cameraItems.value]
})

const emptyMessage = computed(() => {
  if (camerasOn.value) {
    const anyVisible = cameraSources.value.some((source) => source.visible.length > 0)
    if (!landStore.aprsLayerVisible && !anyVisible) return 'No traffic cameras in view'
    return 'No stations or cameras match'
  }
  if (!landStore.aprsLayerVisible) return 'APRS layer hidden'
  return landStore.aprsStations.length === 0 ? 'No APRS stations heard' : 'No stations match'
})

/** Camera keys are "feedId:ref"; APRS callsigns never carry a colon. */
function isCameraKey(key: string): boolean {
  return key.includes(':')
}

function cameraFor(key: string): CameraFeature | undefined {
  return isCameraKey(key) ? cameraById(key) : undefined
}

/** The camera's feed cadence — undefined lets `LandCameraDetails` apply its default. */
function refreshSecondsFor(feedId: string): number | undefined {
  return landFeedsStore.feeds.find((feed) => feed.id === feedId)?.refreshSeconds
}

/** SHOW ON MAP — the same event `TrafficCamerasControl` flies to. */
function locateCamera(featureId: string): void {
  document.dispatchEvent(new CustomEvent('land-camera-selected', { detail: { featureId } }))
}

function stationFor(callsign: string): AprsStation | undefined {
  return landStore.aprsStations.find((station) => station.callsign === callsign)
}

// A station clicked on the map expands here. The sidebar tab switch is App.vue's
// job (it owns the sidebar); this side only has to open the right row.
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
    // Camera rows share this expanded-key slot; an APRS poll must not shut one.
    if (
      expanded &&
      !isCameraKey(expanded) &&
      !stations.some((station) => station.callsign === expanded)
    ) {
      landStore.setSearchExpandedCallsign('')
    }
  },
  { deep: true },
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
