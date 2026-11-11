<template>
  <header id="nav">
    <div id="nav-logo">
      <img id="logo-img" src="/assets/logo.svg" alt="SENTINEL" />
    </div>
    <slot />
  </header>
</template>

<script setup lang="ts">
/**
 * `AppNavBar` — the fixed top bar with the SENTINEL logo, shared by the full
 * app (which slots in its section links and mobile menu button) and SDR
 * Manager-only mode (logo only), so both modes draw the same bar.
 */
</script>

<style scoped>
/* Fixed bar at the top of the viewport. --nav-height (a design token) embeds
   the iOS safe-area inset, so padding-top keeps the content clear of the notch
   while the bar's height and the token stay in step. */
#nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: var(--nav-height);
  background: var(--chrome-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Right padding lands the last domain link's right edge on the 44px right
     rail's icon-centre column (x≈22px from the edge) — the same column the
     side-menu icons and the footer settings gear centre on. */
  padding: env(safe-area-inset-top) 22px 0 10px;
  /* Above the settings panel (10000) so the nav bar is never obscured. */
  z-index: 10001;
}

/* Wraps the logo. The logo's ⊙ mark is the leftmost glyph, CENTRE-aligned on
   the 44px left rail's icon centre column (x≈22px). In the current logo.svg
   the ⊙'s centre sits 17.45 viewBox units from the image's left edge; at the
   26px render height (scale 26/34.9) that is ~13px, so the image must start at
   x≈9px: #nav's 10px padding-left minus this 1px nudge. Recompute if the logo
   geometry or #logo-img height changes. */
#nav-logo {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: -1px;
}

/* The SVG's viewBox is tight around the artwork (no internal padding), so this
   height IS the rendered artwork height. Both dimensions are pinned because
   Safari cannot be trusted to derive an SVG <img>'s intrinsic ratio for
   `width: auto` (it falls back to a default size and renders the logo tiny):
   142px = 26px x the SVG's 190.80/34.90 aspect. Keep in step with logo.svg's
   viewBox if it is regenerated. The logo keeps its full height on smaller
   screens: shrinking it would shift the ⊙ off the rail's icon column. */
#logo-img {
  height: 26px;
  width: 142px;
  display: block;
}

/* padding-left stays 10px at every size so the logo ⊙ stays at x≈22px. */
@media (max-width: 1024px) {
  #nav {
    padding-right: 16px;
  }
}

/* The 44px menu button sits flush right, so its centre lands 22px from the
   edge, on the right control rail's column. */
@media (max-width: 768px) {
  #nav {
    padding-right: 0;
  }
}
</style>
