<template>
  <div class="config-report">
    <p class="config-report-summary">
      Imported: {{ result.devices_applied }} {{ plural(result.devices_applied) }} applied,
      {{ result.devices_skipped }} skipped, {{ result.devices_failed }} failed.
      {{ result.hotspot_applied ? 'Hotspot applied.' : '' }}
    </p>
    <ul v-if="notApplied.length > 0" class="config-report-list">
      <li v-for="outcome in notApplied" :key="`${outcome.identity_kind}:${outcome.identity_key}`">
        <strong>{{ outcome.outcome === 'failed' ? 'FAILED' : 'SKIPPED' }}</strong>
        {{ outcome.identity_key }}{{ outcome.detail ? ` — ${outcome.detail}` : '' }}
      </li>
    </ul>
    <p v-if="!result.hotspot_applied && result.hotspot_detail" class="config-report-summary">
      Hotspot not applied: {{ result.hotspot_detail }}
    </p>
    <p v-if="result.console_password_applied" class="config-report-summary">
      Console password set from the file.
    </p>
    <p v-else-if="result.console_password_detail" class="config-report-summary">
      Console password not applied: {{ result.console_password_detail }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * `ConfigImportReport` — how an import went: devices applied, skipped and
 * failed (each one not applied, with why), and whether the hotspot and a
 * console password (which a provisioning file may carry, never an export) were.
 */
import { computed } from 'vue'
import type { LocalConfigImportResult } from '../../api/types'

const props = defineProps<{ result: LocalConfigImportResult }>()

const notApplied = computed(() =>
  props.result.devices.filter((outcome) => outcome.outcome !== 'applied'),
)

function plural(count: number): string {
  return count === 1 ? 'device' : 'devices'
}
</script>

<style scoped>
.config-report-summary {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
}
.config-report-list {
  margin: 4px 0 0;
  padding-left: 18px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink);
  overflow-wrap: anywhere;
}
</style>
