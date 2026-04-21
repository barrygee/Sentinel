<template>
  <div id="map-wrap" data-domain="space">
    <SpaceStarfield />
    <SpaceMap ref="spaceMapRef" />
    <SpaceSideMenu :map-ref="spaceMapRef" />
    <NoUrlOverlay domain="space" />
    <SatInfoPanel :satellite-control="spaceMapRef?.getSatelliteControl?.() ?? null" />
    <Teleport to="#msb-pane-search">
      <SpaceFilter
        :satellite-control="spaceMapRef?.getSatelliteControl?.() ?? null"
        :get-user-location="getUserLocation"
        ref="spaceFilterRef"
      />
    </Teleport>
    <Teleport to="#msb-pane-passes">
      <SpacePasses
        :satellite-control="spaceMapRef?.getSatelliteControl?.() ?? null"
        :get-user-location="getUserLocation"
        :is-visible="true"
        ref="spacePassesRef"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import SpaceStarfield from './SpaceStarfield.vue'
import SpaceMap from './SpaceMap.vue'
import SpaceSideMenu from './SpaceSideMenu.vue'
import SpaceFilter from './SpaceFilter.vue'
import SpacePasses from './SpacePasses.vue'
import SatInfoPanel from './SatInfoPanel.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'

const spaceMapRef    = ref<InstanceType<typeof SpaceMap> | null>(null)
const spaceFilterRef = ref<InstanceType<typeof SpaceFilter> | null>(null)
const spacePassesRef = ref<InstanceType<typeof SpacePasses> | null>(null)

const { location: userLocation } = useUserLocation()

function getUserLocation(): [number, number] | null {
  const loc = userLocation.value
  return loc ? [loc.lon, loc.lat] : null
}

function onOpenSpaceSearch(): void {
  spaceFilterRef.value?.focus()
}

useDocumentEvent('open-space-search', onOpenSpaceSearch)
</script>
