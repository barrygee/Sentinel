<template>
  <div class="land-filter-station">
    <BaseDataGrid title="STATION" :columns="3">
      <BaseDataCell label="CALLSIGN" :value="station.callsign" />
      <BaseDataCell label="SYMBOL">
        <!-- The icon itself, not its name: the same glyph the map draws, so
             the panel and the map agree at a glance. It carries the type as
             its accessible name, so nothing is lost by dropping the text. -->
        <AprsSymbol :symbol="station.symbol" />
      </BaseDataCell>
      <BaseDataCell label="TIME" :value="formatHeardTime(station.last_heard_ms)" />
    </BaseDataGrid>
    <BaseDataGrid title="POSITION" :columns="3">
      <BaseDataCell label="LATITUDE" :value="station.latitude.toFixed(5)" />
      <BaseDataCell label="LONGITUDE" :value="station.longitude.toFixed(5)" />
      <BaseDataCell label="ALTITUDE" :value="formatAltitude(station.altitude) ?? '—'" />
    </BaseDataGrid>
    <BaseDataGrid title="MOVEMENT" :columns="2">
      <BaseDataCell label="COURSE" :value="formatCourse(station.course) ?? '—'" />
      <BaseDataCell label="SPEED" :value="formatSpeed(station.speed) ?? '—'" />
    </BaseDataGrid>
    <!-- Free text, not telemetry: sized and weighted like the Space pane's
         NOTES list so prose reads as prose across both panels. -->
    <div class="land-filter-packet">
      <BaseDataGrid title="PACKET" :columns="2" collapse-on-narrow>
        <BaseDataCell label="PATH" :value="station.path ?? '—'" wide />
        <BaseDataCell label="COMMENT" :value="station.comment ?? '—'" wide />
      </BaseDataGrid>
      <LandStationRawFrame :raw="station.raw" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * LandAprsStationAccordion — an expanded APRS station row in the Land FILTER
 * pane: every field the beacon carried (not only those enabled for map
 * labels), in STATION, POSITION, MOVEMENT and PACKET grids, with the raw frame
 * folded away beneath.
 */
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import AprsSymbol from '@sentinel/ui/icons/AprsSymbol.vue'
import LandStationRawFrame from './LandStationRawFrame.vue'
import type { AprsStation } from '../stores/land'
import {
  formatAltitude,
  formatCourse,
  formatHeardTime,
  formatSpeed,
} from '../controls/aprs/AprsStationsControl'

defineProps<{
  /** The heard station to show. */
  station: AprsStation
}>()
</script>

<style scoped>
/* APRS station values sit one step below the shared 14px telemetry size and
   read in capitals throughout — beacon text arrives in whatever case the
   operator typed, so uppercasing keeps the panel looking like the Air pane's
   all-caps readings rather than a mix (the raw frame uppercases itself).
   `display: contents` keeps the grids as direct flex children of the
   accordion. */
.land-filter-station {
  display: contents;
  --ba-cell-value-font-size: 13px;
}
.land-filter-station :deep(.ba-data-cell-value) {
  text-transform: uppercase;
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
  --ba-cell-value-color: rgba(var(--ink-rgb), 0.82);
}
</style>
