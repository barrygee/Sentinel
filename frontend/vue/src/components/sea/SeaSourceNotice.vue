<template>
  <!-- A feed that cannot deliver anything (no key, rejected key, domain off,
       no source) takes the section over with the same full-screen card the
       URL gate uses; a feed that is merely degraded keeps the map — its cached
       vessels are still useful — and says so in a banner. -->
  <NoDataOverlay
    v-if="blocking"
    domain="sea"
    :title="blocking.title"
    :message="blocking.message"
    @open-settings="settingsStore.openPanel('sea')"
  />
  <div v-else-if="degradedMessage" class="sea-source-notice" role="status">
    <p class="sea-source-notice-message">{{ degradedMessage }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Says why the Sea map is empty, when it is empty for a reason the operator
 * can act on. What those reasons ARE depends on where the vessels come from,
 * so the messages are split by `feed.mode`: online it is the AISStream key or
 * the upstream connection; off grid there is no key and no upstream at all,
 * and the answer is a missing receiver, a stopped decoder container, or a
 * radio that has been tuned away from the AIS channels. Only rendered when
 * there is something to say; a live feed needs no announcement.
 */
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { SeaFeedInfo } from '@/stores/sea'
import NoDataOverlay from '@/components/shared/NoDataOverlay.vue'

const props = defineProps<{ feed: SeaFeedInfo }>()
const settingsStore = useSettingsStore()

/** True when the picture comes from the SDR decoder rather than AISStream. */
const isOffgrid = computed(() => props.feed.mode === 'offgrid')

/** The full-screen card for states in which no vessel can ever arrive. */
const blocking = computed<{ title: string; message: string } | null>(() => {
  const { status, error } = props.feed
  // Off grid there is no API key and no upstream to reconnect to, so the
  // key/auth states cannot occur and 'no-source' means something different:
  // no radio has been designated as the AIS receiver.
  if (isOffgrid.value) {
    if (status !== 'no-source') return null
    return {
      title: 'No off-grid AIS receiver selected.',
      message:
        'Off Grid mode is active, so vessels are decoded from an SDR rather than AISStream. Choose the receiver under Settings › SEA › AIS › Off Grid SDR to continue.',
    }
  }
  switch (status) {
    case 'missing-key':
      return {
        title: 'No AISStream API key configured.',
        message:
          'Live vessels come from AISStream.io, which needs a free API key. Add yours under Settings › SEA › AISStream API Key to continue.',
      }
    case 'auth-failed':
      return {
        title: 'AISStream rejected the API key.',
        message: `${error ? `${error}. ` : ''}Check the key under Settings › SEA › AISStream API Key — it is retried once an hour, or straight away once the key changes.`,
      }
    case 'disabled':
      return {
        title: 'Sea domain is switched off.',
        message: 'The Sea domain is disabled in settings. Enable it to receive live vessels.',
      }
    case 'no-source':
      return {
        title: 'No data source configured.',
        message:
          'Off Grid mode is active but no Off Grid Data Source has been set for SEA. Configure a source in settings or switch connectivity mode to continue.',
      }
    case 'unsupported-source':
      return {
        title: 'Unsupported data source.',
        message:
          error ??
          'The configured Sea data source is not a supported AIS feed. Use an AISStream wss:// URL.',
      }
    default:
      return null
  }
})

/** The banner for a feed that is degraded but still has cached vessels. */
const degradedMessage = computed<string | null>(() => {
  const { status, error, reconnectAttempt } = props.feed
  if (isOffgrid.value) {
    switch (status) {
      case 'down':
        return `The AIS decoder is not running${error ? ` — ${error}` : ''}. Start it with \`docker compose --profile ais up -d\`; vessels shown may be stale.`
      case 'stale':
        return `The AIS receiver has been tuned away from the AIS channels${error ? ` — ${error}` : ''}. It retunes itself within about 15 seconds; vessels shown may be stale.`
      case 'unreachable':
        return 'Cannot reach the Sentinel backend — vessels shown are the last received.'
      default:
        return null
    }
  }
  switch (status) {
    case 'down':
      return `The AIS feed is down${error ? ` — ${error}` : ''}. Retrying every 15 minutes; vessels shown may be stale.`
    case 'reconnecting':
      return `Reconnecting to the AIS feed (attempt ${reconnectAttempt})${error ? ` — ${error}` : ''}. Vessels shown may be stale.`
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
</style>
