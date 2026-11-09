<template>
  <BaseTextField
    ref="labelFieldRef"
    v-model="frequencyEditor.label"
    label="LABEL"
    :input-id="elementId('label')"
    :error="errors.label"
    aria-label="Frequency label"
    placeholder="Label…"
    maxlength="60"
  />
  <BaseTextField
    v-model="frequencyEditor.frequencyMhz"
    label="FREQ (MHz)"
    :input-id="elementId('freq')"
    :error="errors.freq"
    aria-label="Frequency in MHz"
    placeholder="118.3800"
    autocomplete="off"
  />
  <!-- Only an edit can show a MODE error: it may open a stored frequency with a
       legacy mode, while the Add form starts from the live, valid mode. -->
  <BaseFormField v-slot="{ describedBy }" label="MODE" label-kind="group" :error="errors.mode">
    <div
      :id="elementId('mode-pills')"
      class="sdr-mode-pills"
      :class="{ 'sdr-input-error': errors.mode }"
      role="radiogroup"
      aria-label="Demodulation mode"
      :aria-describedby="describedBy"
    >
      <BasePillToggle
        v-for="(mode, modeIndex) in MODES"
        :key="mode"
        class="sdr-mode-pill"
        role="radio"
        :aria-checked="frequencyEditor.mode === mode"
        :tabindex="modeKeyboard.radioTabindex(modeIndex)"
        :active="frequencyEditor.mode === mode"
        active-class="active"
        @click="frequencyEditor.mode = mode"
        @keydown="modeKeyboard.onRadioKeydown($event, modeIndex)"
      >
        {{ mode }}
      </BasePillToggle>
    </div>
  </BaseFormField>
  <BaseFormField label="GROUPS" label-kind="group">
    <div :id="elementId('groups')" class="sdr-fmod-groups">
      <BasePillToggle
        class="sdr-mode-pill sdr-ef-gpill"
        :active="frequencyEditor.groupIds.length === 0"
        active-class="active"
        :aria-pressed="frequencyEditor.groupIds.length === 0"
        @click="frequencyEditor.groupIds = []"
      >
        Default
      </BasePillToggle>
      <BasePillToggle
        v-for="group in groups"
        :key="group.id"
        class="sdr-mode-pill sdr-ef-gpill"
        :active="frequencyEditor.groupIds.includes(group.id)"
        active-class="active"
        :aria-pressed="frequencyEditor.groupIds.includes(group.id)"
        @click="toggleGroup(group.id)"
      >
        {{ group.name }}
      </BasePillToggle>
    </div>
  </BaseFormField>
  <BaseTextField
    v-model="frequencyEditor.notes"
    label="NOTES"
    multiline
    :input-id="elementId('notes')"
    :error="errors.notes"
    aria-label="Frequency notes"
    placeholder="Notes…"
    rows="4"
  />
  <div>
    <BaseAccordionSection
      v-model:expanded="settingsExpanded"
      title="RADIO SETTINGS"
      body-id="sdr-ef-settings-section"
      variant="form"
      body-class="sdr-ef-settings-grid"
    >
      <BaseTextField
        v-model="frequencyEditor.gainDb"
        label="RF GAIN (dB)"
        input-type="number"
        step="0.1"
        :disabled="frequencyEditor.gainAuto"
        aria-label="RF gain in dB"
      />
      <BaseFormField label="AUTO (AGC)" label-kind="group">
        <div class="sdr-ef-toggle-wrap">
          <button
            type="button"
            class="sdr-ef-toggle"
            :class="{ 'is-on': frequencyEditor.gainAuto }"
            role="switch"
            :aria-checked="frequencyEditor.gainAuto"
            aria-label="Auto gain (AGC)"
            @click="frequencyEditor.gainAuto = !frequencyEditor.gainAuto"
          >
            <span class="sdr-ef-toggle-thumb"></span>
          </button>
        </div>
      </BaseFormField>
      <BaseTextField
        v-model="frequencyEditor.bandwidthKhz"
        label="BANDWIDTH (kHz)"
        input-type="number"
        step="0.1"
        min="0"
        aria-label="Demod bandwidth in kHz"
      />
      <BaseTextField
        v-model="frequencyEditor.squelchDbfs"
        label="SQUELCH (dBFS)"
        input-type="number"
        aria-label="Squelch threshold in dBFS"
      />
      <BaseTextField
        v-model="frequencyEditor.volumePercent"
        label="VOLUME (%)"
        input-type="number"
        min="0"
        max="100"
        aria-label="Volume percent"
      />
      <BaseFormField label="SAMPLE RATE" label-kind="group">
        <SdrSampleRatePicker v-model="frequencyEditor.sampleRateHz" />
      </BaseFormField>
      <BaseTextField
        v-model="frequencyEditor.zoom"
        label="ZOOM"
        input-type="number"
        step="0.1"
        min="1"
        aria-label="Waterfall zoom"
      />
      <BaseTextField
        v-model="frequencyEditor.waterfallMinDb"
        label="WF MIN (dB)"
        input-type="number"
        aria-label="Waterfall minimum dB"
      />
      <BaseTextField
        v-model="frequencyEditor.waterfallMaxDb"
        label="WF MAX (dB)"
        input-type="number"
        aria-label="Waterfall maximum dB"
      />
    </BaseAccordionSection>
  </div>
  <div class="sdr-editfreq-actions">
    <div class="sdr-editfreq-actions-right">
      <BaseButton
        :id="elementId('cancel')"
        variant="ghost"
        class="sdr-panel-btn"
        @click="emit('cancel')"
        >CANCEL</BaseButton
      >
      <BaseButton
        :id="elementId('save')"
        variant="ghost"
        class="sdr-panel-btn sdr-editfreq-save-btn"
        @click="emit('save')"
      >
        SAVE
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SdrFrequencyForm — the fields, RADIO SETTINGS grid and CANCEL / SAVE buttons
 * of a saved frequency, shared by the FREQUENCY MANAGER tab's Add panel and its
 * inline row editor.
 *
 * It edits the `FrequencyEditorState` bound with `v-model` and only reports
 * intent (`save` / `cancel`): validation and the API calls stay in the tab,
 * which knows whether a new frequency or which saved one is being edited.
 * RADIO SETTINGS' open state is a second model so it outlives the form, which
 * is mounted afresh each time it opens.
 *
 * It has several root elements on purpose, so the fields stay direct children
 * of the host's `.sdr-editfreq-body`, whose column gap spaces them.
 */
import { ref } from 'vue'
import BaseAccordionSection from '@sentinel/ui/base/BaseAccordionSection.vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BaseFormField from '@sentinel/ui/base/BaseFormField.vue'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
import BaseTextField from '@sentinel/ui/base/BaseTextField.vue'
import { useRadioGroupKeyboard } from '@sentinel/ui/composables/useRadioGroupKeyboard'
import SdrSampleRatePicker from './SdrSampleRatePicker.vue'
import { MODES } from './sdrPanelUtils'
import type { FrequencyEditorErrors, FrequencyEditorState } from './sdrFrequencyEditor'
import type { SdrFrequencyGroup } from './stores/sdr'

const props = defineProps<{
  /** The groups a frequency can join, shown as pills after "Default". */
  groups: SdrFrequencyGroup[]
  /** Validation messages from the host's last save attempt. */
  errors: FrequencyEditorErrors
  /**
   * Prefix for the controls' ids (`<prefix>-label`, `-freq`, `-save`, …). Only
   * the Add panel sets it (`sdr-ef`), keeping the ids its specs address it by.
   * Without it the buttons and pill groups get no ids and the text fields get
   * generated ones (their labels point at them), so the Add panel and an
   * inline row editor open together never share an id.
   */
  idPrefix?: string
}>()

const emit = defineEmits<{
  /** SAVE pressed: the host validates and saves the bound state. */
  (event: 'save'): void
  /** CANCEL pressed: the host closes the form. */
  (event: 'cancel'): void
}>()

const frequencyEditor = defineModel<FrequencyEditorState>({ required: true })
const settingsExpanded = defineModel<boolean>('settingsExpanded', { required: true })

const labelFieldRef = ref<{ focus: () => void } | null>(null)

/** The id for one of the form's controls, or none when the host gave no prefix. */
function elementId(controlName: string): string | undefined {
  return props.idPrefix ? `${props.idPrefix}-${controlName}` : undefined
}

/** Adds the group to the frequency, or takes it off if it is already in. */
function toggleGroup(groupId: number) {
  const groupIds = frequencyEditor.value.groupIds
  frequencyEditor.value.groupIds = groupIds.includes(groupId)
    ? groupIds.filter((memberId) => memberId !== groupId)
    : [...groupIds, groupId]
}

// Radio-group keyboard model for the MODE pills (arrow keys move the choice).
const modeKeyboard = useRadioGroupKeyboard({
  optionCount: () => MODES.length,
  selectedIndex: () => (MODES as readonly string[]).indexOf(frequencyEditor.value.mode),
  select: (modeIndex) => {
    frequencyEditor.value.mode = MODES[modeIndex]!
  },
})

/** Puts the cursor in LABEL, the field a new frequency still needs. */
function focusLabel() {
  labelFieldRef.value?.focus()
}

defineExpose({ focusLabel })
</script>
