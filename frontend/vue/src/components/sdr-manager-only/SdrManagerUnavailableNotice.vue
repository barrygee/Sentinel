<template>
  <div class="sdr-manager-unavailable" role="alert">
    <p class="sdr-manager-unavailable-title">SDR MANAGER IS NOT RUNNING</p>
    <p class="sdr-manager-unavailable-text">
      This Sentinel runs in SDR Manager-only mode, but SDR Manager for this machine didn’t answer,
      so there are no SDRs to manage. Check that <code>COMPOSE_PROFILES</code> in
      <code>.env</code> includes <code>sdr-manager-local</code> (on a Mac, that
      <code>sdr-manager-local status</code> is all ticked), then reload this page.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `SdrManagerUnavailableNotice` — shown by the SDR Manager-only shell in
 * place of Settings when sdr-manager-local's screens didn't load (its
 * container is stopped, or still starting): Settings › SDR Manager is then
 * missing, and the page would otherwise open on App Settings with no word
 * about why.
 */
</script>

<style scoped>
.sdr-manager-unavailable {
  margin: calc(var(--nav-height) + 24px) 16px 0;
  padding: 12px 16px;
  background: var(--surface-raised);
  border: 1px solid var(--rule);
  color: var(--ink);
}
.sdr-manager-unavailable-title {
  margin: 0 0 4px;
  font-family: var(--font-condensed);
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.18em;
}
.sdr-manager-unavailable-text {
  margin: 0;
  max-width: 70ch;
  font-size: var(--settings-text-body);
  line-height: 1.5;
}
</style>
