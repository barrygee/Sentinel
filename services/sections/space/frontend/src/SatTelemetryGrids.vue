<template>
  <BaseDataGrid title="POSITION DATA" :columns="3">
    <BaseDataCell label="LATITUDE" :value="telemetry['lat'] ?? '—'" />
    <BaseDataCell label="LONGITUDE" :value="telemetry['lon'] ?? '—'" />
    <BaseDataCell label="HEADING" :value="telemetry['hdg'] ?? '—'" />
  </BaseDataGrid>
  <BaseDataGrid title="ORBITAL DATA" :columns="3">
    <BaseDataCell label="ALTITUDE" :value="telemetry['alt'] ?? '—'" />
    <BaseDataCell label="VELOCITY" :value="telemetry['vel'] ?? '—'" />
  </BaseDataGrid>
</template>

<script setup lang="ts">
/**
 * The POSITION DATA and ORBITAL DATA grids at the top of an expanded satellite
 * accordion, fed by `useLiveSatelliteTelemetry`. A field shows "—" until the
 * first position update for the satellite arrives.
 */
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import type { SatelliteTelemetry } from './composables/useLiveSatelliteTelemetry'

defineProps<{
  /** Formatted live fields keyed lat / lon / hdg / alt / vel; empty before the first update. */
  telemetry: SatelliteTelemetry
}>()
</script>
