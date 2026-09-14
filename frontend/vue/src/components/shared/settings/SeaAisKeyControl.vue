<template>
  <div class="settings-location-wrap">
    <p class="settings-location-status" aria-live="polite">{{ statusText }}</p>

    <p v-if="errorText" class="settings-location-notice" role="alert">{{ errorText }}</p>

    <div class="settings-location-fields sea-key-fields">
      <div class="settings-location-field">
        <label class="settings-location-label" :for="keyInputId">API KEY</label>
        <input
          :id="keyInputId"
          v-model="keyDraft"
          type="password"
          class="settings-location-input"
          :aria-describedby="keyHintId"
          placeholder="paste your AISStream key"
          spellcheck="false"
          autocomplete="off"
          @input="onInput"
          @keydown.enter="emit('commit')"
        />
        <p :id="keyHintId" class="settings-location-hint">
          Get a free key at
          <a
            class="sea-key-link"
            href="https://aisstream.io"
            target="_blank"
            rel="noopener noreferrer"
            >aisstream.io</a
          >. Kept on the server only — never shown again, never exported.
        </p>
      </div>
    </div>

    <div
      v-if="keyStatus.configured && keyStatus.source === 'settings'"
      class="settings-location-actions"
    >
      <BaseButton variant="ghost" bordered @click="stageForget">FORGET KEY</BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › SEA › AISStream API Key.
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
const keyHintId = useId()

const keyDraft = ref('')
const errorText = ref<string | null>(null)
const keyStatus = ref<seaApi.AisKeyStatus>({ configured: false, source: null, fingerprint: null })
const feedStatus = ref<string | null>(null)

const statusText = computed(() => {
  if (!keyStatus.value.configured) return 'No key configured — the Sea map cannot receive vessels.'
  const origin = keyStatus.value.source === 'env' ? 'from the server .env' : 'saved here'
  const feed = feedStatus.value ? ` Feed: ${feedStatus.value.toUpperCase()}.` : ''
  return `Key ${keyStatus.value.fingerprint ?? ''} configured (${origin}).${feed}`
})

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
/* A single key, not a coordinate pair: one full-width field rather than the
   location card's two columns. */
.sea-key-fields {
  grid-template-columns: minmax(0, 1fr);
  max-width: 100%;
}
.sea-key-link {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.sea-key-link:hover,
.sea-key-link:focus-visible {
  color: rgba(16, 19, 29, 0.92);
}
</style>
