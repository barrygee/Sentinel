<template>
  <div id="map-wrap" data-domain="space">
    <SpaceMap ref="spaceMapRef" />
    <SpaceSideMenu :map-ref="spaceMapProxy" />
    <NoUrlOverlay domain="space" />
    <SatInfoPanel :satellite-control="satelliteControl" />
    <Teleport v-if="teleportReady" to="#msb-pane-search">
      <SpaceFilter
        ref="spaceFilterRef"
        :satellite-control="satelliteControl"
        :get-user-location="getUserLocation"
      />
    </Teleport>
    <Teleport v-if="teleportReady" to="#msb-pane-passes">
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
import { ref, shallowRef, markRaw, watch, onMounted, onBeforeUnmount } from 'vue'
import { useUserLocation } from '@/composables/useUserLocation'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import SpaceMap from './SpaceMap.vue'
import SpaceSideMenu from './SpaceSideMenu.vue'
import SpaceFilter from './SpaceFilter.vue'
import SpacePasses from './SpacePasses.vue'
import SatInfoPanel from './SatInfoPanel.vue'
import NoUrlOverlay from '@/components/shared/NoUrlOverlay.vue'
import type { SatelliteControl } from './controls/satellite/SatelliteControl'

const spaceMapRef = ref<InstanceType<typeof SpaceMap> | null>(null)
const spaceFilterRef = ref<InstanceType<typeof SpaceFilter> | null>(null)
const spacePassesRef = ref<InstanceType<typeof SpacePasses> | null>(null)
const teleportReady = ref(!!document.getElementById('msb-pane-search'))
let _unmounted = false

if (!teleportReady.value) {
  onMounted(() => {
    function poll() {
      if (_unmounted) return
      if (document.getElementById('msb-pane-search')) {
        teleportReady.value = true
      } else requestAnimationFrame(poll)
    }
    requestAnimationFrame(poll)
  })
}

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
  _unmounted = true
  teleportReady.value = false
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
