<template>
  <div id="map-wrap" data-domain="air">
    <AirMap ref="airMapRef" />
    <AirSideMenu :map-ref="airMapRef" />
    <NoUrlOverlay domain="air" />
    <Teleport to="#msb-pane-search">
      <AirFilter
        :adsb-control="airMapRef?.getAdsbControl?.() ?? null"
        :airports-control="airMapRef?.getAirports?.() ?? null"
        :military-bases-control="airMapRef?.getMilBases?.() ?? null"
        :get-map="() => airMapRef?.getMap?.() ?? null"
        ref="airFilterRef"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AirMap from './AirMap.vue'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import AirSideMenu from './AirSideMenu.vue'
import AirFilter from './AirFilter.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'

const airMapRef    = ref<InstanceType<typeof AirMap> | null>(null)
const airFilterRef = ref<InstanceType<typeof AirFilter> | null>(null)

// Ctrl+F / Cmd+F → focus filter input
function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault()
    airFilterRef.value?.focus()
  }
}

// Listen for side-menu open-search events
function onOpenSearch() { airFilterRef.value?.focus() }
function onOpenFilter() { airFilterRef.value?.focus() }

useDocumentEvent('keydown', onKeydown)
useDocumentEvent('air-open-search', onOpenSearch)
useDocumentEvent('air-open-filter', onOpenFilter)
</script>
