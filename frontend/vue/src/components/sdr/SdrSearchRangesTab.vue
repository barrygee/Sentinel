<template>
  <div class="sdr-search-ranges-body">
    <div id="sdr-search-range-list">
      <div
        v-for="r in ranges"
        :key="r.id"
        class="sdr-freq-row-item"
        :class="{ 'sdr-freq-editing': editingRangeId === r.id }"
      >
        <div class="sdr-freq-row-top">
          <div
            class="sdr-freq-row-body sdr-search-range-row-body"
            role="button"
            tabindex="0"
            :title="rangeEditorOpen && editingRangeId === r.id ? 'Close editor' : 'Edit range'"
            @click.stop="toggleEditRange(r)"
            @keydown.enter.stop.prevent="toggleEditRange(r)"
            @keydown.space.stop.prevent="toggleEditRange(r)"
          >
            <div class="sdr-freq-row-main">
              <span class="sdr-freq-row-label">{{ r.label }}</span>
            </div>
            <div class="sdr-freq-row-sub">
              <span class="sdr-freq-row-hz"
                >{{ (r.low_hz / 1e6).toFixed(3) }}–{{ (r.high_hz / 1e6).toFixed(3) }} MHz</span
              >
            </div>
          </div>
          <span class="sdr-freq-row-play-spacer" aria-hidden="true"></span>
          <BaseIconAction
            v-if="!(rangeEditorOpen && editingRangeId === r.id)"
            class="sdr-freq-row-edit"
            accessible-name="Edit range"
            title="Edit"
            @click.stop="toggleEditRange(r)"
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
            @click.stop="deleteRange(r.id)"
          >
            &#x2715;
          </BaseIconAction>
        </div>

        <!-- Inline edit form (accordion body) -->
        <div
          v-if="rangeEditorOpen && editingRangeId === r.id"
          class="sdr-editfreq-body expanded"
          @click.stop
        >
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">LABEL</label>
            <input
              v-model="rangeEditor.label"
              class="sdr-panel-input"
              type="text"
              aria-label="Range label"
              placeholder="e.g. Air Band"
              maxlength="60"
              style="width: 100%"
            />
          </div>
          <div class="sdr-editfreq-field sdr-range-row">
            <div class="sdr-range-col">
              <label class="sdr-field-label">LOW (MHz)</label>
              <input
                v-model="rangeEditor.low_mhz"
                class="sdr-panel-input"
                type="number"
                aria-label="Range low frequency in MHz"
                step="0.0001"
                style="width: 100%"
              />
            </div>
            <div class="sdr-range-col">
              <label class="sdr-field-label">HIGH (MHz)</label>
              <input
                v-model="rangeEditor.high_mhz"
                class="sdr-panel-input"
                type="number"
                aria-label="Range high frequency in MHz"
                step="0.0001"
                style="width: 100%"
              />
            </div>
          </div>
          <div class="sdr-editfreq-field sdr-range-row">
            <div class="sdr-range-col">
              <label class="sdr-field-label">STEP</label>
              <SdrStepPicker v-model="rangeEditor.step_khz" />
            </div>
            <div class="sdr-range-col">
              <label class="sdr-field-label">DWELL (ms)</label>
              <input
                v-model="rangeEditor.dwell_ms"
                class="sdr-panel-input"
                type="number"
                step="10"
                min="50"
                aria-label="Dwell time in milliseconds"
                style="width: 100%"
              />
            </div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">MODE</label>
            <div class="sdr-mode-pills">
              <BasePillToggle
                v-for="m in SEARCH_MODES"
                :key="m"
                class="sdr-mode-pill"
                :active="rangeEditor.mode === m"
                active-class="active"
                @click="rangeEditor.mode = m"
              >
                {{ m }}
              </BasePillToggle>
            </div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">THRESHOLD (dBFS)</label>
            <input
              v-model="rangeEditor.threshold_dbfs"
              class="sdr-panel-input"
              type="number"
              step="1"
              aria-label="Threshold in dBFS"
              style="width: 100%"
            />
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">NOTES</label>
            <textarea
              v-model="rangeEditor.notes"
              class="sdr-panel-input sdr-panel-textarea"
              rows="3"
              aria-label="Range notes"
              style="width: 100%"
            ></textarea>
          </div>
          <div v-if="rangeEditorError" class="sdr-field-error">{{ rangeEditorError }}</div>
          <div class="sdr-editfreq-actions">
            <div class="sdr-editfreq-actions-right">
              <button class="sdr-panel-btn" @click="cancelRangeEditor">CANCEL</button>
              <button class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveRangeEditor">
                SAVE
              </button>
            </div>
          </div>
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
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">LABEL</label>
        <input
          v-model="rangeEditor.label"
          class="sdr-panel-input"
          type="text"
          aria-label="Range label"
          placeholder="e.g. Air Band"
          maxlength="60"
          style="width: 100%"
        />
      </div>
      <div class="sdr-editfreq-field sdr-range-row">
        <div class="sdr-range-col">
          <label class="sdr-field-label">LOW (MHz)</label>
          <input
            v-model="rangeEditor.low_mhz"
            class="sdr-panel-input"
            type="number"
            aria-label="Range low frequency in MHz"
            step="0.0001"
            style="width: 100%"
          />
        </div>
        <div class="sdr-range-col">
          <label class="sdr-field-label">HIGH (MHz)</label>
          <input
            v-model="rangeEditor.high_mhz"
            class="sdr-panel-input"
            type="number"
            aria-label="Range high frequency in MHz"
            step="0.0001"
            style="width: 100%"
          />
        </div>
      </div>
      <div class="sdr-editfreq-field sdr-range-row">
        <div class="sdr-range-col">
          <label class="sdr-field-label">STEP</label>
          <SdrStepPicker v-model="rangeEditor.step_khz" />
        </div>
        <div class="sdr-range-col">
          <label class="sdr-field-label">DWELL (ms)</label>
          <input
            v-model="rangeEditor.dwell_ms"
            class="sdr-panel-input"
            type="number"
            step="10"
            min="50"
            aria-label="Dwell time in milliseconds"
            style="width: 100%"
          />
        </div>
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">MODE</label>
        <div class="sdr-mode-pills">
          <BasePillToggle
            v-for="m in SEARCH_MODES"
            :key="m"
            class="sdr-mode-pill"
            :active="rangeEditor.mode === m"
            active-class="active"
            @click="rangeEditor.mode = m"
          >
            {{ m }}
          </BasePillToggle>
        </div>
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">THRESHOLD (dBFS)</label>
        <input
          v-model="rangeEditor.threshold_dbfs"
          class="sdr-panel-input"
          type="number"
          step="1"
          aria-label="Threshold in dBFS"
          style="width: 100%"
        />
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">NOTES</label>
        <textarea
          v-model="rangeEditor.notes"
          class="sdr-panel-input sdr-panel-textarea"
          rows="3"
          aria-label="Range notes"
          style="width: 100%"
        ></textarea>
      </div>
      <div v-if="rangeEditorError" class="sdr-field-error">{{ rangeEditorError }}</div>
      <div class="sdr-editfreq-actions">
        <div class="sdr-editfreq-actions-right">
          <button class="sdr-panel-btn" @click="cancelRangeEditor">CANCEL</button>
          <button class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveRangeEditor">SAVE</button>
        </div>
      </div>
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
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref } from 'vue'
import BaseIconAction from '@/components/base/BaseIconAction.vue'
import BasePillToggle from '@/components/base/BasePillToggle.vue'
import SdrStepPicker from './SdrStepPicker.vue'
import type { SdrSearchRange } from '@/services/sdrSearchApi'
import {
  createSearchRange as apiCreateSearchRange,
  updateSearchRange as apiUpdateSearchRange,
  deleteSearchRange as apiDeleteSearchRange,
} from '@/services/sdrSearchApi'

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

const SEARCH_MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW']

interface RangeEditorState {
  id: number | null
  label: string
  low_mhz: string
  high_mhz: string
  step_khz: string
  mode: string
  threshold_dbfs: string
  dwell_ms: string
  notes: string
}

function blankRangeEditor(): RangeEditorState {
  return {
    id: null,
    label: '',
    low_mhz: '',
    high_mhz: '',
    step_khz: '12.5',
    mode: 'NFM',
    threshold_dbfs: '-70',
    dwell_ms: '200',
    notes: '',
  }
}

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

function toggleEditRange(r: SdrSearchRange) {
  if (rangeEditorOpen.value && editingRangeId.value === r.id) {
    cancelRangeEditor()
  } else {
    openEditRange(r)
  }
}

function openEditRange(r: SdrSearchRange) {
  editingRangeId.value = r.id
  rangeEditor.value = {
    id: r.id,
    label: r.label,
    low_mhz: (r.low_hz / 1e6).toString(),
    high_mhz: (r.high_hz / 1e6).toString(),
    step_khz: (r.step_hz / 1000).toString(),
    mode: r.mode,
    threshold_dbfs: r.threshold_dbfs.toString(),
    dwell_ms: r.dwell_ms.toString(),
    notes: r.notes,
  }
  rangeEditorError.value = ''
  rangeEditorOpen.value = true
}

function cancelRangeEditor() {
  rangeEditorOpen.value = false
  editingRangeId.value = null
  rangeEditorError.value = ''
}

async function saveRangeEditor() {
  const e = rangeEditor.value
  const lowHz = Math.round(parseFloat(e.low_mhz) * 1e6)
  const highHz = Math.round(parseFloat(e.high_mhz) * 1e6)
  const stepHz = Math.round(parseFloat(e.step_khz) * 1000)
  const thr = parseFloat(e.threshold_dbfs)
  const dwell = parseInt(e.dwell_ms, 10)
  if (!e.label.trim()) {
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
  if (!isFinite(thr)) {
    rangeEditorError.value = 'Threshold must be a number'
    return
  }
  if (!isFinite(dwell) || dwell <= 0) {
    rangeEditorError.value = 'Dwell must be positive'
    return
  }

  const body = {
    label: e.label.trim(),
    low_hz: lowHz,
    high_hz: highHz,
    step_hz: stepHz,
    mode: e.mode,
    threshold_dbfs: thr,
    dwell_ms: dwell,
    band_name: '',
    enabled: true,
    notes: e.notes,
    sort_order:
      editingRangeId.value == null
        ? props.ranges.length
        : /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          (props.ranges.find((r) => r.id === editingRangeId.value)?.sort_order ?? 0),
    /* v8 ignore stop */
  }
  const ok =
    editingRangeId.value == null
      ? !!(await apiCreateSearchRange(body))
      : !!(await apiUpdateSearchRange(editingRangeId.value, body))
  if (!ok) {
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
