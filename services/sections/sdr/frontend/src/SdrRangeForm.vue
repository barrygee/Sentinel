<template>
  <BaseTextField
    v-model="rangeEditor.label"
    label="LABEL"
    aria-label="Range label"
    placeholder="e.g. Air Band"
    maxlength="60"
  />
  <div class="sdr-range-row">
    <BaseTextField
      v-model="rangeEditor.low_mhz"
      class="sdr-range-col"
      label="LOW (MHz)"
      input-type="number"
      aria-label="Range low frequency in MHz"
      step="0.0001"
    />
    <BaseTextField
      v-model="rangeEditor.high_mhz"
      class="sdr-range-col"
      label="HIGH (MHz)"
      input-type="number"
      aria-label="Range high frequency in MHz"
      step="0.0001"
    />
  </div>
  <div class="sdr-range-row">
    <BaseFormField class="sdr-range-col" label="STEP" label-kind="group">
      <SdrStepPicker v-model="rangeEditor.step_khz" />
    </BaseFormField>
    <BaseTextField
      v-model="rangeEditor.dwell_ms"
      class="sdr-range-col"
      label="DWELL (ms)"
      input-type="number"
      step="10"
      min="50"
      aria-label="Dwell time in milliseconds"
    />
  </div>
  <BaseFormField label="MODE" label-kind="group">
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
  </BaseFormField>
  <BaseTextField
    v-model="rangeEditor.threshold_dbfs"
    label="THRESHOLD (dBFS)"
    input-type="number"
    step="1"
    aria-label="Threshold in dBFS"
  />
  <BaseTextField
    v-model="rangeEditor.notes"
    label="NOTES"
    multiline
    rows="3"
    aria-label="Range notes"
  />
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
 * of the host's `.sdr-editfreq-body`, whose column gap spaces them.
 */
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseFormField from '@sentinel/ui/base/BaseFormField.vue'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
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
