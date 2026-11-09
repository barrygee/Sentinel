<template>
  <div class="sdr-editfreq-field">
    <label class="sdr-field-label">LABEL</label>
    <input
      :id="elementId('label')"
      ref="labelInputRef"
      v-model="frequencyEditor.label"
      class="sdr-panel-input"
      :class="{ 'sdr-input-error': errors.label }"
      type="text"
      aria-label="Frequency label"
      placeholder="Label…"
      maxlength="60"
      style="width: 100%"
    />
    <div v-if="errors.label" class="sdr-field-error">{{ errors.label }}</div>
  </div>
  <div class="sdr-editfreq-field">
    <label class="sdr-field-label">FREQ (MHz)</label>
    <input
      :id="elementId('freq')"
      v-model="frequencyEditor.frequencyMhz"
      class="sdr-panel-input"
      :class="{ 'sdr-input-error': errors.freq }"
      type="text"
      aria-label="Frequency in MHz"
      placeholder="118.3800"
      autocomplete="off"
      style="width: 100%"
    />
    <div v-if="errors.freq" class="sdr-field-error">{{ errors.freq }}</div>
  </div>
  <div class="sdr-editfreq-field">
    <label class="sdr-field-label">MODE</label>
    <div
      :id="elementId('mode-pills')"
      class="sdr-mode-pills"
      :class="{ 'sdr-input-error': errors.mode }"
      role="radiogroup"
      aria-label="Demodulation mode"
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
    <!-- Only an edit can show this: it may open a stored frequency with a
         legacy mode, while the Add form starts from the live, valid mode. -->
    <div v-if="errors.mode" class="sdr-field-error">{{ errors.mode }}</div>
  </div>
  <div class="sdr-editfreq-field">
    <label class="sdr-field-label">GROUPS</label>
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
  </div>
  <div class="sdr-editfreq-field">
    <label class="sdr-field-label">NOTES</label>
    <textarea
      :id="elementId('notes')"
      v-model="frequencyEditor.notes"
      class="sdr-panel-input sdr-panel-textarea"
      :class="{ 'sdr-input-error': errors.notes }"
      aria-label="Frequency notes"
      placeholder="Notes…"
      rows="4"
      style="width: 100%"
    ></textarea>
    <div v-if="errors.notes" class="sdr-field-error">{{ errors.notes }}</div>
  </div>
  <div class="sdr-editfreq-field">
    <BaseAccordionSection
      v-model:expanded="settingsExpanded"
      title="RADIO SETTINGS"
      body-id="sdr-ef-settings-section"
      variant="form"
      body-class="sdr-ef-settings-grid"
    >
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">RF GAIN (dB)</span>
        <input
          v-model="frequencyEditor.gainDb"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          step="0.1"
          :disabled="frequencyEditor.gainAuto"
          aria-label="RF gain in dB"
        />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">AUTO (AGC)</span>
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
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">BANDWIDTH (kHz)</span>
        <input
          v-model="frequencyEditor.bandwidthKhz"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          step="0.1"
          min="0"
          aria-label="Demod bandwidth in kHz"
        />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">SQUELCH (dBFS)</span>
        <input
          v-model="frequencyEditor.squelchDbfs"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          aria-label="Squelch threshold in dBFS"
        />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">VOLUME (%)</span>
        <input
          v-model="frequencyEditor.volumePercent"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          min="0"
          max="100"
          aria-label="Volume percent"
        />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">SAMPLE RATE</span>
        <SdrSampleRatePicker v-model="frequencyEditor.sampleRateHz" />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">ZOOM</span>
        <input
          v-model="frequencyEditor.zoom"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          step="0.1"
          min="1"
          aria-label="Waterfall zoom"
        />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">WF MIN (dB)</span>
        <input
          v-model="frequencyEditor.waterfallMinDb"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          aria-label="Waterfall minimum dB"
        />
      </div>
      <div class="sdr-ef-setting">
        <span class="sdr-field-label">WF MAX (dB)</span>
        <input
          v-model="frequencyEditor.waterfallMaxDb"
          class="sdr-panel-input sdr-ef-setting-input"
          type="number"
          aria-label="Waterfall maximum dB"
        />
      </div>
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
 * of the host's `.sdr-editfreq-body` and SdrPanel.css matches them as before.
 */
import { ref } from 'vue'
import BaseAccordionSection from '@sentinel/ui/base/BaseAccordionSection.vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import BasePillToggle from '@sentinel/ui/base/BasePillToggle.vue'
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
   * Prefix for the controls' ids (`<prefix>-label`, `-freq`, `-save`, …); no
   * ids without it. Only the Add panel sets it (`sdr-ef`), keeping the ids its
   * specs address it by; the inline row editor has never had ids.
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

const labelInputRef = ref<HTMLInputElement | null>(null)

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
  labelInputRef.value?.focus()
}

defineExpose({ focusLabel })
</script>
