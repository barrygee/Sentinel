<template>
  <!-- Fixed icon rail pinned to the right edge, mirroring the left #map-sidebar-rail.
       The full label is each button's accessible name and hover tooltip. -->
  <IconRail
    class="map-side-rail"
    :container-id="containerId"
    :accessible-name="accessibleName"
    :collapsed="!appStore.sideMenuOpen"
  >
    <BaseIconButton
      class="sm-btn sm-glyph"
      style="--ba-rail-transition: color 0.15s ease"
      tooltip-side="left"
      tooltip="ZOOM IN"
      accessible-name="Zoom in"
      @click="emit('zoom-in')"
    >
      +
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn sm-glyph"
      style="--ba-rail-transition: color 0.15s ease"
      tooltip-side="left"
      tooltip="ZOOM OUT"
      accessible-name="Zoom out"
      @click="emit('zoom-out')"
    >
      −
    </BaseIconButton>
    <BaseIconButton
      class="sm-btn"
      style="--ba-rail-transition: color 0.15s ease"
      :class="{ active: locationActive }"
      :active="locationActive"
      tooltip-side="left"
      tooltip="GO TO MY LOCATION"
      accessible-name="Go to my location"
      @click="emit('go-to-location')"
    >
      <MyLocationIcon />
    </BaseIconButton>

    <IconRailAccordion :panel-id="layersPanelId">
      <template #trigger="{ open: layersAccordionOpen, toggle: toggleLayersAccordion }">
        <BaseIconButton
          :id="layersButtonId"
          class="sm-btn"
          style="--ba-rail-transition: color 0.15s ease"
          :class="{ active: layersAccordionOpen }"
          :active="layersAccordionOpen"
          tooltip-side="left"
          tooltip="MAP LAYERS"
          accessible-name="Map layers"
          :aria-controls="layersPanelId"
          :aria-expanded="layersAccordionOpen"
          @click="toggleLayersAccordion"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12 3 L21 8 L12 13 L3 8 Z"
              stroke="currentColor"
              stroke-width="1.4"
              stroke-linejoin="round"
              fill="none"
            />
            <path d="M3 12 L12 17 L21 12" stroke="currentColor" stroke-width="1.4" fill="none" />
            <path d="M3 16 L12 21 L21 16" stroke="currentColor" stroke-width="1.4" fill="none" />
          </svg>
        </BaseIconButton>
      </template>
      <template #panel>
        <slot name="layers" />
      </template>
    </IconRailAccordion>
  </IconRail>
</template>

<script setup lang="ts">
/**
 * `MapSideRail` — the right-hand rail every map section shares: zoom, location
 * and the MAP LAYERS accordion. A section passes its overlays in the `layers`
 * slot (`MapRailLayerButton` and friends) and answers the events; what zooming
 * or a location fly means stays with the section.
 *
 * The rail's mechanics live in `IconRail` / `IconRailAccordion`, and the button
 * chrome in `BaseIconButton`.
 */
import { useAppStore } from '@sentinel/shell-api/stores/app'
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'
import IconRail from '@sentinel/ui/base/IconRail.vue'
import IconRailAccordion from '@sentinel/ui/base/IconRailAccordion.vue'
import MyLocationIcon from '@sentinel/ui/icons/MyLocationIcon.vue'

defineProps<{
  /** The rail's `id`, which each section's CSS and e2e tests address. */
  containerId: string
  accessibleName: string
  /** The MAP LAYERS button's `id`. */
  layersButtonId: string
  /** The MAP LAYERS panel's `id`. */
  layersPanelId: string
  /** A location is known, so the button shows as active. */
  locationActive: boolean
}>()

const emit = defineEmits<{ 'zoom-in': []; 'zoom-out': []; 'go-to-location': [] }>()

const appStore = useAppStore()
</script>

<style>
.map-side-rail .sm-btn.sm-glyph {
  font-size: 18px;
  font-weight: 300;
}
</style>
