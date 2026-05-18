<template>
  <!-- ── RECORDINGS section toggle ── -->
  <button
    class="sdr-group-toggle"
    :class="{ 'sdr-group-toggle-expanded': recordingsExpanded }"
    @click="recordingsExpanded = !recordingsExpanded"
  >
    <div class="sdr-scanner-section-left">
      <span class="sdr-group-toggle-icon">
        <ChevronIcon :stroke-width="1.5" />
      </span>
      <span class="sdr-group-toggle-label">RECORDINGS</span>
    </div>
    <span class="sdr-clips-count">{{ clips.length || '' }}</span>
  </button>
  <div class="sdr-group-body" :class="{ 'sdr-group-body-expanded': recordingsExpanded }">
    <div class="sdr-clips-search-row">
      <input
        class="sdr-panel-input sdr-clips-search-input"
        type="text"
        placeholder="Search clips…"
        autocomplete="off"
        v-model="clipsFilter"
      >
    </div>
    <div ref="clipsListWrapRef" id="sdr-clips-list-wrap" @scroll="updateScrollHint">
      <!-- Live recording row -->
      <div v-if="liveRecording" class="sdr-clip-row sdr-clip-live">
        <div class="sdr-clip-header">
          <span class="sdr-clip-live-dot" :class="{ 'sdr-clip-live-dot--waiting': !recSquelchOpen }"></span>
          <span class="sdr-clip-name">{{ recSquelchOpen ? 'Recording…' : 'Waiting for signal…' }}</span>
        </div>
        <div class="sdr-clip-live-meta">
          <span class="sdr-clip-live-mhz">{{ (liveRecording.frequency_hz / 1e6).toFixed(4) }} MHz</span>
          &nbsp;·&nbsp;
          <span class="sdr-clip-mode-inline">{{ liveRecording.mode }}</span>
          &nbsp;·&nbsp;
          <span class="sdr-clip-live-dur">{{ fmtDuration(liveElapsedS) }}</span>
          &nbsp;·&nbsp;
          <span class="sdr-clip-live-sz">{{ fmtBytes(liveElapsedS * 96000) }}</span>
        </div>
        <div class="sdr-clip-date">{{ liveRecording.startedAt }}</div>
      </div>

      <!-- Saved clips -->
      <div
        v-for="c in filteredClips"
        :key="c.id"
        class="sdr-clip-row"
        :class="{ 'sdr-clip-expanded': expandedClipId === c.id }"
      >
        <div class="sdr-clip-header" @click="toggleClipExpand(c.id)">
          <span class="sdr-clip-name">{{ c.name }}</span>
        </div>
        <div class="sdr-clip-summary">{{ (c.frequency_hz / 1e6).toFixed(4) }} MHz &nbsp;·&nbsp; {{ c.mode }} &nbsp;·&nbsp; {{ fmtDuration(c.duration_s || 0) }} &nbsp;·&nbsp; {{ fmtBytes(c.file_size_bytes || 0) }}</div>
        <div class="sdr-clip-body" :style="clipBodyStyle(c.id)">
          <div class="sdr-clip-meta">{{ (c.frequency_hz / 1e6).toFixed(4) }} MHz &nbsp;·&nbsp; {{ c.mode }} &nbsp;·&nbsp; {{ fmtDuration(c.duration_s || 0) }} &nbsp;·&nbsp; {{ fmtBytes(c.file_size_bytes || 0) }}</div>
          <div class="sdr-clip-date">{{ c.started_at ? c.started_at.replace('T', ' ').slice(0, 16) : '' }}</div>
          <div v-if="c.notes" class="sdr-clip-notes">{{ c.notes }}</div>
          <div class="sdr-clip-actions">
            <button class="sdr-clip-play-btn sdr-panel-btn" :title="playingClipId === c.id ? 'Stop' : 'Play'" @click="toggleClipPlay(c)">
              <svg v-if="playingClipId !== c.id" class="sdr-clip-btn-icon sdr-clip-play-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
              <svg v-else class="sdr-clip-btn-icon sdr-clip-stop-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1.5" y="1.5" width="3" height="7"/><rect x="5.5" y="1.5" width="3" height="7"/></svg>
            </button>
            <button class="sdr-clip-edit-btn sdr-panel-btn" title="Edit" @click="openEditRecModal(c)">
              <svg class="sdr-clip-btn-icon" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z"/></svg>
            </button>
            <button class="sdr-clip-export-btn sdr-panel-btn" title="Download WAV" @click="downloadClip(c, 'wav')">
              <svg class="sdr-clip-btn-icon" width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 1v6M2.5 7l3 3 3-3"/><line x1="1" y1="10" x2="10" y2="10"/></svg>
            </button>
            <button v-if="c.has_iq_file" class="sdr-clip-iq-btn sdr-panel-btn" title="Download IQ" @click="downloadClip(c, 'iq')">IQ</button>
            <button class="sdr-clip-del-btn sdr-panel-btn" title="Delete" @click="openDeleteRecModal(c)">
              <svg class="sdr-clip-btn-icon" width="10" height="11" viewBox="0 0 10 11" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M1 3h8M4 3V2h2v1M8 3l-.7 7H2.7L2 3"/></svg>
            </button>
          </div>
          <div v-if="playingClipId === c.id" class="sdr-clip-player" style="display:flex">
            <span class="sdr-clip-time-cur">{{ fmtTime(clipCurrentTime) }}</span>
            <input
              type="range"
              class="sdr-clip-seek sdr-panel-slider"
              :value="clipCurrentTime"
              :max="clipDuration"
              min="0" step="0.01"
              @input="seekClip"
            >
            <span class="sdr-clip-time-dur">{{ fmtTime(clipDuration) }}</span>
          </div>
          <audio
            :ref="el => setClipAudioRef(c.id, el as HTMLAudioElement | null)"
            :src="`/api/sdr/recordings/${c.id}/file`"
            style="display:none"
            @loadedmetadata="onAudioMeta(c.id)"
            @timeupdate="onAudioTimeUpdate(c.id)"
            @ended="onAudioEnded(c.id)"
          ></audio>
        </div>
      </div>

      <div v-if="!liveRecording && filteredClips.length === 0" id="sdr-clips-empty" class="sdr-panel-empty">
        No recordings yet.<br>Use the REC button while listening.
      </div>
    </div>
    <div ref="scrollHintRef" id="sdr-clips-scroll-hint" style="display:none">
      MORE
      <svg id="sdr-clips-scroll-arrow" width="8" height="8" viewBox="0 0 8 8" fill="none">
        <polyline points="1,2.5 4,5.5 7,2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  </div>

  <!-- ── EDIT RECORDING MODAL ── -->
  <div id="sdr-rec-modal" class="sdr-modal-overlay" :style="{ display: editRecModalOpen ? 'flex' : 'none' }" @click.self="closeEditRecModal">
    <div class="sdr-modal">
      <div class="sdr-modal-title">EDIT CLIP</div>
      <div class="sdr-modal-field">
        <label class="sdr-field-label">NAME</label>
        <input ref="recmodNameRef" id="sdr-recmod-name" class="sdr-panel-input sdr-modal-input" type="text" maxlength="120" v-model="recmodName">
      </div>
      <div class="sdr-modal-field">
        <label class="sdr-field-label">NOTES</label>
        <textarea id="sdr-recmod-notes" class="sdr-panel-input sdr-modal-input sdr-recmod-notes" rows="3" maxlength="500" placeholder="Optional notes…" v-model="recmodNotes"></textarea>
      </div>
      <div class="sdr-modal-actions">
        <button id="sdr-recmod-cancel" class="sdr-panel-btn" @click="closeEditRecModal">CANCEL</button>
        <button id="sdr-recmod-save" class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveEditRecModal">SAVE</button>
      </div>
    </div>
  </div>

  <!-- ── DELETE RECORDING MODAL ── -->
  <div id="sdr-rec-del-modal" class="sdr-modal-overlay" :style="{ display: deleteRecModalOpen ? 'flex' : 'none' }" @click.self="closeDeleteRecModal">
    <div class="sdr-modal">
      <div class="sdr-modal-title">DELETE CLIP?</div>
      <div id="sdr-recdelmod-msg" class="sdr-recdelmod-msg">{{ deleteRecMsg }}</div>
      <div class="sdr-modal-actions">
        <button id="sdr-recdelmod-cancel" class="sdr-panel-btn" @click="closeDeleteRecModal">CANCEL</button>
        <button id="sdr-recdelmod-confirm" class="sdr-panel-btn sdr-editfreq-del-btn" @click="confirmDeleteRec">DELETE</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'

interface SdrClip {
  id: number; name: string; notes: string; frequency_hz: number; mode: string;
  duration_s: number; file_size_bytes: number; started_at: string; has_iq_file: boolean;
  radio_id: number | null; radio_name: string
}

interface LiveRecording {
  frequency_hz: number
  mode: string
  startedAt: string
}

const props = defineProps<{
  liveRecording: LiveRecording | null
  recSquelchOpen: boolean
  liveElapsedS: number
}>()

// ── Clips state ───────────────────────────────────────────────────────────────

const clips        = ref<SdrClip[]>([])
const clipsFilter  = ref('')
const filteredClips = computed(() => {
  const q = clipsFilter.value.toLowerCase()
  if (!q) return clips.value
  return clips.value.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.notes || '').toLowerCase().includes(q) ||
    (c.radio_name || '').toLowerCase().includes(q) ||
    (c.mode || '').toLowerCase().includes(q)
  )
})

const expandedClipId   = ref<number | null>(null)
const recordingsExpanded = ref(true)

const playingClipId   = ref<number | null>(null)
const clipCurrentTime = ref(0)
const clipDuration    = ref(0)
const clipAudioRefs   = new Map<number, HTMLAudioElement>()

const clipsListWrapRef = ref<HTMLElement | null>(null)
const scrollHintRef    = ref<HTMLElement | null>(null)

// ── Edit recording modal state ────────────────────────────────────────────────

const editRecModalOpen = ref(false)
const recmodName       = ref('')
const recmodNotes      = ref('')
const recmodNameRef    = ref<HTMLInputElement | null>(null)
const editingRecId     = ref<number | null>(null)

// ── Delete recording modal state ──────────────────────────────────────────────

const deleteRecModalOpen = ref(false)
const deleteRecMsg       = ref('')
const deletingRecId      = ref<number | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDuration(s: number): string {
  const m = Math.floor(s / 60), sec = Math.round(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtBytes(b: number): string {
  if (b < 1024) return b + ' B'
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB'
  return (b / 1048576).toFixed(1) + ' MB'
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
}

// ── Clip loading ──────────────────────────────────────────────────────────────

async function reload(): Promise<void> {
  try {
    const res = await fetch('/api/sdr/recordings', { cache: 'no-store' })
    if (res.ok) clips.value = await res.json()
  } catch (_) {}
  nextTick(updateScrollHint)
}

// ── Clip playback ─────────────────────────────────────────────────────────────

function setClipAudioRef(id: number, el: HTMLAudioElement | null): void {
  if (el) clipAudioRefs.set(id, el)
  else clipAudioRefs.delete(id)
}

function toggleClipPlay(c: SdrClip): void {
  const a = clipAudioRefs.get(c.id)
  if (!a) return
  if (playingClipId.value === c.id) {
    a.pause(); a.currentTime = 0; playingClipId.value = null
  } else {
    if (playingClipId.value !== null) {
      const prev = clipAudioRefs.get(playingClipId.value)
      if (prev) { prev.pause(); prev.currentTime = 0 }
    }
    playingClipId.value = c.id
    clipCurrentTime.value = 0
    a.play()
  }
}

function onAudioMeta(id: number): void {
  const a = clipAudioRefs.get(id); if (!a) return
  if (playingClipId.value === id) clipDuration.value = a.duration || 0
}

function onAudioTimeUpdate(id: number): void {
  if (playingClipId.value !== id) return
  const a = clipAudioRefs.get(id); if (!a) return
  clipCurrentTime.value = a.currentTime
}

function onAudioEnded(id: number): void {
  if (playingClipId.value === id) { playingClipId.value = null; clipCurrentTime.value = 0 }
}

function seekClip(e: Event): void {
  if (playingClipId.value === null) return
  const a = clipAudioRefs.get(playingClipId.value); if (!a) return
  a.currentTime = parseFloat((e.target as HTMLInputElement).value)
}

function toggleClipExpand(id: number): void {
  expandedClipId.value = expandedClipId.value === id ? null : id
}

function clipBodyStyle(id: number): Record<string, string> {
  return expandedClipId.value === id ? { maxHeight: 'none' } : { maxHeight: '0' }
}

function downloadClip(c: SdrClip, type: 'wav' | 'iq'): void {
  const a = document.createElement('a')
  a.href     = type === 'wav' ? `/api/sdr/recordings/${c.id}/file` : `/api/sdr/recordings/${c.id}/iq`
  a.download = `${c.name}.${type === 'wav' ? 'wav' : 'u8'}`
  a.click()
}

// ── Scroll hint ───────────────────────────────────────────────────────────────

function updateScrollHint(): void {
  const wrap = clipsListWrapRef.value; const hint = scrollHintRef.value
  if (!wrap || !hint) return
  const hasOverflow = wrap.scrollHeight > wrap.clientHeight + 2
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 4
  hint.style.display = (hasOverflow && !atBottom) ? 'flex' : 'none'
}

// ── Edit recording modal ──────────────────────────────────────────────────────

function openEditRecModal(c: SdrClip): void {
  editingRecId.value = c.id
  recmodName.value   = c.name || ''
  recmodNotes.value  = c.notes || ''
  editRecModalOpen.value = true
  nextTick(() => recmodNameRef.value?.focus())
}

function closeEditRecModal(): void { editRecModalOpen.value = false; editingRecId.value = null }

async function saveEditRecModal(): Promise<void> {
  const name = recmodName.value.trim()
  if (!name || editingRecId.value === null) return
  try {
    await fetch(`/api/sdr/recordings/${editingRecId.value}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes: recmodNotes.value.trim() }),
    })
    closeEditRecModal()
    await reload()
  } catch (_) {}
}

// ── Delete recording modal ────────────────────────────────────────────────────

function openDeleteRecModal(c: SdrClip): void {
  deletingRecId.value  = c.id
  deleteRecMsg.value   = `Delete "${c.name}"? This cannot be undone.`
  deleteRecModalOpen.value = true
}

function closeDeleteRecModal(): void { deleteRecModalOpen.value = false; deletingRecId.value = null }

async function confirmDeleteRec(): Promise<void> {
  if (deletingRecId.value === null) return
  try {
    await fetch(`/api/sdr/recordings/${deletingRecId.value}`, { method: 'DELETE' })
    closeDeleteRecModal()
    await reload()
  } catch (_) {}
}

// Expose reload so SdrPanel can trigger refresh after recording stops
defineExpose({ reload, recordingsExpanded })
</script>
