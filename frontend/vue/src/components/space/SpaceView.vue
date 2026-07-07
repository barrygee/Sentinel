<template>
  <div id="map-wrap" data-domain="space">
    <h1 class="sr-only">Space — satellite tracking</h1>
    <SpaceMap ref="spaceMapRef" />
    <SpaceSideMenu :map-ref="spaceMapProxy" />
    <NoUrlOverlay domain="space" />
    <SatInfoPanel :satellite-control="satelliteControl" />
    <Teleport v-if="searchPaneReady" :to="sidebarPaneSelector('search')">
      <SpaceFilter
        ref="spaceFilterRef"
        :satellite-control="satelliteControl"
        :get-user-location="getUserLocation"
      />
    </Teleport>
    <Teleport v-if="passesPaneReady" :to="sidebarPaneSelector('passes')">
      <SpacePasses
        ref="spacePassesRef"
        :satellite-control="satelliteControl"
        :get-user-location="getUserLocation"
        :is-visible="true"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, markRaw, watch, onBeforeUnmount } from 'vue'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import SpaceMap from './SpaceMap.vue'
import SpaceSideMenu from './SpaceSideMenu.vue'
import SpaceFilter from './SpaceFilter.vue'
import SpacePasses from './SpacePasses.vue'
import SatInfoPanel from './SatInfoPanel.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'
import { sidebarPaneSelector } from '@/constants/sidebarPanes'
import { useSidebarPaneTarget } from '@/composables/useSidebarPaneTarget'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'

const spaceMapRef = ref<InstanceType<typeof SpaceMap> | null>(null)
const spaceFilterRef = ref<InstanceType<typeof SpaceFilter> | null>(null)
const spacePassesRef = ref<InstanceType<typeof SpacePasses> | null>(null)

// msb-pane-search / msb-pane-passes live in MapSidebar, a sibling of
// <RouterView> in App.vue — see useSidebarPaneTarget for why this waits
// rather than teleporting unconditionally.
const { ready: searchPaneReady } = useSidebarPaneTarget('search')
const { ready: passesPaneReady } = useSidebarPaneTarget('passes')

// Stable proxy — markRaw prevents Vue tracking mutations, so unmounting SpaceMap
// never triggers re-renders of sibling/child components via prop change.
const spaceMapProxy = markRaw({
  get current() {
    return spaceMapRef.value
  },
})

// satelliteControl is updated imperatively (not via computed) so it never
// re-renders children during teardown when spaceMapRef goes null.
const satelliteControl = shallowRef<SatelliteControl | null>(null)

// Watch for satelliteControl becoming available, then stop watching so unmount
// of SpaceMap (which nulls spaceMapRef) never triggers a child re-render.
const stopWatch = watch(
  () => spaceMapRef.value?.satelliteControlReactive ?? null,
  (ctrl) => {
    // The source is only ever a truthy control or null (coerced via `?? null`),
    // and the watch stops on the first truthy value, so the callback never runs
    // with a falsy ctrl — the guard is defensive.
    /* v8 ignore start */
    if (ctrl) {
      satelliteControl.value = ctrl
      stopWatch()
    }
    /* v8 ignore stop */
  },
)
onBeforeUnmount(() => {
  stopWatch()
})

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
