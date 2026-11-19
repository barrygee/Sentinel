<template>
  <div class="sdr-recording-edit-panel" @click.stop>
    <SdrRecordingNoteLabel v-if="noteDraft.trim()" />
    <textarea
      ref="noteInput"
      v-model="noteDraft"
      class="sdr-recording-edit-note"
      rows="2"
      maxlength="250"
      aria-label="Recording note"
      placeholder="Add a note…"
      @keydown.esc="emit('close')"
    ></textarea>
    <div class="sdr-recording-edit-actions">
      <BaseButton
        variant="ghost"
        class="sdr-panel-btn sdr-recording-edit-cancel"
        @click.stop="emit('close')"
      >
        CANCEL
      </BaseButton>
      <BaseButton
        variant="ghost"
        class="sdr-panel-btn sdr-editfreq-save-btn sdr-recording-edit-save"
        @click.stop="emit('save')"
      >
        SAVE
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The inline edit accordion of a saved recording: a flat note input with
 * CANCEL / SAVE, opened between the meta and the play controls. The draft
 * lives with the tab (`v-model`), so it survives the row being filtered out
 * and back; the input takes focus only when the tab asks (`focusOnMount`,
 * i.e. the pencil was just clicked), never on such a remount.
 */
import './SdrRecordingNoteEditor.css'
import { onMounted, useTemplateRef } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import SdrRecordingNoteLabel from './SdrRecordingNoteLabel.vue'

const props = defineProps<{
  /** The editor was just opened: focus the note input once mounted. */
  focusOnMount: boolean
}>()

const noteDraft = defineModel<string>({ required: true })

const emit = defineEmits<{
  close: []
  save: []
  /** The input took the focus asked for by `focusOnMount`. */
  focused: []
}>()

const noteInput = useTemplateRef<HTMLTextAreaElement>('noteInput')

onMounted(() => {
  if (!props.focusOnMount) return
  const input = noteInput.value
  /* v8 ignore start -- defensive: the textarea is in this component's own template (no
     v-if), so its ref is always set by the time onMounted runs. */
  if (!input) return
  /* v8 ignore stop */
  input.focus()
  emit('focused')
})
</script>
