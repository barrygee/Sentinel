<template>
  <SdrRecordingRowFrame :playing="playing">
    <SdrRecordingHeader
      :frequency-number="recordingFrequencyNumber(recording.frequency_hz)"
      :mode="recording.mode"
    >
      <SdrRecordingRowActions
        :editing="editing"
        :delete-armed="deleteArmed"
        @toggle-edit="emit('toggleEdit')"
        @arm-delete="emit('armDelete')"
        @cancel-delete="emit('cancelDelete')"
        @confirm-delete="emit('confirmDelete')"
      />
    </SdrRecordingHeader>

    <!-- Custom name (if any), radio freq-name style. -->
    <div v-if="customName" class="sdr-recording-subname">
      {{ customName }}
    </div>

    <SdrRecordingMeta
      :date="recordingStartedLabel(recording.started_at)"
      :duration="formatRecordingDuration(recording.duration_s || 0)"
      :size="formatRecordingSize(recording.file_size_bytes || 0)"
    />

    <SdrRecordingNote v-if="recording.notes && !editing" :notes="recording.notes" />

    <SdrRecordingNoteEditor
      v-if="editing"
      v-model="noteDraft"
      :focus-on-mount="focusEditorOnMount"
      @close="emit('closeEdit')"
      @save="emit('saveEdit')"
      @focused="emit('editorFocused')"
    />

    <SdrRecordingPlaybackControls
      :playing="playing"
      :has-iq-file="recording.has_iq_file"
      :iq-file-pending="!!recording.iq_file_pending"
      @toggle-play="emit('togglePlay')"
      @download="(kind) => downloadRecording(recording, kind)"
    />

    <SdrRecordingProgressBar
      v-if="playing"
      :current-time-seconds="currentTimeSeconds"
      :duration-seconds="durationSeconds"
      @seek="(fraction) => emit('seek', fraction)"
    />

    <template #after-content>
      <audio
        :ref="(element) => registerAudioElement(element as HTMLAudioElement | null)"
        :src="recordingAudioUrl(recording.id)"
        style="display: none"
        @loadedmetadata="emit('audioMetadata')"
        @timeupdate="emit('audioTimeUpdate')"
        @ended="emit('audioEnded')"
      ></audio>
    </template>
  </SdrRecordingRowFrame>
</template>

<script setup lang="ts">
/**
 * One saved recording: title with edit/delete, custom name, meta, note (or
 * its editor), the play/download pills and, while playing, the progress bar.
 * The note draft is the tab's (`v-model:note-draft`). Its hidden `<audio>` is what plays; the tab's playback state drives it
 * through `registerAudioElement` and the audio events this row re-emits.
 */
import './SdrRecordingRow.css'
import { computed } from 'vue'
import SdrRecordingRowFrame from './SdrRecordingRowFrame.vue'
import SdrRecordingHeader from './SdrRecordingHeader.vue'
import SdrRecordingRowActions from './SdrRecordingRowActions.vue'
import SdrRecordingMeta from './SdrRecordingMeta.vue'
import SdrRecordingNote from './SdrRecordingNote.vue'
import SdrRecordingNoteEditor from './SdrRecordingNoteEditor.vue'
import SdrRecordingPlaybackControls from './SdrRecordingPlaybackControls.vue'
import SdrRecordingProgressBar from './SdrRecordingProgressBar.vue'
import {
  downloadRecording,
  formatRecordingDuration,
  formatRecordingSize,
  recordingAudioUrl,
  recordingCustomName,
  recordingFrequencyNumber,
  recordingStartedLabel,
  type SdrRecording,
} from './sdrRecordings'

const props = defineProps<{
  recording: SdrRecording
  editing: boolean
  /** The note editor was just opened: focus it when it mounts. */
  focusEditorOnMount: boolean
  deleteArmed: boolean
  playing: boolean
  /** Playback position and length; read only while `playing`. */
  currentTimeSeconds: number
  durationSeconds: number
  /** The `<audio>` function ref: called with the element, and with null on removal. */
  registerAudioElement: (element: HTMLAudioElement | null) => void
}>()

const emit = defineEmits<{
  toggleEdit: []
  closeEdit: []
  saveEdit: []
  editorFocused: []
  armDelete: []
  cancelDelete: []
  confirmDelete: []
  togglePlay: []
  seek: [fraction: number]
  audioMetadata: []
  audioTimeUpdate: []
  audioEnded: []
}>()

/** The note being edited (the tab's single draft); bound only while `editing`. */
const noteDraft = defineModel<string>('noteDraft', { required: true })

const customName = computed(() => recordingCustomName(props.recording))
</script>
