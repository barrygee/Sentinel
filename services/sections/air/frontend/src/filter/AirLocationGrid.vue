<template>
  <BaseDataGrid title="LOCATION">
    <BaseDataCell label="LATITUDE" :value="formatLat(coords[1])" />
    <BaseDataCell label="LONGITUDE" :value="formatLon(coords[0])" />
  </BaseDataGrid>
</template>

<script setup lang="ts">
/** The LOCATION grid an airport or military base accordion opens with. */
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import { formatLat, formatLon } from './aircraftTelemetryFormat'

defineProps<{
  /** The place's marker, as [longitude, latitude]. */
  coords: [number, number]
}>()
</script>
