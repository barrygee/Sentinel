<template>
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
    <div class="sdr-mode-pills" role="radiogroup" aria-label="Demodulation mode">
      <BasePillToggle
        v-for="(mode, modeIndex) in SEARCH_MODES"
        :key="mode"
        class="sdr-mode-pill"
        role="radio"
        :aria-checked="rangeEditor.mode === mode"
        :tabindex="modeKeyboard.radioTabindex(modeIndex)"
        :active="rangeEditor.mode === mode"
        active-class="active"
        @click="rangeEditor.mode = mode"
        @keydown="modeKeyboard.onRadioKeydown($event, modeIndex)"
      >
        {{ mode }}
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
  <div v-if="error" class="sdr-field-error">{{ error }}</div>
  <div class="sdr-editfreq-actions">
    <div class="sdr-editfreq-actions-right">
      <BaseButton variant="ghost" class="sdr-panel-btn" @click="emit('cancel')">CANCEL</BaseButton>
      <BaseButton variant="ghost" class="sdr-panel-btn sdr-editfreq-save-btn" @click="emit('save')">
        SAVE
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SdrRangeForm — the fields and CANCEL / SAVE buttons of a search range, shared
 * by the SEARCH RANGES tab's Add panel and its inline row editor.
 *
 * It edits the `RangeEditorState` bound with `v-model` and only reports intent
 * (`save` / `cancel`): validation and the API calls stay in the tab, which
 * knows whether a new range or which existing one is being edited.
 *
 * It has several root elements on purpose, so the fields stay direct children
 * of the host's `.sdr-editfreq-body` and SdrPanel.css matches them as before.
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'
import SdrStepPicker from './SdrStepPicker.vue'
import { SEARCH_MODES, type RangeEditorState } from './sdrRangeEditor'

defineProps<{
  /** The validation or save error to show above the buttons; empty for none. */
  error: string
}>()

const emit = defineEmits<{
  /** SAVE pressed: the host validates and saves the bound state. */
  (event: 'save'): void
  /** CANCEL pressed: the host closes the form. */
  (event: 'cancel'): void
}>()

const rangeEditor = defineModel<RangeEditorState>({ required: true })

// Radio-group keyboard model for the MODE pills (arrow keys move the choice).
const modeKeyboard = useRadioGroupKeyboard({
  optionCount: () => SEARCH_MODES.length,
  selectedIndex: () => SEARCH_MODES.indexOf(rangeEditor.value.mode),
  select: (modeIndex) => {
    rangeEditor.value.mode = SEARCH_MODES[modeIndex]!
  },
})
</script>
