<template>
  <div class="sdr-recording-note">
    <SdrRecordingNoteLabel />
    <div class="sdr-recording-note-text">{{ notes }}</div>
  </div>
</template>

<script setup lang="ts">
/** A saved recording's note, read-only and clamped to two lines. */
import './SdrRecordingNote.css'
import SdrRecordingNoteLabel from './SdrRecordingNoteLabel.vue'

defineProps<{
  notes: string
}>()
</script>
