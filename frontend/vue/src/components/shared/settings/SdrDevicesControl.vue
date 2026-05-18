<template>
  <div class="sdr-devices-wrap">
    <div class="sdr-devices-list">
      <div v-if="radios.length === 0" class="sdr-devices-empty">No SDRs configured. Add one below.</div>
      <div
        v-for="r in radios"
        :key="r.id"
        class="sdr-device-item"
        :class="{ 'sdr-device-item--open': openId === r.id }"
      >
        <div class="sdr-device-row">
          <span class="sdr-device-info" :style="confirmId === r.id ? 'opacity:0.4' : ''">
            <span
              class="sdr-status-dot"
              :class="{
                'sdr-status-dot--connected': statusMap[r.id] === true,
                'sdr-status-dot--disconnected': statusMap[r.id] === false
              }"
              :title="statusMap[r.id] === true ? 'Connected' : statusMap[r.id] === false ? 'Not connected' : 'Checking…'"
            ></span>
            {{ r.name }}&nbsp;&nbsp;{{ r.host }}:{{ r.port }}
          </span>
          <button
            v-if="confirmId !== r.id"
            class="sdr-device-btn"
            :class="{ 'sdr-device-btn--active': openId === r.id }"
            title="Edit"
            @click="toggleEdit(r.id)"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            v-if="confirmId !== r.id"
            class="sdr-device-btn sdr-device-btn--danger"
            title="Delete"
            @click="startDelete(r.id)"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <line x1="2.5" y1="2.5" x2="10.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="10.5" y1="2.5" x2="2.5" y2="10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <div v-if="confirmId === r.id" class="sdr-device-confirm" style="display:flex">
            <span class="sdr-device-confirm-label">DELETE?</span>
            <button class="sdr-device-confirm-btn sdr-device-confirm-btn--yes" @click="confirmDelete(r.id)">YES</button>
            <button class="sdr-device-confirm-btn" @click="confirmId = null">NO</button>
          </div>
        </div>
        <SdrDeviceForm
          v-if="openId === r.id"
          :radio="r"
          @save="onSave"
          @cancel="openId = null"
        />
      </div>

      <div v-if="openId === 'new'" class="sdr-device-item sdr-device-item--open sdr-device-item--new">
        <SdrDeviceForm
          :radio="null"
          @save="onSave"
          @cancel="openId = null"
        />
      </div>
    </div>
    <button class="sdr-devices-add-btn" @click="toggleNew">+ ADD SDR</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import SdrDeviceForm from './SdrDeviceForm.vue'

interface SdrRadioData {
  id: number; name: string; host: string; port: number;
  bandwidth: number | null; rf_gain: number | null; agc: boolean | null; enabled: boolean; description: string
}

const radios = ref<SdrRadioData[]>([])
const openId = ref<number | 'new' | null>(null)
const confirmId = ref<number | null>(null)
const statusMap = ref<Record<number, boolean | null>>({})

async function checkStatuses(ids: number[]): Promise<void> {
  await Promise.all(ids.map(async (id) => {
    try {
      const res = await fetch(`/api/sdr/status/${id}`)
      if (!res.ok) { statusMap.value[id] = false; return }
      const data = await res.json()
      statusMap.value[id] = data.connected === true
    } catch {
      statusMap.value[id] = false
    }
  }))
}

async function load(): Promise<void> {
  try {
    const res = await fetch('/api/sdr/radios')
    if (!res.ok) return
    const raw = await res.json()
    radios.value = (raw as SdrRadioData[]).map(r => ({ ...r, id: Number(r.id) }))
    await checkStatuses(radios.value.map(r => r.id))
  } catch {}
}

function toggleEdit(id: number): void {
  openId.value = openId.value === id ? null : id
  confirmId.value = null
}

function toggleNew(): void {
  openId.value = openId.value === 'new' ? null : 'new'
  confirmId.value = null
}

function startDelete(id: number): void {
  confirmId.value = id
  openId.value = null
}

async function confirmDelete(id: number): Promise<void> {
  try {
    const res = await fetch('/api/sdr/radios/' + id, { method: 'DELETE' })
    if (!res.ok) return
    confirmId.value = null
    await load()
    document.dispatchEvent(new CustomEvent('sdr:radios-changed'))
  } catch {}
}

async function onSave(): Promise<void> {
  openId.value = null
  await load()
  document.dispatchEvent(new CustomEvent('sdr:radios-changed'))
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function onRadiosChanged(): void { void load() }

onMounted(() => {
  void load()
  pollTimer = setInterval(() => {
    if (radios.value.length > 0) void checkStatuses(radios.value.map(r => r.id))
  }, 3000)
  document.addEventListener('sdr:radios-changed', onRadiosChanged)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null }
  document.removeEventListener('sdr:radios-changed', onRadiosChanged)
})
</script>

<style scoped>
.sdr-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background: #555;
  flex-shrink: 0;
  vertical-align: middle;
  position: relative;
  top: -1px;
}
.sdr-status-dot--connected {
  background: #22c55e;
}
.sdr-status-dot--disconnected {
  background: #ef4444;
}
</style>
