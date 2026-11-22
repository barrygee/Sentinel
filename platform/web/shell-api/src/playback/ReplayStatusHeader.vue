<template>
  <div class="replay-status">
    <span class="replay-status-label">{{ replaying ? 'REPLAY' : 'LIVE' }}</span>
    <time
      v-if="replaying"
      class="replay-status-moment"
      :datetime="new Date(momentMs).toISOString()"
    >
      {{ formatReplayMoment(momentMs) }}
    </time>
    <span v-else class="replay-status-moment replay-status-moment--live">Showing live data</span>
  </div>
</template>

<script setup lang="ts">
/** The replay panel's heading: LIVE, or REPLAY and the moment being replayed (UTC). */
import { formatReplayMoment } from '@sentinel/ui/utils/playbackTime'

defineProps<{ replaying: boolean; momentMs: number }>()
</script>

<style scoped>
.replay-status {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.replay-status-label {
  font-family: var(--font-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--accent-text);
}
.replay-status-moment {
  font-family: var(--font-primary);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  color: var(--ink-strong);
}
.replay-status-moment--live {
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-secondary);
}
</style>
