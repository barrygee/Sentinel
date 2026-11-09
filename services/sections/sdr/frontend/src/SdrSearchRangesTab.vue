<template>
  <div class="sdr-search-ranges-body">
    <div id="sdr-search-range-list">
      <div
        v-for="range in ranges"
        :key="range.id"
        class="sdr-freq-row-item"
        :class="{ 'sdr-freq-editing': editingRangeId === range.id }"
      >
        <div class="sdr-freq-row-top">
          <div
            class="sdr-freq-row-body sdr-search-range-row-body"
            role="button"
            tabindex="0"
            :title="rangeEditorOpen && editingRangeId === range.id ? 'Close editor' : 'Edit range'"
            @click.stop="toggleEditRange(range)"
            @keydown.enter.stop.prevent="toggleEditRange(range)"
            @keydown.space.stop.prevent="toggleEditRange(range)"
          >
            <div class="sdr-freq-row-main">
              <span class="sdr-freq-row-label">{{ range.label }}</span>
            </div>
            <div class="sdr-freq-row-sub">
              <span class="sdr-freq-row-hz"
                >{{ (range.low_hz / 1e6).toFixed(3) }}–{{
                  (range.high_hz / 1e6).toFixed(3)
                }}
                MHz</span
              >
            </div>
          </div>
          <span class="sdr-freq-row-play-spacer" aria-hidden="true"></span>
          <BaseIconAction
            v-if="!(rangeEditorOpen && editingRangeId === range.id)"
            class="sdr-freq-row-edit"
            accessible-name="Edit range"
            title="Edit"
            @click.stop="toggleEditRange(range)"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path
                d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"
                fill="currentColor"
              />
            </svg>
          </BaseIconAction>
          <BaseIconAction
            class="sdr-freq-row-del"
            accessible-name="Delete range"
            title="Delete"
            @click.stop="deleteRange(range.id)"
          >
            &#x2715;
          </BaseIconAction>
        </div>

        <!-- Inline edit form (accordion body) -->
        <div
          v-if="rangeEditorOpen && editingRangeId === range.id"
          class="sdr-editfreq-body expanded"
          @click.stop
        >
          <SdrRangeForm
            v-model="rangeEditor"
            :error="rangeEditorError"
            @save="saveRangeEditor"
            @cancel="cancelRangeEditor"
          />
        </div>
      </div>
    </div>

    <div v-if="ranges.length === 0" class="sdr-panel-empty">No search ranges defined.</div>

    <div
      v-show="!(rangeEditorOpen && editingRangeId === null)"
      class="sdr-frequency-manager-add-freq-row"
    >
      <button class="sdr-add-freq-btn" @click="openAddRange">Add Range</button>
    </div>

    <!-- Add range panel (only when adding, not editing) -->
    <div
      v-if="rangeEditorOpen && editingRangeId === null"
      class="sdr-editfreq-body sdr-addfreq-body expanded"
    >
      <div class="sdr-addfreq-title-row">
        <span class="sdr-scanner-section-label">ADD RANGE</span>
      </div>
      <SdrRangeForm
        v-model="rangeEditor"
        :error="rangeEditorError"
        @save="saveRangeEditor"
        @cancel="cancelRangeEditor"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SdrSearchRangesTab — the SEARCH RANGES tab of the SDR side panel: lists the
 * saved search ranges and provides add / inline-edit / delete (CRUD against
 * /api/sdr/search-ranges via sdrSearchApi). The search ENGINE (sweeping,
 * range selection, lock/resume) stays in the parent panel — this component
 * only manages the range definitions.
 *
 * Emits:
 * - `before-delete(id)` synchronously before a range is deleted, so the
 *   parent can stop an active search running on that range.
 * - `changed` after every successful save/delete, so the parent reloads its
 *   range list (which also reconciles the selected-range id).
 *
 * The Add panel and the inline row editor render the same `SdrRangeForm`;
 * this tab owns its state, validation and saving.
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import SdrRangeForm from './SdrRangeForm.vue'
import { blankRangeEditor, rangeEditorFromRange, type RangeEditorState } from './sdrRangeEditor'
import type { SdrSearchRange } from './services/sdrSearchApi'
import {
  createSearchRange as apiCreateSearchRange,
  updateSearchRange as apiUpdateSearchRange,
  deleteSearchRange as apiDeleteSearchRange,
} from './services/sdrSearchApi'

const props = defineProps<{
  /** The saved search ranges (owned and loaded by the parent panel). */
  ranges: SdrSearchRange[]
}>()

const emit = defineEmits<{
  /** Fired synchronously before a delete so the parent can stop an active search. */
  (event: 'before-delete', id: number): void
  /** Fired after a successful save/delete so the parent reloads the range list. */
  (event: 'changed'): void
}>()

const rangeEditorOpen = ref(false)
const editingRangeId = ref<number | null>(null)
const rangeEditor = ref<RangeEditorState>(blankRangeEditor())
const rangeEditorError = ref<string>('')

function openAddRange() {
  editingRangeId.value = null
  rangeEditor.value = blankRangeEditor()
  rangeEditorError.value = ''
  rangeEditorOpen.value = true
}

function toggleEditRange(range: SdrSearchRange) {
  if (rangeEditorOpen.value && editingRangeId.value === range.id) {
    cancelRangeEditor()
  } else {
    openEditRange(range)
  }
}

function openEditRange(range: SdrSearchRange) {
  editingRangeId.value = range.id
  rangeEditor.value = rangeEditorFromRange(range)
  rangeEditorError.value = ''
  rangeEditorOpen.value = true
}

function cancelRangeEditor() {
  rangeEditorOpen.value = false
  editingRangeId.value = null
  rangeEditorError.value = ''
}

async function saveRangeEditor() {
  const editor = rangeEditor.value
  const lowHz = Math.round(parseFloat(editor.low_mhz) * 1e6)
  const highHz = Math.round(parseFloat(editor.high_mhz) * 1e6)
  const stepHz = Math.round(parseFloat(editor.step_khz) * 1000)
  const thresholdDbfs = parseFloat(editor.threshold_dbfs)
  const dwellMs = parseInt(editor.dwell_ms, 10)
  if (!editor.label.trim()) {
    rangeEditorError.value = 'Label required'
    return
  }
  if (!isFinite(lowHz) || !isFinite(highHz) || lowHz <= 0 || highHz <= 0) {
    rangeEditorError.value = 'Low and high MHz required'
    return
  }
  if (lowHz >= highHz) {
    rangeEditorError.value = 'Low must be less than high'
    return
  }
  // The step is always a positive STEP_OPTIONS value chosen from the dropdown,
  // so it never fails this check (low/high/threshold/dwell are the testable ones).
  /* v8 ignore start */
  if (!isFinite(stepHz) || stepHz <= 0) {
    rangeEditorError.value = 'Step must be positive'
    return
  }
  /* v8 ignore stop */
  if (!isFinite(thresholdDbfs)) {
    rangeEditorError.value = 'Threshold must be a number'
    return
  }
  if (!isFinite(dwellMs) || dwellMs <= 0) {
    rangeEditorError.value = 'Dwell must be positive'
    return
  }

  const body = {
    label: editor.label.trim(),
    low_hz: lowHz,
    high_hz: highHz,
    step_hz: stepHz,
    mode: editor.mode,
    threshold_dbfs: thresholdDbfs,
    dwell_ms: dwellMs,
    band_name: '',
    enabled: true,
    notes: editor.notes,
    sort_order:
      editingRangeId.value == null
        ? props.ranges.length
        : /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          (props.ranges.find((range) => range.id === editingRangeId.value)?.sort_order ?? 0),
    /* v8 ignore stop */
  }
  const saved =
    editingRangeId.value == null
      ? !!(await apiCreateSearchRange(body))
      : !!(await apiUpdateSearchRange(editingRangeId.value, body))
  if (!saved) {
    rangeEditorError.value = 'Save failed'
    return
  }
  rangeEditorOpen.value = false
  editingRangeId.value = null
  emit('changed')
}

async function deleteRange(id: number) {
  emit('before-delete', id)
  await apiDeleteSearchRange(id)
  if (editingRangeId.value === id) cancelRangeEditor()
  emit('changed')
}
</script>
