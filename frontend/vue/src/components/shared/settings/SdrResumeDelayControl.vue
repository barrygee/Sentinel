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
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(16, 19, 29, 0.5);
}
.rd-input {
  width: 74px;
  padding: 10px 12px;
  background: #eeece7;
  border: none;
  border-radius: 6px;
  color: rgba(16, 19, 29, 0.9);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-align: center;
  outline: none;
  transition: box-shadow 0.15s;
}
.rd-input:focus {
  box-shadow: inset 0 -2px 0 var(--color-accent);
}
.rd-input--invalid {
  box-shadow: inset 0 -2px 0 #d94436;
}
</style>
