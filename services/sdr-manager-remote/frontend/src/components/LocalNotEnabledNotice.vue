<template>
  <aside class="local-not-enabled" aria-labelledby="sdr-manager-local-not-enabled-heading">
    <h4 id="sdr-manager-local-not-enabled-heading" class="settings-group-label">THIS MACHINE</h4>
    <p class="local-not-enabled-text">
      SDRs plugged into this computer aren’t managed here, because SDR Manager for this machine
      isn’t running. On Linux, add <code>sdr-manager-local</code> to
      <code>COMPOSE_PROFILES</code> in <code>.env</code>, then run
      <code>docker compose up -d</code>. On a Mac, set <code>SDR_MANAGER_LOCAL_NATIVE=1</code>
      instead and follow the Mac guide.
    </p>
    <DocLink
      doc-path="use/sdr-manager#switch-on-this-machine"
      setting-label="SDR Manager for this machine"
    />
  </aside>
</template>

<script setup lang="ts">
/**
 * `LocalNotEnabledNotice` — shown in Settings › SDR Manager when this
 * Sentinel runs without sdr-manager-local, so there is no THIS MACHINE group:
 * it says why and how to switch it on.
 *
 * It lives in this package rather than sdr-manager-local's, because it must
 * show exactly when that one is absent and its screens can't load.
 */
import DocLink from '@sentinel/shell-api/settings/DocLink.vue'
</script>

<style scoped>
.local-not-enabled {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  margin-bottom: 10px;
  background: rgba(var(--ink-rgb), 0.025);
}
.local-not-enabled .settings-group-label {
  margin: 0;
}
.local-not-enabled-text {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  line-height: 1.5;
  color: var(--ink);
}
.local-not-enabled-text code {
  font-size: 0.95em;
}
</style>
