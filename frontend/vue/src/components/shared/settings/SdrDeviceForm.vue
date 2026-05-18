<template>
  <div class="sdr-devices-accordion">
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">NAME</span>
      <input ref="nameRef" v-model="form.name" type="text" class="sdr-devices-form-input" placeholder="e.g. Roof RTL-SDR" autocomplete="off" spellcheck="false">
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">IP ADDRESS</span>
      <input v-model="form.host" type="text" class="sdr-devices-form-input" placeholder="192.168.1.x" autocomplete="off" spellcheck="false">
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">PORT</span>
      <input v-model.number="form.port" type="number" class="sdr-devices-form-input" placeholder="1234" min="1" max="65535">
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">BANDWIDTH (Hz)</span>
      <input v-model="form.bandwidth" type="number" class="sdr-devices-form-input" placeholder="e.g. 2048000" min="0">
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">RF GAIN (dB)</span>
      <input v-model="form.rfGain" type="number" class="sdr-devices-form-input" placeholder="e.g. 30" min="-1" max="49" step="0.5">
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">STATUS</span>
      <div class="sdr-devices-enabled-group">
        <button type="button" class="sdr-devices-enabled-btn" :class="{ 'is-active': form.enabled }" @click="form.enabled = true">ENABLED</button>
        <button type="button" class="sdr-devices-enabled-btn" :class="{ 'is-active': !form.enabled }" @click="form.enabled = false">DISABLED</button>
      </div>
    </div>
    <div class="sdr-devices-form-row sdr-devices-agc-row">
      <label class="sdr-devices-agc-label">
        <input v-model="form.agc" type="checkbox" class="sdr-devices-agc-input">
        <span class="sdr-devices-agc-box"></span>
        <span class="sdr-devices-agc-text">AGC (Automatic Gain Control)</span>
      </label>
    </div>
    <div v-if="errorMsg" class="sdr-devices-form-error">{{ errorMsg }}</div>
    <div class="sdr-devices-form-actions">
      <button type="button" class="sdr-devices-btn" @click="emit('cancel')">CANCEL</button>
      <button type="button" class="sdr-devices-btn sdr-devices-btn--primary" :disabled="saving" @click="save">SAVE</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface SdrRadioData {
  id: number; name: string; host: string; port: number;
  bandwidth: number | null; rf_gain: number | null; agc: boolean | null; enabled: boolean; description: string
}

const props = defineProps<{ radio: SdrRadioData | null }>()
const emit = defineEmits<{ save: []; cancel: [] }>()

const nameRef = ref<HTMLInputElement | null>(null)
const errorMsg = ref('')
const saving = ref(false)

const form = ref({
  name: props.radio?.name ?? '',
  host: props.radio?.host ?? '',
  port: props.radio?.port ?? 1234,
  bandwidth: props.radio?.bandwidth ?? null as number | null,
  rfGain: props.radio?.rf_gain ?? null as number | null,
  agc: props.radio?.agc === true,
  enabled: props.radio ? props.radio.enabled !== false : true,
})

onMounted(() => setTimeout(() => nameRef.value?.focus(), 0))

async function save(): Promise<void> {
  if (!form.value.name.trim() || !form.value.host.trim()) {
    errorMsg.value = 'Name and IP address are required.'
    return
  }
  const body = {
    name: form.value.name.trim(),
    host: form.value.host.trim(),
    port: form.value.port || 1234,
    bandwidth: form.value.bandwidth || null,
    rf_gain: form.value.rfGain ?? null,
    agc: form.value.agc,
    description: '',
    enabled: form.value.enabled,
  }
  const id = props.radio?.id ?? null
  const url = id !== null ? '/api/sdr/radios/' + id : '/api/sdr/radios'
  const method = id !== null ? 'PUT' : 'POST'
  saving.value = true
  errorMsg.value = ''
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { errorMsg.value = 'Save failed.'; return }
    emit('save')
  } catch { errorMsg.value = 'Network error.' }
  finally { saving.value = false }
}
</script>
