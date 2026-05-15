<template>
  <div class="tle-manual-wrap">
    <div
      class="chirp-dropzone"
      :class="{ 'chirp-dropzone--over': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <span class="chirp-dropzone-text">
        Drop a Sentinel <strong>.json</strong> file here
      </span>
      <span class="chirp-dropzone-sub">Each entry needs <strong>frequency_hz</strong> plus optional label, mode, notes — populates the frequency manager</span>
    </div>

    <div class="tle-file-row">
      <input
        id="chirp-file-input"
        type="file"
        accept=".json,application/json"
        class="tle-file-input"
        @change="onFileChange"
      >
      <label for="chirp-file-input" class="tle-file-label">CHOOSE FILE</label>
      <span class="tle-file-name">{{ fileName }}</span>
    </div>

    <div class="tle-cat-row-ctrl">
      <span class="settings-datasource-label tle-inline-label">GROUP</span>
      <input
        v-model="groupName"
        class="chirp-group-input"
        type="text"
        maxlength="40"
        placeholder="Optional — e.g. Aviation"
        list="chirp-group-list"
      >
      <datalist id="chirp-group-list">
        <option v-for="g in existingGroups" :key="g.id" :value="g.name" />
      </datalist>
      <button
        class="tle-action-btn tle-action-btn--primary"
        :disabled="applyLoading || parsed.length === 0"
        @click="apply"
      >{{ applyLoading ? 'IMPORTING…' : `IMPORT ${parsed.length || ''}`.trim() }}</button>
    </div>

    <div v-if="parsed.length > 0" class="chirp-preview">
      {{ parsed.length }} valid frequenc{{ parsed.length === 1 ? 'y' : 'ies' }} parsed{{ parseSkipped > 0 ? ` · ${parseSkipped} entr(y/ies) skipped (no frequency / unsupported mode)` : '' }}
    </div>

    <div class="tle-status-line">
      <span v-if="statusMsg" class="tle-status-badge" :class="'tle-status-badge--' + statusType">{{ statusMsg }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface ParsedFreq {
  label: string
  frequency_hz: number
  mode: string
  notes: string
}

interface SdrGroup { id: number; name: string }

const VALID_MODES = new Set(['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW'])

const fileName = ref('No file selected')
const groupName = ref('')
const parsed = ref<ParsedFreq[]>([])
const parseSkipped = ref(0)
const applyLoading = ref(false)
const dragOver = ref(false)
const statusMsg = ref('')
const statusType = ref<'ok' | 'error' | 'info'>('ok')
const existingGroups = ref<SdrGroup[]>([])

onMounted(async () => {
  try {
    const res = await fetch('/api/sdr/groups')
    if (res.ok) existingGroups.value = await res.json()
  } catch { /* groups are optional for the datalist */ }
})

function resetStatus(): void {
  statusMsg.value = ''
}

/** Coerce a value that may be a number or numeric string into integer Hz. */
function toHz(raw: unknown): number | null {
  if (raw == null) return null
  const v = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^\d.]/g, ''))
  if (isNaN(v) || v <= 0) return null
  return Math.round(v)
}

/**
 * Parse the app's native frequency JSON.
 *
 * Accepts either a bare array or { "frequencies": [...] }. Each entry must
 * provide frequency_hz (integer Hz), plus optional label, mode and notes —
 * the exact shape the /api/sdr/frequencies/import endpoint consumes.
 */
function parseSentinelJson(text: string): { rows: ParsedFreq[]; skipped: number } {
  let data: unknown
  try { data = JSON.parse(text) } catch { throw new Error('Invalid JSON') }
  const arr = Array.isArray(data)
    ? data
    : (data && typeof data === 'object' && Array.isArray((data as { frequencies?: unknown[] }).frequencies))
      ? (data as { frequencies: unknown[] }).frequencies
      : null
  if (!arr) throw new Error('JSON must be an array of frequencies or { "frequencies": [...] }')

  const rows: ParsedFreq[] = []
  let skipped = 0
  for (const raw of arr) {
    const r = raw as Record<string, unknown>
    const hz = toHz(r.frequency_hz)
    const mode = String(r.mode ?? 'AM').toUpperCase().trim()
    if (hz === null || !VALID_MODES.has(mode)) { skipped++; continue }
    const label = String(r.label ?? '').trim()
    rows.push({
      label: label || `${(hz / 1e6).toFixed(4)} MHz`,
      frequency_hz: hz,
      mode,
      notes: String(r.notes ?? '').trim(),
    })
    // A per-file group from JSON pre-fills the group field if the user hasn't set one
    if (!groupName.value && typeof r.group === 'string' && r.group.trim()) {
      groupName.value = r.group.trim()
    }
  }
  return { rows, skipped }
}

function ingest(name: string, text: string): void {
  resetStatus()
  parsed.value = []
  parseSkipped.value = 0
  fileName.value = name
  if (!name.toLowerCase().endsWith('.json')) {
    statusMsg.value = 'Unsupported file — drop a Sentinel .json file'
    statusType.value = 'error'
    return
  }
  try {
    const { rows, skipped } = parseSentinelJson(text)
    parsed.value = rows
    parseSkipped.value = skipped
    if (rows.length === 0) {
      statusMsg.value = 'No valid frequencies found in JSON'
      statusType.value = 'error'
    }
  } catch (err) {
    statusMsg.value = 'Parse error: ' + (err as Error).message
    statusType.value = 'error'
  }
}

function readFile(file: File): void {
  const reader = new FileReader()
  reader.onload = (ev) => ingest(file.name, (ev.target?.result as string) ?? '')
  reader.readAsText(file)
}

function onFileChange(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) readFile(file)
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) readFile(file)
}

async function apply(): Promise<void> {
  if (parsed.value.length === 0) {
    statusMsg.value = 'Choose or drop a file first'
    statusType.value = 'error'
    return
  }
  applyLoading.value = true
  resetStatus()
  try {
    const resp = await fetch('/api/sdr/frequencies/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group: groupName.value.trim() || null,
        frequencies: parsed.value,
      }),
    })
    const data = await resp.json() as {
      inserted?: number; skipped?: number; invalid?: number
      total?: number; group?: string | null; error?: string
    }
    if (!resp.ok) throw new Error(data.error || resp.statusText)
    const parts = [`${data.inserted ?? 0} imported`]
    if (data.skipped) parts.push(`${data.skipped} duplicate(s) skipped`)
    if (data.invalid) parts.push(`${data.invalid} invalid`)
    if (data.group) parts.push(`group "${data.group}"`)
    statusMsg.value = parts.join(' · ')
    statusType.value = 'ok'
    parsed.value = []
    parseSkipped.value = 0
    fileName.value = 'No file selected'
    document.dispatchEvent(new CustomEvent('sdr:frequenciesImported'))
  } catch (err) {
    statusMsg.value = 'Error: ' + (err as Error).message
    statusType.value = 'error'
  } finally {
    applyLoading.value = false
  }
}
</script>

<style scoped>
.chirp-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  padding: 22px 16px;
  border: 1px dashed rgba(255, 255, 255, 0.22);
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.03);
  text-align: center;
  transition: background 0.15s, border-color 0.15s;
}
.chirp-dropzone--over {
  border-color: #c8ff00;
  background: rgba(200, 255, 0, 0.07);
}
.chirp-dropzone-text {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.04em;
}
.chirp-dropzone-text strong { color: rgba(255, 255, 255, 0.92); }
.chirp-dropzone-sub {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.03em;
}
.chirp-group-input {
  flex: 1;
  height: 37px;
  min-width: 0;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.05);
  border: none;
  color: rgba(255, 255, 255, 0.85);
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 12px;
  letter-spacing: 0.04em;
  outline: none;
}
.chirp-group-input::placeholder { color: rgba(255, 255, 255, 0.3); }
.chirp-preview {
  margin-top: 10px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.03em;
}
.chirp-preview strong { color: rgba(255, 255, 255, 0.8); }
</style>
