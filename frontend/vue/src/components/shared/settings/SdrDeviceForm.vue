<template>
  <div class="sdr-devices-accordion">
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">NAME</span>
      <input
        ref="nameRef"
        v-model="form.name"
        type="text"
        class="sdr-devices-form-input"
        aria-label="Device name"
        placeholder="e.g. Roof RTL-SDR"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">IP ADDRESS</span>
      <input
        v-model="form.host"
        type="text"
        class="sdr-devices-form-input"
        aria-label="IP address"
        placeholder="192.168.1.x"
        autocomplete="off"
        spellcheck="false"
      />
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">PORT</span>
      <input
        v-model.number="form.port"
        type="number"
        class="sdr-devices-form-input"
        aria-label="Port"
        placeholder="1234"
        min="1"
        max="65535"
      />
    </div>
    <div class="sdr-devices-form-row">
      <span class="sdr-devices-form-label">STATUS</span>
      <div class="sdr-devices-enabled-group">
        <BasePillToggle
          class="sdr-devices-enabled-btn"
          :active="form.enabled"
          active-class="is-active"
          @click="form.enabled = true"
        >
          ENABLED
        </BasePillToggle>
        <BasePillToggle
          class="sdr-devices-enabled-btn"
          :active="!form.enabled"
          active-class="is-active"
          @click="form.enabled = false"
        >
          DISABLED
        </BasePillToggle>
      </div>
    </div>
    <div v-if="errorMsg" class="sdr-devices-form-error">{{ errorMsg }}</div>
    <div class="sdr-devices-form-actions">
      <BaseButton
        type="button"
        variant="ghost"
        class="sdr-devices-btn"
        :style="GHOST_BUTTON_STYLE"
        @click="emit('cancel')"
        >CANCEL</BaseButton
      >
      <BaseButton
        type="button"
        variant="primary"
        class="sdr-devices-btn sdr-devices-btn--primary"
        :style="PRIMARY_BUTTON_STYLE"
        :disabled="saving"
        @click="save"
      >
        SAVE
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BasePillToggle from '@/components/base/BasePillToggle.vue'

// `.sdr-devices-btn`/`--primary` are smaller and dimmer than the default
// ghost/primary look (10px type, 8px/18px padding, auto height) — bridge those
// deltas via the established `--ba-*` custom-property hooks.
const GHOST_BUTTON_STYLE =
  '--ba-ghost-height: auto; --ba-ghost-padding: 8px 18px; --ba-ghost-font-size: 10px; ' +
  '--ba-ghost-color: rgba(16, 19, 29, 0.6); --ba-ghost-hover-color: rgba(16, 19, 29, 0.9)'
// The original `.sdr-devices-btn--primary` never had a disabled visual
// treatment at all (unlike BaseButton's shared dimmed/not-allowed default),
// so `saving` never visibly dims this SAVE button — preserve that.
const PRIMARY_BUTTON_STYLE =
  '--ba-primary-padding: 8px 18px; --ba-primary-font-size: 10px; ' +
  '--ba-primary-font-weight: 600; --ba-primary-letter-spacing: 0.16em; ' +
  '--ba-disabled-opacity: 1; --ba-disabled-cursor: default'

interface SdrRadioData {
  id: number
  name: string
  host: string
  port: number
  bandwidth: number | null
  rf_gain: number | null
  agc: boolean | null
  enabled: boolean
  description: string
}

const props = defineProps<{ radio: SdrRadioData | null }>()
const emit = defineEmits<{ save: []; cancel: [] }>()

const nameRef = ref<HTMLInputElement | null>(null)
const errorMsg = ref('')
const saving = ref(false)

const form = ref({
  name: props.radio?.name ?? '',
  host: props.radio?.host ?? '',
  port: props.radio?.port ?? (null as number | null),
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
    // Bandwidth / RF gain / AGC are no longer edited in this form; preserve any
    // existing stored values on edit so saving name/host/port doesn't wipe them.
    bandwidth: props.radio?.bandwidth ?? null,
    rf_gain: props.radio?.rf_gain ?? null,
    agc: props.radio?.agc ?? null,
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
    if (!res.ok) {
      errorMsg.value = 'Save failed.'
      return
    }
    emit('save')
  } catch {
    errorMsg.value = 'Network error.'
  } finally {
    saving.value = false
  }
}
</script>
