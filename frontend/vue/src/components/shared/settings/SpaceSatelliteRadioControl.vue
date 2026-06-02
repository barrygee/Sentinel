<template>
  <div class="tle-satlist-wrap">
    <div class="tle-satlist-body">
      <div class="settings-datasource-row tle-satlist-search-row">
        <span class="settings-datasource-label">SEARCH</span>
        <input
          v-model="searchQuery"
          type="text"
          class="settings-datasource-input"
          placeholder="Filter by name, NORAD ID or category…"
          spellcheck="false"
        >
      </div>
      <div class="tle-satlist-table">
        <div v-if="loading" class="tle-satlist-loading">Loading…</div>
        <div v-else-if="loadError" class="tle-satlist-loading">{{ loadError }}</div>
        <div v-else-if="allSats.length === 0" class="tle-satlist-loading">
          No satellites in the database. Import TLE data first.
        </div>
        <template v-else>
          <div v-for="sat in filteredSats" :key="sat.norad_id" class="satradio-row-wrap">
            <div
              class="tle-satlist-row satradio-row"
              :class="{ 'satradio-row--open': openId === sat.norad_id }"
              @click="toggle(sat)"
            >
              <span class="tle-satlist-name">{{ sat.name }}</span>
              <span class="tle-satlist-id">{{ sat.norad_id }}</span>
              <span class="satradio-has" :class="{ 'satradio-has--yes': hasRadio(sat) }">
                {{ hasRadio(sat) ? '● RF' : '—' }}
              </span>
              <span class="satradio-chevron" :class="{ 'satradio-chevron--open': openId === sat.norad_id }"></span>
            </div>
            <div v-if="openId === sat.norad_id && draft" class="satradio-form">
              <div class="satradio-grid">
                <label class="satradio-field">
                  <span class="satradio-label">UPLINK (Hz)</span>
                  <input v-model="draft.uplink_hz" class="settings-datasource-input" type="text" inputmode="numeric" placeholder="e.g. 145990000" spellcheck="false">
                </label>
                <label class="satradio-field satradio-field--narrow">
                  <span class="satradio-label">UPLINK MODE</span>
                  <input v-model="draft.uplink_mode" class="settings-datasource-input" type="text" placeholder="FM / SSB / CW" spellcheck="false">
                </label>
                <label class="satradio-field">
                  <span class="satradio-label">DOWNLINK (Hz)</span>
                  <input v-model="draft.downlink_hz" class="settings-datasource-input" type="text" inputmode="numeric" placeholder="e.g. 145800000" spellcheck="false">
                </label>
                <label class="satradio-field satradio-field--narrow">
                  <span class="satradio-label">DOWNLINK MODE</span>
                  <input v-model="draft.downlink_mode" class="settings-datasource-input" type="text" placeholder="FM / SSB / CW" spellcheck="false">
                </label>
                <label class="satradio-field">
                  <span class="satradio-label">BEACON (Hz)</span>
                  <input v-model="draft.beacon_hz" class="settings-datasource-input" type="text" inputmode="numeric" placeholder="e.g. 145825000" spellcheck="false">
                </label>
                <label class="satradio-field satradio-field--narrow">
                  <span class="satradio-label">CTCSS (Hz)</span>
                  <input v-model="draft.ctcss_hz" class="settings-datasource-input" type="text" inputmode="decimal" placeholder="e.g. 67.0" spellcheck="false">
                </label>
                <label class="satradio-field">
                  <span class="satradio-label">TRANSPONDER</span>
                  <input v-model="draft.transponder_type" class="settings-datasource-input" type="text" placeholder="FM / Linear / Digital…" spellcheck="false">
                </label>
                <label class="satradio-field satradio-field--narrow">
                  <span class="satradio-label">STATUS</span>
                  <input v-model="draft.radio_status" class="settings-datasource-input" type="text" placeholder="active / inactive / silent" spellcheck="false">
                </label>
              </div>
              <label class="satradio-field satradio-field--full">
                <span class="satradio-label">PACKET / DIGITAL</span>
                <input v-model="draft.packet_info" class="settings-datasource-input" type="text" placeholder="APRS / packet details; separate with ;" spellcheck="false">
              </label>
              <label class="satradio-field satradio-field--full">
                <span class="satradio-label">NOTES</span>
                <input v-model="draft.radio_notes" class="settings-datasource-input" type="text" placeholder="Free-form notes; separate with ;" spellcheck="false">
              </label>
              <div class="satradio-actions">
                <span v-if="saveError" class="satradio-error">{{ saveError }}</span>
                <button class="tle-action-btn" :disabled="saving" @click.stop="clearAll">CLEAR</button>
                <button class="tle-action-btn tle-action-btn--primary" :disabled="saving" @click.stop="save(sat)">
                  {{ saving ? 'SAVING…' : 'SAVE' }}
                </button>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div class="tle-satlist-count">{{ countLine }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { SATELLITE_CATEGORY_FULL_LABELS } from '../../../utils/satelliteUtils'
import { useDocumentEvent } from '../../../composables/useDocumentEvent'

type SatRow = {
  norad_id: string
  name: string
  category: string | null
  uplink_hz: number | null
  uplink_mode: string | null
  downlink_hz: number | null
  downlink_mode: string | null
  ctcss_hz: number | null
  transponder_type: string | null
  beacon_hz: number | null
  packet_info: string | null
  radio_status: string | null
  radio_notes: string | null
}

// String-backed editable mirror of the radio fields (inputs bind to strings).
type Draft = {
  uplink_hz: string
  uplink_mode: string
  downlink_hz: string
  downlink_mode: string
  ctcss_hz: string
  transponder_type: string
  beacon_hz: string
  packet_info: string
  radio_status: string
  radio_notes: string
}

const HZ_FIELDS = ['uplink_hz', 'downlink_hz', 'beacon_hz'] as const
const TEXT_FIELDS = ['uplink_mode', 'downlink_mode', 'transponder_type', 'packet_info', 'radio_status', 'radio_notes'] as const

const allSats = ref<SatRow[]>([])
const searchQuery = ref('')
const loading = ref(true)
const loadError = ref('')

const openId = ref('')
const draft = ref<Draft | null>(null)
const saving = ref(false)
const saveError = ref('')

const filteredSats = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return allSats.value
  return allSats.value.filter(s => {
    const catLabel = s.category ? (SATELLITE_CATEGORY_FULL_LABELS[s.category] ?? s.category) : ''
    return s.name.toLowerCase().includes(q) || s.norad_id.includes(q) || catLabel.toLowerCase().includes(q)
  })
})

const countLine = computed(() =>
  loading.value || loadError.value ? '' : `${filteredSats.value.length} of ${allSats.value.length} satellites`
)

function hasRadio(s: SatRow): boolean {
  return !!(s.uplink_hz || s.downlink_hz || s.beacon_hz || s.ctcss_hz ||
    s.transponder_type || s.packet_info || s.radio_status || s.radio_notes ||
    s.uplink_mode || s.downlink_mode)
}

function toDraft(s: SatRow): Draft {
  return {
    uplink_hz:        s.uplink_hz != null ? String(s.uplink_hz) : '',
    uplink_mode:      s.uplink_mode ?? '',
    downlink_hz:      s.downlink_hz != null ? String(s.downlink_hz) : '',
    downlink_mode:    s.downlink_mode ?? '',
    ctcss_hz:         s.ctcss_hz != null ? String(s.ctcss_hz) : '',
    transponder_type: s.transponder_type ?? '',
    beacon_hz:        s.beacon_hz != null ? String(s.beacon_hz) : '',
    packet_info:      s.packet_info ?? '',
    radio_status:     s.radio_status ?? '',
    radio_notes:      s.radio_notes ?? '',
  }
}

function toggle(s: SatRow): void {
  if (openId.value === s.norad_id) {
    openId.value = ''
    draft.value = null
    return
  }
  openId.value = s.norad_id
  draft.value = toDraft(s)
  saveError.value = ''
}

function clearAll(): void {
  if (!draft.value) return
  draft.value = {
    uplink_hz: '', uplink_mode: '', downlink_hz: '', downlink_mode: '',
    ctcss_hz: '', transponder_type: '', beacon_hz: '', packet_info: '',
    radio_status: '', radio_notes: '',
  }
}

/** Build the PATCH body, sending null for blanks (clears) and parsed numbers for Hz/CTCSS. */
function buildBody(noradId: string): Record<string, unknown> | string {
  const d = draft.value!
  const body: Record<string, unknown> = { norad_id: noradId }

  for (const f of HZ_FIELDS) {
    const raw = d[f].trim()
    if (raw === '') { body[f] = null; continue }
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0) return `${f.replace('_hz', '').toUpperCase()} must be a whole number of Hz`
    body[f] = n
  }

  const ctcss = d.ctcss_hz.trim()
  if (ctcss === '') body.ctcss_hz = null
  else {
    const n = Number(ctcss)
    if (!Number.isFinite(n) || n < 0) return 'CTCSS must be a number in Hz'
    body.ctcss_hz = n
  }

  for (const f of TEXT_FIELDS) {
    const v = d[f].trim()
    body[f] = v === '' ? null : v
  }
  return body
}

async function save(s: SatRow): Promise<void> {
  if (!draft.value) return
  const body = buildBody(s.norad_id)
  if (typeof body === 'string') { saveError.value = body; return }

  saving.value = true
  saveError.value = ''
  try {
    const resp = await fetch('/api/space/tle/radio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!resp.ok) throw new Error((await resp.json() as { error?: string }).error ?? resp.statusText)
    openId.value = ''
    draft.value = null
    await load()
    // Notify display panels (SpaceFilter / SpacePasses listen via tle:refreshStatus).
    document.dispatchEvent(new CustomEvent('tle:refreshStatus'))
  } catch (err) {
    saveError.value = 'Save failed: ' + (err as Error).message
  } finally {
    saving.value = false
  }
}

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const resp = await fetch('/api/space/tle/list')
    if (!resp.ok) throw new Error(resp.statusText)
    const data = await resp.json() as { satellites: SatRow[] }
    allSats.value = data.satellites
  } catch (err) {
    loadError.value = 'Failed to load: ' + (err as Error).message
  } finally {
    loading.value = false
  }
}

function onRefresh(): void { load() }

onMounted(() => { load() })
useDocumentEvent('tle:refreshStatus', onRefresh)
</script>

<style scoped>
.satradio-row {
  cursor: pointer;
  align-items: center;
}
.satradio-row--open {
  background: rgba(200, 255, 0, 0.06) !important;
}
.satradio-has {
  font-size: 10px;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.3);
  min-width: 34px;
  text-align: right;
}
.satradio-has--yes {
  color: #c8ff00;
}
.satradio-chevron {
  width: 8px;
  height: 8px;
  margin-left: 8px;
  border-right: 1.5px solid rgba(255, 255, 255, 0.5);
  border-bottom: 1.5px solid rgba(255, 255, 255, 0.5);
  transform: rotate(45deg);
  transition: transform 0.15s ease;
}
.satradio-chevron--open {
  transform: rotate(-135deg);
}
.satradio-form {
  padding: 12px 10px 14px;
  background: rgba(0, 0, 0, 0.25);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.satradio-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
}
.satradio-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.satradio-field--full {
  margin-top: 8px;
}
.satradio-label {
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.45);
}
.satradio-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.satradio-error {
  flex: 1;
  font-size: 11px;
  color: #ff6b6b;
}
</style>
