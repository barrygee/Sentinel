<template>
  <ul
    v-if="store.visibleNotices.length > 0"
    class="local-notice-list"
    aria-label="SDR Manager notices"
  >
    <li
      v-for="notice in store.visibleNotices"
      :key="notice.id"
      class="local-notice"
      :class="`local-notice--${notice.level}`"
    >
      <span class="local-notice-level">{{ LEVEL_LABELS[notice.level] }}</span>
      <span class="local-notice-message">
        <template v-if="notice.device_id">{{ deviceName(notice.device_id) }}: </template
        >{{ notice.message }}
        <span v-if="notice.repeatCount > 1" class="local-notice-repeat">
          ×{{ notice.repeatCount }}
        </span>
      </span>
      <button
        type="button"
        class="sdr-device-btn"
        :aria-label="`Dismiss: ${notice.message}`"
        @click="store.dismissNotice(notice.id)"
      >
        <svg width="11" height="11" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 2.5L10.5 10.5M10.5 2.5L2.5 10.5" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </button>
    </li>
  </ul>
</template>

<script setup lang="ts">
/**
 * `LocalNoticeList` — what sdr-manager-local has reported over its event
 * stream: a port it couldn't bind, a dongle that keeps crashing, a serial
 * flash's outcome. Newest first; a notice that repeats is counted rather than
 * listed again. Each can be dismissed.
 */
import type { LocalNoticeLevel } from '../../api/types'
import { deviceLabel, useLocalSdrStore } from '../../stores/localSdrStore'

const store = useLocalSdrStore()

const LEVEL_LABELS: Record<LocalNoticeLevel, string> = {
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
}

function deviceName(deviceId: string): string {
  const device = store.devicesById[deviceId]
  return device ? deviceLabel(device) : deviceId
}
</script>

<style scoped>
.local-notice-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.local-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(var(--ink-rgb), 0.025);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
}
.local-notice-level {
  flex-shrink: 0;
  font-size: var(--settings-text-caption);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--ink-secondary);
}
.local-notice--error .local-notice-level {
  color: var(--danger);
}
.local-notice-message {
  flex: 1;
  color: var(--ink);
  overflow-wrap: anywhere;
}
.local-notice-repeat {
  color: var(--ink-secondary);
}
</style>
