<template>
  <div class="sdr-recording-controls">
    <BaseIconAction
      class="sdr-recording-play"
      :title="playing ? 'Stop' : 'Play'"
      :accessible-name="playing ? 'Stop' : 'Play'"
      @click.stop="emit('togglePlay')"
    >
      <svg
        v-if="!playing"
        width="13"
        height="13"
        viewBox="0 0 10 10"
        fill="currentColor"
        aria-hidden="true"
      >
        <polygon points="2,1 9,5 2,9" />
      </svg>
      <svg v-else width="13" height="13" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
        <rect x="1.5" y="1.5" width="3" height="7" />
        <rect x="5.5" y="1.5" width="3" height="7" />
      </svg>
    </BaseIconAction>
    <button
      class="sdr-recording-export"
      title="Download WAV"
      aria-label="Download WAV"
      @click.stop="emit('download', 'wav')"
    >
      DOWNLOAD
    </button>
    <button
      v-if="hasIqFile"
      class="sdr-recording-iq"
      :disabled="iqFilePending"
      :title="iqLabel"
      :aria-label="iqLabel"
      @click.stop="emit('download', 'iq')"
    >
      {{ iqFilePending ? 'COPYING IQ…' : 'DOWNLOAD IQ' }}
    </button>
  </div>
</template>

<script setup lang="ts">
/**
 * A saved recording's pill row beneath its meta: play/stop, DOWNLOAD (the WAV)
 * and, when an IQ capture was kept, DOWNLOAD IQ — disabled as "COPYING IQ…"
 * until the file has landed from the radio hub.
 */
import './SdrRecordingPill.css'
import './SdrRecordingPlaybackControls.css'
import { computed } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import type { RecordingDownloadKind } from './sdrRecordings'

const props = defineProps<{
  playing: boolean
  hasIqFile: boolean
  iqFilePending: boolean
}>()

const emit = defineEmits<{
  togglePlay: []
  download: [kind: RecordingDownloadKind]
}>()

const iqLabel = computed(() =>
  props.iqFilePending ? 'IQ still copying from the radio hub' : 'Download IQ',
)
</script>
