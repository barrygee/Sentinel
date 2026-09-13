<template>
  <!-- No NAME cell: the row header above the accordion already carries it. -->
  <BaseDataGrid title="VESSEL" :columns="3">
    <BaseDataCell label="TYPE" :value="vessel.typeLabel || vesselFamilyLabel(vessel.family)" />
    <BaseDataCell label="MMSI" :value="vessel.mmsi" />
    <BaseDataCell label="IMO" :value="vessel.imo || '—'" />
    <BaseDataCell label="CALLSIGN" :value="vessel.callsign || '—'" />
    <BaseDataCell label="STATUS" :value="navStatusLabel(vessel.navStatus)" />
    <BaseDataCell label="FIX" :value="formatFixTime(vessel.lastPositionMs)" />
  </BaseDataGrid>
  <BaseDataGrid title="VOYAGE" :columns="2">
    <BaseDataCell label="DESTINATION" :value="vessel.destination || '—'" wide />
  </BaseDataGrid>
  <BaseDataGrid title="POSITION" :columns="2">
    <BaseDataCell label="LATITUDE" :value="vessel.lat.toFixed(5)" />
    <BaseDataCell label="LONGITUDE" :value="vessel.lon.toFixed(5)" />
  </BaseDataGrid>
  <BaseDataGrid title="MOVEMENT" :columns="3">
    <BaseDataCell label="SPEED" :value="formatKnots(vessel.sog)" />
    <BaseDataCell label="COURSE" :value="formatDegrees(vessel.cog)" />
    <BaseDataCell label="HEADING" :value="formatDegrees(vessel.heading)" />
  </BaseDataGrid>
</template>

<script setup lang="ts">
/**
 * The expanded detail of one vessel in the Sea FILTER pane: every field its
 * AIS reports carried, laid out in the shared data-grid sections the Land and
 * Space panes use, so a vessel reads like a station or a satellite.
 */
import BaseDataGrid from '@/components/base/BaseDataGrid.vue'
import BaseDataCell from '@/components/base/BaseDataCell.vue'
import type { SeaVessel } from '@/stores/sea'
import { vesselFamilyLabel } from '@/utils/aisShipType'
import { formatDegrees, formatFixTime, formatKnots, navStatusLabel } from './seaFormat'

defineProps<{ vessel: SeaVessel }>()
</script>
