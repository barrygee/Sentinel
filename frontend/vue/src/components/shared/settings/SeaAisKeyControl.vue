<template>
  <div class="settings-location-wrap">
    <p class="settings-location-status" aria-live="polite">{{ statusText }}</p>

    <p v-if="errorText" class="settings-location-notice" role="alert">{{ errorText }}</p>

    <div class="settings-location-fields">
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
          @keydown.enter="save"
        />
        <p :id="keyHintId" class="settings-location-hint">
          Free from aisstream.io. Kept on the server only — never shown again, never exported.
        </p>
      </div>
    </div>

    <div class="settings-location-actions sea-key-actions">
      <BaseButton variant="primary" :disabled="saving || keyDraft.trim().length < 8" @click="save">
        {{ saving ? 'SAVING…' : 'SAVE KEY' }}
      </BaseButton>
      <BaseButton
        v-if="keyStatus.configured && keyStatus.source === 'settings'"
        variant="ghost"
        bordered
        :disabled="saving"
        @click="clearKey"
      >
        FORGET KEY
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Settings › SEA › AISStream API Key.
 *
 * The key is a secret, so — unlike every other Sea setting — it never passes
 * through the generic settings API or the exported config. It is written to
 * its own endpoint the moment SAVE KEY is pressed (no APPLY CHANGES staging),
 * and the card only ever reports that a key is configured and where it came
 * from (this panel, or the server's `.env`), plus a short fingerprint so the
 * operator can tell one key from another.
 */
import { ref, computed, onMounted, useId } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import * as seaApi from '@/services/seaApi'

const keyInputId = useId()
const keyHintId = useId()

const keyDraft = ref('')
const saving = ref(false)
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

async function save(): Promise<void> {
  const key = keyDraft.value.trim()
  if (key.length < 8 || saving.value) return
  saving.value = true
  errorText.value = null
  const result = await seaApi.putAisKey(key)
  saving.value = false
  if (!result.ok) {
    errorText.value = result.error
    return
  }
  keyDraft.value = ''
  await refresh()
}

async function clearKey(): Promise<void> {
  saving.value = true
  errorText.value = null
  const result = await seaApi.deleteAisKey()
  saving.value = false
  if (!result.ok) {
    errorText.value = result.error
    return
  }
  await refresh()
}
</script>

<style scoped>
.sea-key-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
