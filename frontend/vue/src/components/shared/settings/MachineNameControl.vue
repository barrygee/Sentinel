<template>
  <div class="settings-machine-name">
    <BaseTextSetting
      accessible-name="Machine name"
      placeholder="e.g. Home base"
      namespace="app"
      setting-key="machineName"
      :max-length="MACHINE_NAME_MAX_LENGTH"
      :hydrate-from-db="appStore.hydrateMachineNameFromDb"
      :read-from-store="() => appStore.machineName"
      :mirror-to-store="appStore.setMachineName"
      defer-mirror
      @stage="(stagedWriter) => emit('stage', stagedWriter)"
      @edit="(text) => (draft = text)"
    />
    <p class="settings-machine-name-preview" aria-live="polite">
      Shown here as <strong>{{ preview }}</strong
      >{{ trimmedDraft ? `; other Sentinels see ${trimmedDraft}.` : '.' }}
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › App Settings › Machine Name — the one name for this machine.
 *
 * This machine's position and its own SDR Manager used to show up as two
 * things ("Sentinel location", "This machine"). They are one machine, so they
 * share one name: on this machine it reads `<name> (This machine)` everywhere,
 * and other Sentinels that add its SDR Manager see just `<name>`.
 *
 * Stages for APPLY CHANGES and re-reads on `sentinel:config-uploaded`
 * (`BaseTextSetting` → `useStagedSetting`); the store, and with it every label,
 * only changes once the name is applied (`defer-mirror`).
 */
import { computed, ref, watch } from 'vue'
import BaseTextSetting from '@sentinel/shell-api/settings/BaseTextSetting.vue'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import {
  MACHINE_NAME_MAX_LENGTH,
  thisMachineLabel,
} from '@sentinel/shell-api/utils/thisMachineLabel'

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const appStore = useAppStore()

/** The name being typed, for the preview; follows the stored one when that changes. */
const draft = ref(appStore.machineName)
watch(
  () => appStore.machineName,
  (stored) => {
    draft.value = stored
  },
)
const trimmedDraft = computed(() => draft.value.trim())
const preview = computed(() => thisMachineLabel(draft.value))
</script>

<style scoped>
.settings-machine-name {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.settings-machine-name-preview {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  line-height: 1.5;
  color: var(--ink-secondary);
}
.settings-machine-name-preview strong {
  font-weight: 600;
  color: var(--ink);
}
</style>
