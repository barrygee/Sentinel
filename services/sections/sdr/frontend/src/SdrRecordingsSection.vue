<template>
  <SdrRecordingsFilter v-model="filterText" />
  <div class="sdr-recordings-body">
    <BaseList
      id="sdr-recordings-list-wrap"
      ref="recordingsListWrapRef"
      :is-empty="!liveRecording && filteredRecordings.length === 0"
      empty-text="No recordings."
      @scroll="updateScrollHint"
    >
      <template #empty>
        <div id="sdr-recordings-empty" class="sdr-panel-empty">No recordings.</div>
      </template>
      <SdrLiveRecordingRow
        v-if="liveRecording"
        :recording="liveRecording"
        :squelch-open="recSquelchOpen"
        :elapsed-seconds="liveElapsedS"
        @stop="emit('stop-recording')"
      />
      <SdrRecordingRow
        v-for="recording in filteredRecordings"
        :key="recording.id"
        v-model:note-draft="noteDraft"
        :recording="recording"
        :editing="editingRecordingId === recording.id"
        :focus-editor-on-mount="focusEditorRecordingId === recording.id"
        :delete-armed="deleteArmedRecordingId === recording.id"
        :playing="playback.playingRecordingId.value === recording.id"
        :current-time-seconds="playback.currentTimeSeconds.value"
        :duration-seconds="playback.durationSeconds.value"
        :register-audio-element="(element) => playback.setAudioElement(recording.id, element)"
        @toggle-edit="toggleEditor(recording)"
        @close-edit="closeEditor"
        @save-edit="saveEditor"
        @editor-focused="focusEditorRecordingId = null"
        @arm-delete="deleteArmedRecordingId = recording.id"
        @cancel-delete="deleteArmedRecordingId = null"
        @confirm-delete="confirmDelete(recording)"
        @toggle-play="playback.togglePlay(recording)"
        @seek="playback.seekToFraction"
        @audio-metadata="playback.onAudioMetadata(recording.id)"
        @audio-time-update="playback.onAudioTimeUpdate(recording.id)"
        @audio-ended="playback.onAudioEnded(recording.id)"
      />
    </BaseList>
    <div id="sdr-recordings-scroll-hint" ref="scrollHintRef" style="display: none">
      MORE
      <ScrollHintChevronIcon id="sdr-recordings-scroll-arrow" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The RECORDINGS tab: the filter box, the live recording (while REC runs) and
 * the saved recordings, with a MORE hint while the list scrolls further. It
 * owns which row is editing, which bin is armed and what is playing — one of
 * each at a time — and exposes `reload` for the panel to call once a
 * recording stops.
 */
import './SdrRecordingsSection.css'
import { ref } from 'vue'
import ScrollHintChevronIcon from '@sentinel/ui/icons/ScrollHintChevronIcon.vue'
import BaseList from '@sentinel/ui/base/BaseList.vue'
import SdrRecordingsFilter from './SdrRecordingsFilter.vue'
import SdrLiveRecordingRow from './SdrLiveRecordingRow.vue'
import SdrRecordingRow from './SdrRecordingRow.vue'
import { useRecordingsList } from './composables/useRecordingsList'
import { useRecordingPlayback } from './composables/useRecordingPlayback'
import type { LiveRecording, SdrRecording } from './sdrRecordings'

defineProps<{
  liveRecording: LiveRecording | null
  recSquelchOpen: boolean
  liveElapsedS: number
}>()

const emit = defineEmits<{
  (e: 'stop-recording'): void
  // Fired whenever a recording starts/stops playing so the parent can mute the live
  // SDR audio during playback (signal/waterfall/spectrum keep running).
  (e: 'playback-active', active: boolean): void
}>()

const { filterText, filteredRecordings, reload } = useRecordingsList(updateScrollHint)
const playback = useRecordingPlayback((active) => emit('playback-active', active))

// A BaseList component ref — the scroll-hint below reads its exposed
// `scrollContainer` (the list's root scrolling element) rather than owning its
// own div ref, per the convention documented on BaseList.
const recordingsListWrapRef = ref<InstanceType<typeof BaseList> | null>(null)
const scrollHintRef = ref<HTMLElement | null>(null)

// The recording whose note editor is open (null = none), and that editor's
// draft. editingRecordingName holds the recording's existing name unchanged —
// the editor only edits the note, but the PATCH endpoint requires a name, so
// it is round-tripped.
const editingRecordingId = ref<number | null>(null)
const editingRecordingName = ref('')
const noteDraft = ref('')
// Set when the pencil opens an editor, cleared once its input has taken focus,
// so a later remount (the row filtered out and back) does not steal focus.
const focusEditorRecordingId = ref<number | null>(null)
// The recording whose bin icon is "armed" — swaps it for a ✓ / ✕ pair until confirmed.
const deleteArmedRecordingId = ref<number | null>(null)

// ── Scroll hint ───────────────────────────────────────────────────────────────

function updateScrollHint(): void {
  const wrap = recordingsListWrapRef.value?.scrollContainer
  const hint = scrollHintRef.value
  /* v8 ignore start -- defensive: both elements are always present in the template (not
     behind a v-if), so the refs are set whenever this runs. */
  if (!wrap || !hint) return
  /* v8 ignore stop */
  const hasOverflow = wrap.scrollHeight > wrap.clientHeight + 2
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 4
  hint.style.display = hasOverflow && !atBottom ? 'flex' : 'none'
}

// ── Note editor ───────────────────────────────────────────────────────────────

// Opening one row's editor closes any other; clicking the pencil again collapses it.
function toggleEditor(recording: SdrRecording): void {
  if (editingRecordingId.value === recording.id) {
    closeEditor()
    return
  }
  editingRecordingId.value = recording.id
  editingRecordingName.value = recording.name || ''
  noteDraft.value = recording.notes || ''
  focusEditorRecordingId.value = recording.id
}

function closeEditor(): void {
  editingRecordingId.value = null
}

async function saveEditor(): Promise<void> {
  const name = editingRecordingName.value.trim()
  if (!name) return
  /* v8 ignore start -- editingRecordingId is non-null whenever the SAVE button (its only
     caller) is rendered; this guard exists to narrow the type for the request URL below. */
  if (editingRecordingId.value === null) return
  /* v8 ignore stop */
  try {
    await fetch(`/api/sdr/recordings/${editingRecordingId.value}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, notes: noteDraft.value.trim() }),
    })
    closeEditor()
    await reload()
  } catch (_) {}
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Inline confirm: the bin was armed and the ✓ was clicked.
async function confirmDelete(recording: SdrRecording): Promise<void> {
  deleteArmedRecordingId.value = null
  try {
    await fetch(`/api/sdr/recordings/${recording.id}`, { method: 'DELETE' })
    await reload()
  } catch (_) {}
}

// Expose reload so SdrPanel can trigger refresh after recording stops
defineExpose({ reload })
</script>
