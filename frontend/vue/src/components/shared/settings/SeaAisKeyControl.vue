<template>
  <div class="settings-location-wrap">
    <p class="settings-location-status sea-key-status" aria-live="polite">{{ statusText }}</p>

    <p v-if="errorText" class="settings-location-notice" role="alert">{{ errorText }}</p>

    <div class="settings-location-fields sea-key-fields">
      <div class="settings-location-field">
        <label class="settings-location-label" :for="keyInputId">API KEY</label>
        <input
          :id="keyInputId"
          v-model="keyDraft"
          type="password"
          class="settings-location-input sea-key-input"
          :disabled="keyLocked"
          spellcheck="false"
          autocomplete="off"
          @input="onInput"
          @keydown.enter="emit('commit')"
        />
      </div>
    </div>

    <!-- One action: GET a key while none is saved, FORGET it once one is. A
         key from the server .env is neither — nothing to get, nothing here
         to forget. -->
    <div class="settings-location-actions sea-key-actions">
      <BaseButton
        v-if="keyStatus.configured && keyStatus.source === 'settings'"
        variant="ghost"
        bordered
        @click="stageForget"
        >FORGET KEY</BaseButton
      >
      <BaseButton v-else-if="!keyStatus.configured" variant="ghost" bordered @click="openKeyPage"
        >GET AIS API KEY</BaseButton
      >
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › SEA › AIS Data API Key (the aisstream.io key).
 *
 * The key is a secret, so — unlike every other Sea setting — it never passes
 * through the generic settings API or the exported config: the staged write
 * goes to the key's own endpoint. Like the other cards it is staged into
 * APPLY CHANGES rather than saved on its own button. The card only ever
 * reports that a key is configured and where it came from (this panel, or the
 * server's `.env`), plus a short fingerprint so one key can be told from
 * another.
 */
import { ref, computed, onMounted, useId } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import * as seaApi from '@/services/seaApi'
import { useDocumentEvent } from '@/composables/useDocumentEvent'

const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const keyInputId = useId()

const keyDraft = ref('')
const errorText = ref<string | null>(null)
const keyStatus = ref<seaApi.AisKeyStatus>({ configured: false, source: null, fingerprint: null })
const feedStatus = ref<string | null>(null)

/** A terse status label: the key's fingerprint (and its origin only when it
 *  came from the server .env, which the panel cannot forget), or none. */
const statusText = computed(() => {
  if (!keyStatus.value.configured) return 'No key · Sea map cannot receive vessels'
  const fingerprint = `Key ${keyStatus.value.fingerprint ?? ''}`.trim()
  return keyStatus.value.source === 'env' ? `${fingerprint} · from server .env` : fingerprint
})

/** The field is locked while a key saved here is in force: replace it by
 *  forgetting it first, so a key is never overwritten by accident. */
const keyLocked = computed(
  () => keyStatus.value.configured && keyStatus.value.source === 'settings',
)

/** aisstream.io's sign-in / API-key page, in a new tab. */
const AISSTREAM_KEY_PAGE = 'https://aisstream.io/authenticate'
function openKeyPage(): void {
  window.open(AISSTREAM_KEY_PAGE, '_blank', 'noopener,noreferrer')
}

async function refresh(): Promise<void> {
  keyStatus.value = await seaApi.getAisKeyStatus()
  const feed = await seaApi.getFeedStatus()
  feedStatus.value = feed?.status ?? null
}

onMounted(refresh)
// APPLY CHANGES closes the panel; re-read so a reopened card shows the new key.
useDocumentEvent('settings-panel-closed', () => void refresh())

/** Stage the typed key for APPLY CHANGES; a cleared field stages nothing. */
function onInput(): void {
  errorText.value = null
  const key = keyDraft.value.trim()
  emit('stage', async () => {
    if (key.length < 8) return
    const result = await seaApi.putAisKey(key)
    if (!result.ok) {
      errorText.value = result.error
      return
    }
    keyDraft.value = ''
    await refresh()
  })
}

/** Stage forgetting the saved key; the `.env` key, if any, applies again. */
function stageForget(): void {
  errorText.value = null
  emit('stage', async () => {
    const result = await seaApi.deleteAisKey()
    if (!result.ok) {
      errorText.value = result.error
      return
    }
    await refresh()
  })
}
</script>

<style scoped>
/* Status as a small caps label, matching the field labels beneath it. */
.sea-key-status {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
/* Left-aligned under the field, unlike the shared right-aligned row. */
.sea-key-actions {
  justify-content: flex-start;
}
/* A single key, not a coordinate pair: one full-width field rather than the
   location card's two columns. */
.sea-key-fields {
  grid-template-columns: minmax(0, 1fr);
  /* The same measure as the data-source URL field above it. */
  max-width: var(--settings-control-measure);
}
/* A key is ~40 characters, not a coordinate: the whole measure, not the
   location card's 220px rule. */
.sea-key-input {
  max-width: 100%;
}
</style>
