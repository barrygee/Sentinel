<template>
  <div class="sdr-clips-search-wrap">
    <input
      class="sdr-clips-search-input"
      type="text"
      placeholder="NOTES · MODE"
      autocomplete="off"
      spellcheck="false"
      v-model="clipsFilter"
    >
    <button
      v-if="clipsFilter"
      class="sdr-clips-search-clear"
      aria-label="Clear filter"
      @click="clipsFilter = ''"
    >✕</button>
  </div>
  <div class="sdr-clips-body">
    <div ref="clipsListWrapRef" id="sdr-clips-list-wrap" @scroll="updateScrollHint">
      <!-- Live recording row -->
      <div v-if="liveRecording" class="sdr-clip-row sdr-clip-live">
        <div class="sdr-clip-content">
          <div class="sdr-clip-head">
            <div class="sdr-clip-freq">
              <span class="sdr-clip-freq-num">{{ (liveRecording.frequency_hz / 1e6).toFixed(4) }}</span>
              <span class="sdr-clip-freq-unit">MHz</span>
              <span v-if="liveRecording.mode" class="sdr-clip-freq-mode">- {{ liveRecording.mode }}</span>
            </div>
            <span class="sdr-clip-live-status">
              <span class="sdr-clip-live-dot" :class="{ 'sdr-clip-live-dot--waiting': !recSquelchOpen }"></span>
              {{ recSquelchOpen ? 'Recording' : 'Waiting' }}
            </span>
          </div>
          <dl class="sdr-clip-meta">
            <div class="sdr-clip-meta-row">
              <dt>Date</dt>
              <dd>{{ liveRecording.startedAt }}</dd>
            </div>
            <div class="sdr-clip-meta-row">
              <dt>Duration</dt>
              <dd>{{ fmtDuration(liveElapsedS) }}</dd>
            </div>
            <div class="sdr-clip-meta-row">
              <dt>Size</dt>
              <dd>{{ fmtBytes(liveElapsedS * 96000) }}</dd>
            </div>
          </dl>
          <div class="sdr-clip-controls">
            <button class="sdr-clip-stop" title="Stop recording" aria-label="Stop recording" @click.stop="emit('stop-recording')">
              <svg width="11" height="11" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" rx="1"/></svg>
              STOP
            </button>
          </div>
        </div>
      </div>

      <!-- Saved clips -->
      <div
        v-for="c in filteredClips"
        :key="c.id"
        class="sdr-clip-row"
        :class="{ 'sdr-clip-playing': playingClipId === c.id }"
      >
        <div class="sdr-clip-content">
          <!-- Title: frequency in the radio readout style (big number + small unit).
               Edit / delete stay top-right as borderless glyphs. -->
          <div class="sdr-clip-head">
            <div class="sdr-clip-freq">
              <span class="sdr-clip-freq-num">{{ clipFreqNumber(c) }}</span>
              <span class="sdr-clip-freq-unit">MHz</span>
              <span v-if="c.mode" class="sdr-clip-freq-mode">- {{ c.mode }}</span>
            </div>
            <div class="sdr-clip-actions">
              <button class="sdr-clip-edit" :class="{ 'sdr-clip-edit--active': editingRecId === c.id }" data-tooltip="Edit" aria-label="Edit" @click.stop="toggleEditAccordion(c)">&#x270E;</button>
              <!-- Inline delete confirm: bin → check/cancel pair. Click bin to arm,
                   click again (✓) to confirm, ✕ to cancel. -->
              <template v-if="confirmDelId === c.id">
                <button class="sdr-clip-del sdr-clip-del--confirm" data-tooltip="Confirm delete" aria-label="Confirm delete" @click.stop="confirmInlineDelete(c)">
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M2.5 7.5l3 3 6-7"/>
                  </svg>
                </button>
                <button class="sdr-clip-del sdr-clip-del--cancel" data-tooltip="Cancel" aria-label="Cancel delete" @click.stop="confirmDelId = null">
                  <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
                    <path d="M3.5 3.5l7 7M10.5 3.5l-7 7"/>
                  </svg>
                </button>
              </template>
              <button v-else class="sdr-clip-del" data-tooltip="Delete" aria-label="Delete" @click.stop="confirmDelId = c.id">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2 3.5h10"/>
                  <path d="M5.5 3.5V2.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v1.3"/>
                  <path d="M3.2 3.5l.6 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.1"/>
                  <path d="M6 6v4M8 6v4"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Custom name (if any), radio freq-name style. -->
          <div v-if="clipCustomName(c)" class="sdr-clip-subname">{{ clipCustomName(c) }}</div>

          <dl class="sdr-clip-meta">
            <div class="sdr-clip-meta-row">
              <dt>Date</dt>
              <dd>{{ c.started_at ? c.started_at.replace('T', ' ').slice(0, 16) : '—' }}</dd>
            </div>
            <div class="sdr-clip-meta-row">
              <dt>Duration</dt>
              <dd>{{ fmtDuration(c.duration_s || 0) }}</dd>
            </div>
            <div class="sdr-clip-meta-row">
              <dt>Size</dt>
              <dd>{{ fmtBytes(c.file_size_bytes || 0) }}</dd>
            </div>
          </dl>

          <!-- Saved note (read-only) shown when present and not editing. The
               "NOTES" caption only appears when there is note text — mirroring
               the DATE/DURATION/SIZE meta labels. -->
          <div v-if="c.notes && editingRecId !== c.id" class="sdr-clip-note">
            <div class="sdr-clip-note-label">NOTES</div>
            <div class="sdr-clip-note-text">{{ c.notes }}</div>
          </div>

          <!-- Inline edit accordion: slides open between the meta and the play
               controls. Note only — flat input, no border box. -->
          <div v-if="editingRecId === c.id" class="sdr-clip-edit-panel" @click.stop>
            <div v-if="recmodNotes.trim()" class="sdr-clip-note-label">NOTES</div>
            <textarea
              ref="recmodNoteRef"
              class="sdr-clip-edit-note"
              rows="2"
              maxlength="250"
              placeholder="Add a note…"
              v-model="recmodNotes"
              @keydown.esc="closeEditAccordion"
            ></textarea>
            <div class="sdr-clip-edit-actions">
              <button class="sdr-panel-btn sdr-clip-edit-cancel" @click.stop="closeEditAccordion">CANCEL</button>
              <button class="sdr-panel-btn sdr-editfreq-save-btn sdr-clip-edit-save" @click.stop="saveEditAccordion">SAVE</button>
            </div>
          </div>

          <!-- Play + download (WAV/IQ) as pill buttons, beneath the meta. -->
          <div class="sdr-clip-controls">
            <button class="sdr-clip-play" :title="playingClipId === c.id ? 'Stop' : 'Play'" :aria-label="playingClipId === c.id ? 'Stop' : 'Play'" @click.stop="toggleClipPlay(c)">
              <svg v-if="playingClipId !== c.id" width="13" height="13" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><polygon points="2,1 9,5 2,9"/></svg>
              <svg v-else width="13" height="13" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><rect x="1.5" y="1.5" width="3" height="7"/><rect x="5.5" y="1.5" width="3" height="7"/></svg>
            </button>
            <button class="sdr-clip-export" title="Download WAV" aria-label="Download WAV" @click.stop="downloadClip(c, 'wav')">DOWNLOAD</button>
            <button v-if="c.has_iq_file" class="sdr-clip-iq" title="Download IQ" aria-label="Download IQ" @click.stop="downloadClip(c, 'iq')">IQ</button>
          </div>

          <!-- SIGNAL-style block progress bar (click to seek), shown while playing.
               Each block lights up as playback passes it; a CSS transition fades
               the colour so it animates cleanly block-by-block. -->
          <div v-if="playingClipId === c.id" class="sdr-clip-progress">
            <div class="sdr-clip-segments" @click.stop="seekClipBar" @mousedown.stop>
              <div
                v-for="i in CLIP_PROGRESS_SEGS"
                :key="i"
                class="sdr-clip-seg"
                :class="{ 'sdr-clip-seg--on': i <= clipLitSegs }"
              ></div>
            </div>
            <span class="sdr-clip-time">{{ fmtTime(clipCurrentTime) }} / {{ fmtTime(clipDuration) }}</span>
          </div>
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
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'

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

const emit = defineEmits<{
  (e: 'stop-recording'): void
  // Fired whenever a clip starts/stops playing so the parent can mute the live
  // SDR audio during playback (signal/waterfall/spectrum keep running).
  (e: 'playback-active', active: boolean): void
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

const playingClipId   = ref<number | null>(null)
const clipCurrentTime = ref(0)
const clipDuration    = ref(0)
const clipAudioRefs   = new Map<number, HTMLAudioElement>()
const clipProgressPct = computed(() =>
  clipDuration.value > 0
    ? Math.min(100, Math.max(0, (clipCurrentTime.value / clipDuration.value) * 100))
    : 0
)

// How many of the CLIP_PROGRESS_SEGS blocks are lit for the current position.
const clipLitSegs = computed(() =>
  Math.round((clipProgressPct.value / 100) * CLIP_PROGRESS_SEGS),
)

// Mute live SDR audio while any clip is playing; unmute when nothing plays.
watch(playingClipId, (id, prev) => {
  if ((id !== null) !== (prev !== null)) emit('playback-active', id !== null)
})

const clipsListWrapRef = ref<HTMLElement | null>(null)
const scrollHintRef    = ref<HTMLElement | null>(null)

// ── Inline edit accordion state ───────────────────────────────────────────────
// editingRecId is the clip whose edit panel is expanded (null = none open).

// recmodName holds the clip's existing name unchanged — the accordion only edits
// the note, but the PATCH endpoint requires a name, so we round-trip it.
const recmodName       = ref('')
const recmodNotes      = ref('')
const recmodNoteRef    = ref<HTMLTextAreaElement | null>(null)
const editingRecId     = ref<number | null>(null)

// ── Inline delete confirm ─────────────────────────────────────────────────────
// The clip whose bin icon is "armed" — swaps it for a ✓ / ✕ pair until confirmed.
const confirmDelId = ref<number | null>(null)

// Number of blocks in the SIGNAL-style progress bar (matches the radio meter feel).
const CLIP_PROGRESS_SEGS = 28

// ── Helpers ───────────────────────────────────────────────────────────────────

// The title is always the frequency in the big radio readout style. The numeric
// part and the "MHz" unit are split so they can be sized differently, mirroring
// .sdr-freq-input-large + .sdr-freq-unit.
function clipFreqNumber(c: SdrClip): string {
  return c.frequency_hz ? (c.frequency_hz / 1e6).toFixed(4) : '—'
}

// A custom, user-given name (if any) shown as a small sub-line under the freq.
// Strip any legacy auto-generated "Recording <date>" / "YYYY-MM-DD HH:MM ·" or a
// bare "<freq> MHz · MODE" so we only surface a real, meaningful name.
function clipCustomName(c: SdrClip): string {
  const stripped = (c.name || '')
    .replace(/^Recording\s+/i, '')
    .replace(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?:\s*·\s*)?/, '')
    .replace(/^\d+(?:\.\d+)?\s*MHz(?:\s*·\s*[A-Z]+)?$/i, '')
    .trim()
  return stripped
}

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
    // Seed duration from metadata if already loaded, else fall back to the
    // recorded duration_s so the end time is populated immediately.
    clipDuration.value = isFiniteDuration(a.duration) ? a.duration : (c.duration_s || 0)
    a.play()
  }
}

function isFiniteDuration(d: number): boolean {
  return Number.isFinite(d) && d > 0
}

function onAudioMeta(id: number): void {
  const a = clipAudioRefs.get(id); if (!a) return
  if (playingClipId.value === id && isFiniteDuration(a.duration)) clipDuration.value = a.duration
}

function onAudioTimeUpdate(id: number): void {
  if (playingClipId.value !== id) return
  const a = clipAudioRefs.get(id); if (!a) return
  clipCurrentTime.value = a.currentTime
  // Streamed WAVs may only expose a finite duration once playback begins.
  if (isFiniteDuration(a.duration) && a.duration !== clipDuration.value) clipDuration.value = a.duration
}

function onAudioEnded(id: number): void {
  if (playingClipId.value === id) { playingClipId.value = null; clipCurrentTime.value = 0 }
}

// Click anywhere on the block bar to seek to that fraction of the clip.
function seekClipBar(e: MouseEvent): void {
  if (playingClipId.value === null || clipDuration.value <= 0) return
  const a = clipAudioRefs.get(playingClipId.value); if (!a) return
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  a.currentTime = frac * clipDuration.value
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

// ── Inline edit accordion ─────────────────────────────────────────────────────

// Toggle the edit panel for a clip. Opening seeds the inputs from the clip and
// closes any other open panel; clicking the pencil again collapses it.
function toggleEditAccordion(c: SdrClip): void {
  if (editingRecId.value === c.id) { closeEditAccordion(); return }
  editingRecId.value = c.id
  recmodName.value   = c.name || ''
  recmodNotes.value  = c.notes || ''
  nextTick(() => recmodNoteRef.value?.focus())
}

function closeEditAccordion(): void { editingRecId.value = null }

async function saveEditAccordion(): Promise<void> {
  const name = recmodName.value.trim()
  if (!name || editingRecId.value === null) return
  try {
    await fetch(`/api/sdr/recordings/${editingRecId.value}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes: recmodNotes.value.trim() }),
    })
    closeEditAccordion()
    await reload()
  } catch (_) {}
}

// ── Delete recording ──────────────────────────────────────────────────────────

// Inline confirm: the bin was armed and the ✓ was clicked.
async function confirmInlineDelete(c: SdrClip): Promise<void> {
  confirmDelId.value = null
  try {
    await fetch(`/api/sdr/recordings/${c.id}`, { method: 'DELETE' })
    await reload()
  } catch (_) {}
}

// Expose reload so SdrPanel can trigger refresh after recording stops
defineExpose({ reload })
</script>
