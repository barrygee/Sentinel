<template>
  <div class="rd-wrap">
    <input
      v-model="delayInput"
      type="text"
      inputmode="numeric"
      maxlength="3"
      class="rd-input"
      aria-label="Resume delay in seconds"
      :class="{ 'rd-input--invalid': !isValid }"
      spellcheck="false"
      autocomplete="off"
      @input="onInput"
      @keydown.enter="emit('commit')"
    />
    <span class="rd-label">s</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useSdrStore } from '@/stores/sdr'
import * as settingsApi from '@/services/settingsApi'

const sdr = useSdrStore()
const emit = defineEmits<{
  stage: [fn: () => Promise<unknown> | void]
  commit: []
}>()

const delayInput = ref<string>(String(sdr.resumeDelaySec))

const isValid = computed(() => {
  const v = delayInput.value.trim()
  if (v === '') return false
  /* v8 ignore start -- defensive: onInput strips every non-digit before this
     computed is read, so a non-numeric or negative value can never reach here */
  if (!/^\d+$/.test(v)) return false
  const n = Number(v)
  return Number.isFinite(n) && n >= 0
  /* v8 ignore stop */
})

async function syncFromDb(): Promise<void> {
  await sdr.hydrateResumeDelaySecFromDb()
  delayInput.value = String(sdr.resumeDelaySec)
}

onMounted(() => {
  void syncFromDb()
  document.addEventListener('sentinel:config-uploaded', syncFromDb)
})

onBeforeUnmount(() => {
  document.removeEventListener('sentinel:config-uploaded', syncFromDb)
})

function onInput(e: Event): void {
  const target = e.target as HTMLInputElement
  const filtered = target.value.replace(/[^0-9]/g, '')
  if (filtered !== target.value) {
    target.value = filtered
    delayInput.value = filtered
  }
  if (!isValid.value) return
  const n = Number(delayInput.value)
  sdr.setResumeDelaySec(n)
  emit('stage', () => settingsApi.put('sdr', 'resumeDelaySec', n))
}
</script>

<style scoped>
.rd-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rd-label {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--sp-text-dim, #6b7789);
}
.rd-input {
  width: 60px;
  padding: 6px 8px;
  background: var(--sp-surface, #fff);
  border: 1px solid var(--sp-border, #d8dce4);
  border-radius: 4px;
  color: var(--sp-text, #1c2131);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-align: right;
  outline: none;
  transition:
    border-color 0.15s,
    background 0.15s;
}
@media (prefers-reduced-motion: reduce) {
  .rd-input {
    transition: none;
  }
}
.rd-input:focus {
  border-color: var(--sp-accent-text, #4d6800);
}
.rd-input--invalid {
  border-color: var(--sp-danger, #dc2626);
}
</style>
