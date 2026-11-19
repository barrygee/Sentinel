<template>
  <div class="sdr-recording-actions">
    <BaseIconAction
      class="sdr-recording-edit"
      :active="editing"
      active-class="sdr-recording-edit--active"
      tooltip="Edit"
      tooltip-side="bottom"
      accessible-name="Edit"
      @click.stop="emit('toggleEdit')"
    >
      &#x270E;
    </BaseIconAction>
    <!-- Inline delete confirm: bin → check/cancel pair. Click bin to arm,
         click again (✓) to confirm, ✕ to cancel. -->
    <template v-if="deleteArmed">
      <BaseIconAction
        class="sdr-recording-del sdr-recording-del--confirm"
        tooltip="Confirm delete"
        tooltip-side="bottom"
        accessible-name="Confirm delete"
        @click.stop="emit('confirmDelete')"
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M2.5 7.5l3 3 6-7" />
        </svg>
      </BaseIconAction>
      <BaseIconAction
        class="sdr-recording-del sdr-recording-del--cancel"
        tooltip="Cancel"
        tooltip-side="bottom"
        accessible-name="Cancel delete"
        @click.stop="emit('cancelDelete')"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
        </svg>
      </BaseIconAction>
    </template>
    <BaseIconAction
      v-else
      class="sdr-recording-del"
      tooltip="Delete"
      tooltip-side="bottom"
      accessible-name="Delete"
      @click.stop="emit('armDelete')"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        stroke-width="1.3"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M2 3.5h10" />
        <path d="M5.5 3.5V2.2a.7.7 0 0 1 .7-.7h1.6a.7.7 0 0 1 .7.7v1.3" />
        <path d="M3.2 3.5l.6 8.1a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9l.6-8.1" />
        <path d="M6 6v4M8 6v4" />
      </svg>
    </BaseIconAction>
  </div>
</template>

<script setup lang="ts">
/**
 * A saved recording's edit / delete glyphs, top-right of its title. The pencil
 * toggles the note editor; the bin arms an inline ✓ / ✕ confirm in its place.
 * Which row is editing or armed is the tab's state (one at a time), so this
 * only reports clicks.
 */
import './SdrRecordingRowActions.css'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'

defineProps<{
  /** This row's note editor is open (the pencil turns accent). */
  editing: boolean
  /** This row's bin is armed: show ✓ / ✕ instead. */
  deleteArmed: boolean
}>()

const emit = defineEmits<{
  toggleEdit: []
  armDelete: []
  cancelDelete: []
  confirmDelete: []
}>()
</script>
