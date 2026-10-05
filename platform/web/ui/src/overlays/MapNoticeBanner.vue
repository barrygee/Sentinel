<template>
  <BaseWarningNotice class="map-notice" :message="message">
    <template v-if="$slots.action" #action><slot name="action" /></template>
  </BaseWarningNotice>
</template>

<script setup lang="ts">
/**
 * Places the yellow warning strip (`BaseWarningNotice`) a map shows when it is empty for a reason the
 * operator can act on — a stopped decoder container, a radio tuned off
 * channel, an upstream that is reconnecting.
 *
 * Shared by the domain notices (`SeaSourceNotice`, `AdsbSourceNotice`), which
 * previously carried their own copies of the same block. They decide *what* to
 * say and when; this owns how it looks and where it sits, so the two cannot
 * drift apart.
 *
 * **Centred on the map you can actually see.** The sidebar is `position: fixed`
 * and overlays the map rather than reflowing it, so a viewport-centred banner
 * drifts left of the visible map's middle as soon as the panel opens. The
 * banner is therefore inset by whatever the sidebar currently occupies — the
 * 44px rail alone, or the rail plus the 386px panel — and centred in the
 * remainder. It also sits above the sidebar, since below it the panel simply
 * covered its left-hand end.
 *
 * Only from 769px up: at narrower widths the panel stretches across the map, so
 * there is no remainder to centre in and the banner stays on the page's centre.
 *
 * It is also click-through (`pointer-events: none`), so covering the sidebar
 * rail never costs the operator a control; only the optional action slot takes
 * pointer events back.
 */
import BaseWarningNotice from '@sentinel/ui/base/BaseWarningNotice.vue'

defineProps<{
  /** The warning to show. The caller renders nothing when there is none. */
  message: string
}>()
</script>

<style scoped>
.map-notice {
  /* How much of the map's left edge the sidebar is covering right now. Zero by
     default (narrow screens, where the panel spans the map); widened below. */
  --map-notice-inset-left: 0px;

  /* Fixed rather than absolute: the notice belongs to the page, not to the
     map's own box, which no ancestor positions anyway. */
  position: fixed;
  top: calc(var(--nav-height) + 12px);
  /* The centre of the strip between the sidebar and the right edge:
     inset + (100vw - inset) / 2, which reduces to 50% + inset / 2. */
  left: calc(50% + var(--map-notice-inset-left) / 2);
  transform: translateX(-50%);
  /* Above the sidebar panel (1002) and rail (1003) — below either, the panel
     covered it. */
  z-index: 1004;
  /* Informational, so it must never swallow a click meant for the map or the
     rail beneath it; the action slot re-enables pointer events for itself. */
  pointer-events: none;
  max-width: min(560px, calc(100vw - var(--map-notice-inset-left) - 24px));
  box-shadow: 0 2px 8px rgba(var(--shadow-rgb), 0.25);
}

/* From 769px the sidebar sits beside the map rather than over all of it, so the
   banner centres in what is left. `data-sidebar-open` is already set on <body>
   by MapSidebar, so this needs no extra plumbing. */
@media (min-width: 769px) {
  .map-notice {
    /* The icon rail, always present. */
    --map-notice-inset-left: 44px;
  }

  body[data-sidebar-open] .map-notice {
    /* Rail (44px) + open panel (386px). */
    --map-notice-inset-left: 430px;
  }
}
</style>
