<template>
  <div class="map-zoom-buttons theme-dark" role="group" aria-label="Map zoom">
    <!-- `theme-dark` pins the rail's dark palette: these sit on the map, even
         inside a light surface such as the Settings panel. (Comment kept inside
         the root so the component stays single-root for class fallthrough.) -->
    <BaseIconButton
      class="map-zoom-buttons-btn"
      tooltip-side="left"
      tooltip="ZOOM IN"
      accessible-name="Zoom in"
      @click="emit('zoom-in')"
    >
      +
    </BaseIconButton>
    <BaseIconButton
      class="map-zoom-buttons-btn"
      tooltip-side="left"
      tooltip="ZOOM OUT"
      accessible-name="Zoom out"
      @click="emit('zoom-out')"
    >
      −
    </BaseIconButton>
  </div>
</template>

<script setup lang="ts">
/**
 * `MapZoomButtons` — a +/− pair drawn like the domain maps' right-hand icon
 * rail (`AirSideMenu` and friends): the same rail `BaseIconButton`s on the
 * rail's dark `--map-bar-bg`, as compact separate squares.
 * For the small embedded maps (e.g. Settings › Offline Maps) that have no
 * rail, in place of MapLibre's stock white `NavigationControl`.
 *
 * Emits only; the owning map component does the zooming.
 */
import BaseIconButton from '@/components/base/BaseIconButton.vue'

const emit = defineEmits<{ 'zoom-in': []; 'zoom-out': [] }>()
</script>

<style scoped>
.map-zoom-buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 30px;
}

/* Each button carries the rail ground itself so the gap shows the map. Glyph
   sizing is the rail's own +/− (`#side-menu .sm-btn.sm-glyph`). */
.map-zoom-buttons-btn {
  --ba-rail-height: 30px;
  --ba-rail-bg: var(--map-bar-bg);
  --ba-rail-hover-bg:
    linear-gradient(rgba(var(--rail-ink-rgb), 0.08), rgba(var(--rail-ink-rgb), 0.08)),
    var(--map-bar-bg);
  font-size: 18px;
  font-weight: 300;
}

/* Touch screens: hover tooltips would stick on tap — the same suppression the
   rail applies to its own buttons (IconRail). */
@media (max-width: 768px) {
  .map-zoom-buttons-btn[data-tooltip]::before {
    display: none !important;
  }
}
</style>
