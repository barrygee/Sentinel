<template>
  <!-- Until the aircraft's first feed update lands there are no values to show,
       so only a loading message renders. -->
  <div v-if="loading" class="apt-acc-body acft-acc-body">
    <p class="acft-acc-loading" role="status">Loading aircraft data…</p>
  </div>
  <!-- Live telemetry re-renders each ADS-B poll. -->
  <div
    v-else
    class="apt-acc-body acft-acc-body"
    :class="{ 'acft-acc-body--stale': signalLost, 'acft-acc-body--emergency': emergency }"
  >
    <div v-if="signalLost" class="acft-acc-signal-lost" role="status">SIGNAL LOST</div>
    <BaseDataGrid title="POSITION" :columns="3">
      <BaseDataCell label="LATITUDE" :value="liveData.lat" />
      <BaseDataCell label="LONGITUDE" :value="liveData.lon" />
      <BaseDataCell label="HEADING" :value="liveData.hdg" />
    </BaseDataGrid>
    <BaseDataGrid :columns="3">
      <BaseDataCell label="ALTITUDE" :value="liveData.alt" />
      <BaseDataCell label="SPEED" :value="liveData.spd" />
      <BaseDataCell label="VERTICAL" :value="liveData.vrate" />
    </BaseDataGrid>
    <BaseDataGrid title="IDENTIFICATION">
      <BaseDataCell label="TYPE" :value="liveData.type" />
      <BaseDataCell label="REGISTRATION" :value="liveData.reg" />
      <BaseDataCell label="CATEGORY" :value="liveData.category" />
      <BaseDataCell label="SQUAWK" :value="liveData.squawk" />
    </BaseDataGrid>
    <AirAircraftActions
      :tracking="tracking"
      :alerts-on="alertsOn"
      @track="emit('track')"
      @toggle-alerts="emit('toggleAlerts')"
      @centre="emit('centre')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * An expanded aircraft row in the Air FILTER pane: its live position,
 * movement and identity, a loading message until its first feed update, a
 * SIGNAL LOST flag (values dimmed) while it is out of the feed, red headings for an emergency, and the track / alerts / centre
 * buttons. The pane owns the telemetry and handles the actions.
 */
import BaseDataGrid from '@sentinel/ui/base/BaseDataGrid.vue'
import BaseDataCell from '@sentinel/ui/base/BaseDataCell.vue'
import AirAircraftActions from './AirAircraftActions.vue'
import type { AircraftLiveData } from './airFilterTypes'
import './AirAccordionBody.css'
import './AirAircraftAccordion.css'

defineProps<{
  liveData: AircraftLiveData
  /** The aircraft hasn't appeared in the feed yet (e.g. a selection restored on
   *  opening Air before the first update), so there is nothing to show. */
  loading?: boolean
  /** The aircraft has dropped out of the feed; the values are its last known. */
  signalLost: boolean
  /** An emergency squawk or transponder emergency. */
  emergency: boolean
  tracking: boolean
  alertsOn: boolean
}>()

const emit = defineEmits<{ track: []; toggleAlerts: []; centre: [] }>()
</script>
