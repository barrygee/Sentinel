<template>
  <header id="nav">
    <div id="nav-logo">
      <img id="logo-img" src="/assets/logo.svg" alt="SENTINEL" />
    </div>
    <p class="sdr-manager-only-badge">SDR MANAGER ONLY</p>
  </header>
</template>

<script setup lang="ts">
/**
 * `SdrManagerOnlyHeader` — the nav bar of SDR Manager-only mode: the logo and
 * a badge naming the mode, where the full app lists its sections. It reuses
 * the full app's `#nav` styles (frontend/assets/template.css), so both modes
 * have the same bar.
 */
</script>

<style scoped>
.sdr-manager-only-badge {
  margin: 0;
  padding: 4px 10px;
  border: 1px solid var(--rule);
  color: var(--ink);
  font-family: var(--font-condensed);
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.18em;
  white-space: nowrap;
}
</style>
