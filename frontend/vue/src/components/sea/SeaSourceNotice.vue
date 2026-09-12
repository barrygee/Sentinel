<template>
  <div v-if="message" class="sea-source-notice" role="status">
    <p class="sea-source-notice-message">{{ message }}</p>
    <button
      v-if="showSettings"
      type="button"
      class="sea-source-notice-action"
      @click="settingsStore.openPanel('sea')"
    >
      Open settings
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * Says why the Sea map is empty, when it is empty for a reason the operator
 * can act on — the AISStream key is missing or rejected, the feed is down, or
 * the backend cannot be reached. Mirrors AdsbSourceNotice: only rendered when
 * there is something to say; a live feed needs no announcement.
 */
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { SeaFeedInfo } from '@/stores/sea'

const props = defineProps<{ feed: SeaFeedInfo }>()
const settingsStore = useSettingsStore()

const showSettings = computed(() =>
  ['missing-key', 'auth-failed', 'no-source', 'unsupported-source', 'disabled'].includes(
    props.feed.status,
  ),
)

const message = computed<string | null>(() => {
  const { status, error, reconnectAttempt } = props.feed
  switch (status) {
    case 'missing-key':
      return 'No AISStream API key configured — add one in Settings › SEA to receive live vessels.'
    case 'auth-failed':
      return `AISStream rejected the API key${error ? ` (${error})` : ''}. Check the key in Settings › SEA.`
    case 'disabled':
      return 'The Sea domain is switched off in Settings › SEA.'
    case 'no-source':
      return 'Off Grid mode is active but no Off Grid data source is set for SEA.'
    case 'unsupported-source':
      return error ?? 'The configured Sea data source is not a supported AIS feed.'
    case 'down':
      return `The AIS feed is down${error ? ` — ${error}` : ''}. Retrying every 15 minutes; cached vessels may be stale.`
    case 'reconnecting':
      return `Reconnecting to the AIS feed (attempt ${reconnectAttempt})${error ? ` — ${error}` : ''}. Cached vessels may be stale.`
    case 'stale':
      return `No AIS traffic received recently${error ? ` — ${error}` : ''}. Vessels shown may be stale.`
    case 'unreachable':
      return 'Cannot reach the Sentinel backend — vessels shown are the last received.'
    default:
      return null
  }
})
</script>

<style scoped>
.sea-source-notice {
  position: absolute;
  /* #map-wrap is not a positioning context, so measure from the page: just
     below the top nav, over the map. */
  top: calc(var(--nav-height) + 12px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(560px, calc(100vw - 24px));
  padding: 10px 14px;
  border-radius: 4px;
  /* The warn fill rather than danger: nothing is broken and no data is lost —
     the map is simply not receiving yet, and the operator can usually fix it. */
  background: var(--color-warn-fill, #f0c419);
  color: var(--color-ink-on-accent, #0a0c10);
  font-size: 12.5px;
  line-height: 1.55;
  box-shadow: 0 2px 8px rgb(0 0 0 / 25%);
}
.sea-source-notice-message {
  margin: 0;
}
.sea-source-notice-action {
  flex-shrink: 0;
  padding: 6px 12px;
  border: none;
  border-radius: 3px;
  background: var(--color-ink-on-accent, #0a0c10);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
}
.sea-source-notice-action:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}
</style>
