<script setup lang="ts">
/**
 * The GLOBE page. For now a placeholder that proves the section loads, routes
 * and hides with its setting; the 3D globe and its live layers replace the
 * notice in later steps (see the section's README).
 */
</script>

<template>
  <div id="globe-page" class="theme-dark" data-domain="globe">
    <h1 class="sr-only">Globe — live aircraft, satellites, vessels and APRS stations</h1>
    <p class="globe-placeholder" role="status">The 3D globe is coming soon.</p>
  </div>
</template>

<style scoped>
/* Fills the space between the nav and the footer, like the SDR page. The
   globe's own dark canvas colour, so the page matches the globe in both themes. */
#globe-page {
  position: fixed;
  inset: var(--nav-height) 0 var(--footer-height) 0;
  display: grid;
  place-items: center;
  padding: 0 16px;
  background: #0d0f14;
}

.globe-placeholder {
  margin: 0;
  color: var(--color-text-muted);
  font-size: 14px;
  letter-spacing: 0.08em;
  text-align: center;
  text-transform: uppercase;
}
</style>
