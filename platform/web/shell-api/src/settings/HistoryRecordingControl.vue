<template>
  <div class="history-recording-control">
    <BaseToggleSetting
      :label="enabled ? 'Recording' : 'Record'"
      :accessible-name="
        enabled ? `${sectionLabel} history recording on` : `Record ${sectionLabel} history`
      "
      :namespace="sectionId"
      setting-key="historyEnabled"
      :hydrate-from-db="hydrate"
      :read-from-store="() => playback.sections[sectionId].historyEnabled"
      :mirror-to-store="(value: boolean) => playback.setHistoryEnabled(sectionId, value)"
      @stage="emit('stage', $event)"
    />
    <div class="history-retention-row">
      <span class="history-retention-caption" aria-hidden="true">KEEP</span>
      <BaseNumberSetting
        :accessible-name="`${sectionLabel} history: days to keep, 1 to 7`"
        unit="DAYS"
        :max-length="1"
        :min-value="1"
        :namespace="sectionId"
        setting-key="historyRetentionDays"
        :hydrate-from-db="hydrate"
        :read-from-store="() => playback.sections[sectionId].retentionDays"
        :mirror-to-store="(value: number) => playback.setRetentionDays(sectionId, value)"
        :build-staged-writer="retentionWriter"
        @stage="emit('stage', $event)"
      />
    </div>
    <HistoryStatusLine :section-id="sectionId" />
  </div>
</template>

<script setup lang="ts">
/**
 * A section's replay-history settings: record on/off, how many days to keep
 * (1–7), and what is stored now. One component for every section, which
 * passes only its id and name; the values live in the playback store.
 */
import { computed } from 'vue'
import BaseNumberSetting from '@sentinel/shell-api/settings/BaseNumberSetting.vue'
import BaseToggleSetting from '@sentinel/shell-api/settings/BaseToggleSetting.vue'
import HistoryStatusLine from '@sentinel/shell-api/playback/HistoryStatusLine.vue'
import {
  clampRetentionDays,
  type PlaybackSectionId,
} from '@sentinel/shell-api/playback/playbackSections'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'
import { usePlaybackStore } from '@sentinel/shell-api/stores/playback'

const props = defineProps<{
  sectionId: PlaybackSectionId
  /** The section's name for accessible labels (`Air`). */
  sectionLabel: string
}>()

const emit = defineEmits<{ stage: [fn: () => Promise<unknown> | void] }>()

const playback = usePlaybackStore()
const enabled = computed(() => playback.sections[props.sectionId].historyEnabled)

async function hydrate(): Promise<void> {
  playback.applyHistorySettings(
    props.sectionId,
    (await settingsApi.getNamespace(props.sectionId)) ?? undefined,
  )
}

/** Writes the clamped value, so a typed 9 is stored (and shown) as 7. */
function retentionWriter(days: number): () => Promise<void> {
  return () => settingsApi.put(props.sectionId, 'historyRetentionDays', clampRetentionDays(days))
}
</script>

<style scoped>
.history-recording-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.history-retention-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.history-retention-caption {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgba(var(--ink-rgb), 0.6);
}
</style>
