<template>
  <div class="base-zoom-buttons theme-dark" role="group" :aria-label="groupLabel">
    <!-- `theme-dark` pins the rail's dark palette: these sit on a map or globe,
         even inside a light surface such as the Settings panel. (Comment kept
         inside the root so the component stays single-root for class fallthrough.) -->
    <BaseIconButton
      class="base-zoom-buttons-btn"
      tooltip-side="left"
      tooltip="ZOOM IN"
      accessible-name="Zoom in"
      @click="emit('zoom-in')"
    >
      +
    </BaseIconButton>
    <BaseIconButton
      class="base-zoom-buttons-btn"
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
 * `BaseZoomButtons` — a +/− pair drawn like the domain maps' right-hand icon
 * rail (`AirSideMenu` and friends): the same rail `BaseIconButton`s on the
 * rail's dark `--map-bar-bg`, as compact separate squares.
 *
 * For views that have no rail of their own: the small embedded maps (e.g.
 * Settings › Offline Maps, in place of MapLibre's stock white
 * `NavigationControl`) and the GLOBE section's WebGL globe. It lives in
 * `@sentinel/ui`, not map-kit, so a remote that draws no MapLibre map can use it.
 *
 * Emits only; the owner does the zooming.
 */
import BaseIconButton from '@sentinel/ui/base/BaseIconButton.vue'

withDefaults(
  defineProps<{
    /** Accessible name of the button group, e.g. "Globe zoom". */
    groupLabel?: string
  }>(),
  { groupLabel: 'Map zoom' },
)

const emit = defineEmits<{ 'zoom-in': []; 'zoom-out': [] }>()
</script>

<style scoped>
.base-zoom-buttons {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 30px;
}

/* Each button carries the rail ground itself so the gap shows the map. Glyph
   sizing is the rail's own +/− (`.map-side-rail .sm-btn.sm-glyph`). */
.base-zoom-buttons-btn {
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
  .base-zoom-buttons-btn[data-tooltip]::before {
    display: none !important;
  }
}
</style>
