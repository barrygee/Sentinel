<script setup lang="ts">
/**
 * `IconRail` — the fixed-edge icon-rail shell shared by the Air and Space
 * side menus (`AirSideMenu.vue`, `SpaceSideMenu.vue`). It owns exactly the
 * rail's structural shell: the fixed container (position, sizing, stacking),
 * the small-screen collapse behaviour, and touch-device tooltip suppression
 * for whatever `BaseIconButton`s are passed into its default slot. It does
 * NOT own any button content, domain logic, or map/store wiring — callers
 * fill the rail via the default slot (typically `BaseIconButton`s and
 * `IconRailAccordion`s) and keep their own behaviour and state exactly where
 * it already lived.
 *
 * `MapSidebar`'s left-edge tab rail is a deliberately separate shell (its
 * accordion/tab behaviour differs) and does not use this component.
 */
interface IconRailProps {
  /** Passthrough `id` for the root `<nav>` — legacy call sites and their
   * existing CSS/tests key off this (`#space-side-menu`, `#side-menu`). */
  containerId: string
  /** Accessible name for the rail landmark (never `ariaLabel`; see
   * `BaseIconButton`'s identical convention). */
  accessibleName: string
  /** Whether the rail is currently collapsed (small-screen only — see the
   * 768px media query below). Driven by the caller's own store state
   * (`appStore.sideMenuOpen`), not owned here. Defaults to `false`. */
  collapsed?: boolean
}

withDefaults(defineProps<IconRailProps>(), {
  collapsed: false,
})
</script>

<template>
  <nav
    :id="containerId"
    class="icon-rail"
    :class="{ 'icon-rail--collapsed': collapsed }"
    :aria-label="accessibleName"
  >
    <slot />
  </nav>
</template>

<style scoped>
/* Fixed icon rail pinned to the right edge, mirroring the left
   #map-sidebar-rail. Extracted verbatim from AirSideMenu/SpaceSideMenu's own
   duplicated <style> blocks — see those components for the button-content
   deltas (glyph sizing etc.) that remain domain-local because they aren't
   shell mechanics. */
.icon-rail {
  position: fixed;
  top: var(--nav-height);
  bottom: var(--footer-height);
  right: 0;
  width: 44px;
  background: rgba(10, 13, 20, 0.98);
  z-index: 1003;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
}

/* Touch screens: hover tooltips aren't useful. `:slotted` reaches the
   BaseIconButtons passed into the default slot (their tooltip pseudo-element
   lives in BaseIconButton's own scoped style; `!important` here is what wins
   over that lower-specificity default, matching the pre-extraction rule).

   NOTE: this `:slotted` rule only reaches IconRail's OWN direct slot
   children (the zoom/location buttons rendered straight into the default
   slot) — it does NOT reach buttons nested inside a further child component
   like IconRailAccordion. Vue's scoped-CSS slot mechanism stamps rendered
   slot content with the *immediate* slot owner's scope id, and the
   scope-id-propagation Vue normally does when a component re-forwards a
   slot bails out for multi-root components (IconRailAccordion has two
   roots: the trigger slot + the panel div) — so IconRailAccordion's own
   trigger/panel slot content never picks up IconRail's `-s` scope id.
   IconRailAccordion therefore repeats this exact rule in its own scoped
   style for its own slot children. If IconRailAccordion migrates to a
   single root some day this duplication could be reconsidered, but keep
   both copies until then — dropping either one leaves a class of buttons
   with a stuck tooltip pill on touch. */
@media (max-width: 768px) {
  .icon-rail :slotted([data-tooltip])::before {
    display: none !important;
  }
  /* The footer's side-menu toggle is only offered on small screens, so the
     rail can only be collapsed here. On wider screens it always shows (the
     toggle is hidden), so a collapsed state can't leave it stuck off-screen. */
  .icon-rail--collapsed {
    display: none;
  }
}
</style>
