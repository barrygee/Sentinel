<script setup lang="ts">
/**
 * "LEARN MORE >" beside a setting: a link to the page of the in-app docs that
 * explains it. Following it leaves Settings for Docs; closing Docs returns to
 * this Settings section.
 *
 * Router-aware only through `RouterLink`, so it works in any app that mounts
 * the `/docs/<path>` route. Not shown when the deployment leaves the optional
 * docs service out (`useDocsDeploymentStore`).
 */
import { useDocsDeploymentStore } from '@sentinel/shell-api/stores/docsDeployment'

const docsDeployment = useDocsDeploymentStore()

defineProps<{
  /** Docs location below `/docs/`, with an optional anchor: `use/sdr/record#where-theyre-saved`. */
  docPath: string
  /** The setting's label, so the link's name says what it is about. */
  settingLabel: string
}>()
</script>

<template>
  <RouterLink
    v-if="docsDeployment.deployed"
    v-slot="{ href, navigate }"
    :to="`/docs/${docPath}`"
    custom
  >
    <a
      class="doc-link"
      :href="href"
      :aria-label="`Learn more about ${settingLabel}`"
      @click="navigate"
      >LEARN MORE <span aria-hidden="true">&#8250;</span></a
    >
  </RouterLink>
</template>

<style scoped>
.doc-link {
  display: inline-flex;
  align-items: center;
  /* At least 24x24 (WCAG 2.5.8). */
  min-width: 24px;
  min-height: 24px;
  align-self: flex-start;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-decoration: none;
  color: var(--accent-text-deep);
}

.doc-link:hover,
.doc-link:focus-visible {
  text-decoration: underline;
}
</style>
