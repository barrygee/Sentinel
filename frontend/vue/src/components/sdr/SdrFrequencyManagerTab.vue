<template>
  <span v-if="readOnly" class="sr-only" role="status"
    >Frequency manager is read-only while another Sentinel controls this radio</span
  >
  <div
    class="sdr-frequency-manager-freqs-body"
    :class="{ 'sdr-frequency-manager--readonly': readOnly }"
  >
    <div v-show="groupsWithFreqs.length > 0" class="sdr-frequency-manager-groups-filter">
      <div class="sdr-scan-groups-row sdr-frequency-manager-groups-filter-row">
        <BasePillToggle
          class="sdr-scan-group-chip"
          :active="freqFilterAllSelected"
          active-class="sdr-scan-group-chip-active"
          :disabled="readOnly"
          @click="toggleFreqFilterAll"
        >
          All
        </BasePillToggle>
        <BasePillToggle
          v-for="g in groupsWithFreqs"
          :key="g.id"
          class="sdr-scan-group-chip"
          :active="!freqFilterAllSelected && freqFilterSelectedGroupIds.includes(g.id)"
          active-class="sdr-scan-group-chip-active"
          :disabled="readOnly"
          @click="toggleFreqFilterGroup(g.id)"
        >
          {{ g.name }}
        </BasePillToggle>
      </div>
    </div>

    <div id="sdr-freq-list">
      <div
        v-for="f in filteredFreqs"
        :key="f.id"
        class="sdr-freq-row-item"
        :class="{ 'sdr-freq-editing': editingFreqId === f.id }"
        :data-id="f.id"
      >
        <div class="sdr-freq-row-top">
          <div class="sdr-freq-row-body">
            <div class="sdr-freq-row-main">
              <span class="sdr-freq-row-label">{{ f.label }}</span>
            </div>
            <div class="sdr-freq-row-sub">
              <span class="sdr-freq-row-hz">{{ (f.frequency_hz / 1e6).toFixed(4) }} MHz</span>
              <template v-if="f.mode">
                <span class="sdr-freq-row-sep">·</span>
                <span class="sdr-freq-row-mode">{{ f.mode }}</span>
              </template>
            </div>
            <div class="sdr-freq-row-groups">
              <template v-if="freqGroupsFor(f).length">
                <span v-for="g in freqGroupsFor(f)" :key="g.id" class="sdr-freq-row-group-chip">
                  {{ g.name }}
                </span>
              </template>
              <span v-else class="sdr-freq-row-group-chip"> Default </span>
            </div>
          </div>
          <BaseIconAction
            class="sdr-freq-row-play"
            accessible-name="Play frequency"
            title="Play"
            :disabled="tuningDisabled"
            @click.stop="emit('play', f)"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <polygon points="2,1 11,6 2,11" fill="currentColor" />
            </svg>
          </BaseIconAction>
          <BaseIconAction
            class="sdr-freq-row-edit"
            accessible-name="Edit frequency"
            title="Edit"
            :disabled="readOnly"
            @click.stop="toggleEditFreqPanel(f)"
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
            accessible-name="Delete frequency"
            title="Delete"
            :disabled="readOnly"
            @click.stop="deleteFreq(f.id)"
          >
            &#x2715;
          </BaseIconAction>
        </div>

        <!-- Inline edit form (accordion body) -->
        <div v-if="efOpen && editingFreqId === f.id" class="sdr-editfreq-body expanded" @click.stop>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">LABEL</label>
            <input
              v-model="efLabel"
              class="sdr-panel-input"
              :class="{ 'sdr-input-error': efErrors.label }"
              type="text"
              aria-label="Frequency label"
              placeholder="Label…"
              maxlength="60"
              style="width: 100%"
            />
            <div v-if="efErrors.label" class="sdr-field-error">{{ efErrors.label }}</div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">FREQ (MHz)</label>
            <input
              v-model="efFreq"
              class="sdr-panel-input"
              :class="{ 'sdr-input-error': efErrors.freq }"
              type="text"
              aria-label="Frequency in MHz"
              placeholder="118.3800"
              autocomplete="off"
              style="width: 100%"
            />
            <div v-if="efErrors.freq" class="sdr-field-error">{{ efErrors.freq }}</div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">MODE</label>
            <div class="sdr-mode-pills" :class="{ 'sdr-input-error': efErrors.mode }">
              <BasePillToggle
                v-for="m in MODES"
                :key="m"
                class="sdr-mode-pill"
                :active="efMode === m"
                active-class="active"
                @click="efMode = m"
              >
                {{ m }}
              </BasePillToggle>
            </div>
            <div v-if="efErrors.mode" class="sdr-field-error">{{ efErrors.mode }}</div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">GROUPS</label>
            <div class="sdr-fmod-groups">
              <BasePillToggle
                class="sdr-mode-pill sdr-ef-gpill"
                :active="efGroupIds.length === 0"
                active-class="active"
                @click="efGroupIds = []"
              >
                Default
              </BasePillToggle>
              <BasePillToggle
                v-for="g in groups"
                :key="g.id"
                class="sdr-mode-pill sdr-ef-gpill"
                :active="efGroupIds.includes(g.id)"
                active-class="active"
                @click="toggleEfGroup(g.id)"
              >
                {{ g.name }}
              </BasePillToggle>
            </div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">NOTES</label>
            <textarea
              v-model="efNotes"
              class="sdr-panel-input sdr-panel-textarea"
              :class="{ 'sdr-input-error': efErrors.notes }"
              aria-label="Frequency notes"
              placeholder="Notes…"
              rows="4"
              style="width: 100%"
            ></textarea>
            <div v-if="efErrors.notes" class="sdr-field-error">{{ efErrors.notes }}</div>
          </div>
          <div class="sdr-editfreq-field">
            <BaseAccordionSection
              v-model:expanded="efSettingsExpanded"
              title="RADIO SETTINGS"
              body-id="sdr-ef-settings-section"
              variant="form"
              body-class="sdr-ef-settings-grid"
            >
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">RF GAIN (dB)</span>
                <input
                  v-model="efGainDb"
                  class="sdr-panel-input sdr-ef-setting-input"
                  type="number"
                  step="0.1"
                  :disabled="efGainAuto"
                  aria-label="RF gain in dB"
                />
              </div>
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">AUTO (AGC)</span>
                <div class="sdr-ef-toggle-wrap">
                  <button
                    type="button"
                    class="sdr-ef-toggle"
                    :class="{ 'is-on': efGainAuto }"
                    role="switch"
                    :aria-checked="efGainAuto"
                    aria-label="Auto gain (AGC)"
                    @click="efGainAuto = !efGainAuto"
                  >
                    <span class="sdr-ef-toggle-thumb"></span>
                  </button>
                </div>
              </div>
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">BANDWIDTH (kHz)</span>
                <input
                  v-model="efBwKhz"
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
                  v-model="efSquelch"
                  class="sdr-panel-input sdr-ef-setting-input"
                  type="number"
                  aria-label="Squelch threshold in dBFS"
                />
              </div>
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">VOLUME (%)</span>
                <input
                  v-model="efVolume"
                  class="sdr-panel-input sdr-ef-setting-input"
                  type="number"
                  min="0"
                  max="100"
                  aria-label="Volume percent"
                />
              </div>
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">SAMPLE RATE</span>
                <SdrSampleRatePicker v-model="efSampleRate" />
              </div>
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">ZOOM</span>
                <input
                  v-model="efZoom"
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
                  v-model="efZmin"
                  class="sdr-panel-input sdr-ef-setting-input"
                  type="number"
                  aria-label="Waterfall minimum dB"
                />
              </div>
              <div class="sdr-ef-setting">
                <span class="sdr-field-label">WF MAX (dB)</span>
                <input
                  v-model="efZmax"
                  class="sdr-panel-input sdr-ef-setting-input"
                  type="number"
                  aria-label="Waterfall maximum dB"
                />
              </div>
            </BaseAccordionSection>
          </div>
          <div class="sdr-editfreq-actions">
            <div class="sdr-editfreq-actions-right">
              <button class="sdr-panel-btn" @click="cancelEditFreq">CANCEL</button>
              <button class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveFreq">SAVE</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      id="sdr-freq-empty"
      class="sdr-panel-empty"
      :style="{ display: freqs.length === 0 ? 'block' : 'none' }"
    >
      No saved frequencies.<br />Tune to a frequency and use Add Frequency to save it.
    </div>
    <div v-if="freqs.length > 0 && filteredFreqs.length === 0" class="sdr-panel-empty">
      No matches.
    </div>

    <div v-show="!(efOpen && editingFreqId === null)" class="sdr-frequency-manager-add-freq-row">
      <button
        id="sdr-radio-add-freq"
        class="sdr-add-freq-btn"
        :disabled="readOnly"
        @click="openAddFreqPanel"
      >
        Add Frequency
      </button>
    </div>

    <!-- Add frequency panel (only when adding, not editing) -->
    <div
      v-if="efOpen && editingFreqId === null"
      id="sdr-editfreq-body"
      class="sdr-editfreq-body sdr-addfreq-body expanded"
    >
      <div class="sdr-addfreq-title-row">
        <span class="sdr-scanner-section-label">ADD FREQUENCY</span>
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">LABEL</label>
        <input
          id="sdr-ef-label"
          v-model="efLabel"
          class="sdr-panel-input"
          :class="{ 'sdr-input-error': efErrors.label }"
          type="text"
          aria-label="Frequency label"
          placeholder="Label…"
          maxlength="60"
          style="width: 100%"
        />
        <div v-if="efErrors.label" class="sdr-field-error">{{ efErrors.label }}</div>
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">FREQ (MHz)</label>
        <input
          id="sdr-ef-freq"
          v-model="efFreq"
          class="sdr-panel-input"
          :class="{ 'sdr-input-error': efErrors.freq }"
          type="text"
          aria-label="Frequency in MHz"
          placeholder="118.3800"
          autocomplete="off"
          style="width: 100%"
        />
        <div v-if="efErrors.freq" class="sdr-field-error">{{ efErrors.freq }}</div>
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">MODE</label>
        <div
          id="sdr-ef-mode-pills"
          class="sdr-mode-pills"
          :class="{ 'sdr-input-error': efErrors.mode }"
        >
          <BasePillToggle
            v-for="m in MODES"
            :key="m"
            class="sdr-mode-pill"
            :active="efMode === m"
            active-class="active"
            @click="efMode = m"
          >
            {{ m }}
          </BasePillToggle>
        </div>
        <!-- No mode-error slot here: the Add panel seeds efMode from the
             current (always-valid) mode, so it can never fail mode
             validation. The inline per-row edit (which can open a stored
             frequency with a legacy/invalid mode) keeps its slot. -->
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">GROUPS</label>
        <div id="sdr-ef-groups" class="sdr-fmod-groups">
          <BasePillToggle
            class="sdr-mode-pill sdr-ef-gpill"
            :active="efGroupIds.length === 0"
            active-class="active"
            @click="efGroupIds = []"
          >
            Default
          </BasePillToggle>
          <BasePillToggle
            v-for="g in groups"
            :key="g.id"
            class="sdr-mode-pill sdr-ef-gpill"
            :active="efGroupIds.includes(g.id)"
            active-class="active"
            @click="toggleEfGroup(g.id)"
          >
            {{ g.name }}
          </BasePillToggle>
        </div>
      </div>
      <div class="sdr-editfreq-field">
        <label class="sdr-field-label">NOTES</label>
        <textarea
          id="sdr-ef-notes"
          v-model="efNotes"
          class="sdr-panel-input sdr-panel-textarea"
          :class="{ 'sdr-input-error': efErrors.notes }"
          aria-label="Frequency notes"
          placeholder="Notes…"
          rows="4"
          style="width: 100%"
        ></textarea>
        <div v-if="efErrors.notes" class="sdr-field-error">{{ efErrors.notes }}</div>
      </div>
      <div class="sdr-editfreq-field">
        <BaseAccordionSection
          v-model:expanded="efSettingsExpanded"
          title="RADIO SETTINGS"
          body-id="sdr-ef-settings-section"
          variant="form"
          body-class="sdr-ef-settings-grid"
        >
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">RF GAIN (dB)</span>
            <input
              v-model="efGainDb"
              class="sdr-panel-input sdr-ef-setting-input"
              type="number"
              step="0.1"
              :disabled="efGainAuto"
              aria-label="RF gain in dB"
            />
          </div>
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">AUTO (AGC)</span>
            <div class="sdr-ef-toggle-wrap">
              <button
                type="button"
                class="sdr-ef-toggle"
                :class="{ 'is-on': efGainAuto }"
                role="switch"
                :aria-checked="efGainAuto"
                aria-label="Auto gain (AGC)"
                @click="efGainAuto = !efGainAuto"
              >
                <span class="sdr-ef-toggle-thumb"></span>
              </button>
            </div>
          </div>
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">BANDWIDTH (kHz)</span>
            <input
              v-model="efBwKhz"
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
              v-model="efSquelch"
              class="sdr-panel-input sdr-ef-setting-input"
              type="number"
              aria-label="Squelch threshold in dBFS"
            />
          </div>
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">VOLUME (%)</span>
            <input
              v-model="efVolume"
              class="sdr-panel-input sdr-ef-setting-input"
              type="number"
              min="0"
              max="100"
              aria-label="Volume percent"
            />
          </div>
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">SAMPLE RATE</span>
            <SdrSampleRatePicker v-model="efSampleRate" />
          </div>
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">ZOOM</span>
            <input
              v-model="efZoom"
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
              v-model="efZmin"
              class="sdr-panel-input sdr-ef-setting-input"
              type="number"
              aria-label="Waterfall minimum dB"
            />
          </div>
          <div class="sdr-ef-setting">
            <span class="sdr-field-label">WF MAX (dB)</span>
            <input
              v-model="efZmax"
              class="sdr-panel-input sdr-ef-setting-input"
              type="number"
              aria-label="Waterfall maximum dB"
            />
          </div>
        </BaseAccordionSection>
      </div>
      <div class="sdr-editfreq-actions">
        <div class="sdr-editfreq-actions-right">
          <button id="sdr-ef-cancel" class="sdr-panel-btn" @click="cancelEditFreq">CANCEL</button>
          <button id="sdr-ef-save" class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveFreq">
            SAVE
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SdrFrequencyManagerTab — the FREQUENCY MANAGER tab of the SDR side panel:
 * the saved-frequency list with its group filter, plus the add / inline-edit
 * forms (label, freq, mode, groups, notes and the RADIO SETTINGS grid of
 * per-frequency tuning settings). CRUD goes against /api/sdr/frequencies.
 *
 * The tuning engine stays in the parent panel: the row play button emits
 * `play` (parent runs playFreq → applyStoredFreqSettings → tune), and the
 * add/edit forms seed their RADIO SETTINGS from the `live` prop (the parent's
 * current radio state) so a new frequency captures what the user is hearing.
 *
 * Emits `activate` when a form opens (parent switches the visible tab) and
 * `changed` after every successful save/delete (parent runs its full data
 * reload).
 *
 * Styling lives in SdrPanel.css (imported globally by SdrPanel.vue), same as
 * the other extracted panel sections.
 */
import { ref, computed, watch } from 'vue'
import BaseAccordionSection from '@/components/base/BaseAccordionSection.vue'
import BaseIconAction from '@/components/base/BaseIconAction.vue'
import BasePillToggle from '@/components/base/BasePillToggle.vue'
import SdrSampleRatePicker from './SdrSampleRatePicker.vue'
import { useSdrStore } from '@/stores/sdr'
import type { SdrFrequencyGroup, SdrStoredFrequency } from '@/stores/sdr'
import { parseFreqMhz, MODES } from './sdrPanelUtils'

/** The parent panel's live radio state, used to seed the add/edit forms. */
export interface SdrLiveTuneSeed {
  freqHz: number
  mode: string
  gainAuto: boolean
  gainDb: number
  bwHz: number
  squelch: number
  volume: number
  sampleRateHz: number
}

const props = defineProps<{
  /** Live radio state seeding new/legacy form fields (see SdrLiveTuneSeed). */
  live: SdrLiveTuneSeed
  /** Disables the row play buttons (no radio connected / read-only follower). */
  tuningDisabled: boolean
}>()

const emit = defineEmits<{
  /** Row play button: the parent tunes the radio to this stored frequency. */
  (event: 'play', freq: SdrStoredFrequency): void
  /** A form opened: the parent switches the visible tab to frequency-manager. */
  (event: 'activate'): void
  /** Fired after a successful save/delete so the parent reloads data. */
  (event: 'changed'): void
}>()

const sdrStore = useSdrStore()

const readOnly = computed(() => sdrStore.readOnly)
const groups = computed<SdrFrequencyGroup[]>(() => sdrStore.groups)
const freqs = computed<SdrStoredFrequency[]>(() => sdrStore.frequencies)
const groupsWithFreqs = computed<SdrFrequencyGroup[]>(() => sdrStore.groupsWithFreqs)
const freqGroupsFor = sdrStore.freqGroupsFor

// ── Group filter ──────────────────────────────────────────────────────────────
const freqFilterSelectedGroupIds = ref<number[]>([])
const freqFilterAllSelected = ref(true)

const filteredFreqs = computed<SdrStoredFrequency[]>(() => {
  if (!freqFilterAllSelected.value && freqFilterSelectedGroupIds.value.length > 0) {
    const selected = new Set(freqFilterSelectedGroupIds.value)
    return freqs.value.filter((f) => freqGroupsFor(f).some((g) => selected.has(g.id)))
  }
  return freqs.value
})

function toggleFreqFilterAll() {
  freqFilterAllSelected.value = true
  freqFilterSelectedGroupIds.value = []
}

function toggleFreqFilterGroup(id: number) {
  if (freqFilterAllSelected.value) {
    freqFilterAllSelected.value = false
    freqFilterSelectedGroupIds.value = [id]
    return
  }
  const idx = freqFilterSelectedGroupIds.value.indexOf(id)
  if (idx >= 0) freqFilterSelectedGroupIds.value.splice(idx, 1)
  else freqFilterSelectedGroupIds.value.push(id)
  if (freqFilterSelectedGroupIds.value.length === 0) freqFilterAllSelected.value = true
}

// ── Edit frequency panel ──────────────────────────────────────────────────────
const efOpen = ref(false)
const editingFreqId = ref<number | null>(null)
const efLabel = ref('')
const efFreq = ref('')
const efMode = ref('AM')
const efGroupIds = ref<number[]>([])
const efNotes = ref('')
// Per-frequency tuning settings for the add/edit form. Numeric fields are
// strings (parsed on save) to mirror the freq input; efGainAuto toggles AGC
// (stored as gain = -1), and efSampleRate is a concrete option value.
const efGainDb = ref('30')
const efGainAuto = ref(false)
const efBwKhz = ref('10')
const efSquelch = ref('-60')
const efVolume = ref('80')
const efSampleRate = ref<number>(2048000)
const efSettingsExpanded = ref(false)
const efZoom = ref('1')
const efZmin = ref('0')
const efZmax = ref('0')
const efErrors = ref<{ label?: string; freq?: string; mode?: string; notes?: string }>({})

watch(efLabel, () => {
  if (efErrors.value.label) efErrors.value = { ...efErrors.value, label: undefined }
})
watch(efFreq, () => {
  if (efErrors.value.freq) efErrors.value = { ...efErrors.value, freq: undefined }
})
watch(efMode, () => {
  // efMode is only ever set from the mode pills (always a valid MODES entry), so
  // clearing an existing error is the only observable effect of this watcher.
  if (efErrors.value.mode) efErrors.value = { ...efErrors.value, mode: undefined }
})
watch(efNotes, () => {
  if (efErrors.value.notes) efErrors.value = { ...efErrors.value, notes: undefined }
})

const NOTES_ALLOWED = /^[A-Za-z0-9\s.,!?\-_():;/@]*$/

function openAddFreqPanel() {
  editingFreqId.value = null
  efLabel.value = ''
  efFreq.value = props.live.freqHz ? (props.live.freqHz / 1e6).toFixed(4) : ''
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  efMode.value = props.live.mode || 'AM'
  /* v8 ignore stop */
  efGroupIds.value = []
  efNotes.value = ''
  // New frequencies default their tuning settings to the live radio settings.
  efGainAuto.value = props.live.gainAuto
  efGainDb.value = String(props.live.gainDb)
  efBwKhz.value = String(props.live.bwHz / 1000)
  efSquelch.value = String(props.live.squelch)
  efVolume.value = String(props.live.volume)
  efSampleRate.value = props.live.sampleRateHz
  efZoom.value = String(sdrStore.viewZoom)
  efZmin.value = String(sdrStore.viewZmin)
  efZmax.value = String(sdrStore.viewZmax)
  efErrors.value = {}
  efOpen.value = true
  emit('activate')
}

function openEditFreqPanel(f: SdrStoredFrequency) {
  editingFreqId.value = f.id
  efLabel.value = f.label
  efFreq.value = (f.frequency_hz / 1e6).toFixed(4)
  efMode.value = f.mode
  efGroupIds.value = (f.group_ids || []).filter((id) => id !== 0)
  efNotes.value = f.notes ?? ''
  // Seed the settings from the stored values, falling back to the live settings
  // for anything a legacy row (predating these fields) didn't carry.
  efGainAuto.value = (f.gain ?? props.live.gainDb) < 0
  efGainDb.value = String(f.gain ?? props.live.gainDb)
  efBwKhz.value = String((f.bandwidth ?? props.live.bwHz) / 1000)
  efSquelch.value = String(f.squelch ?? props.live.squelch)
  efVolume.value = String(f.volume ?? props.live.volume)
  efSampleRate.value = f.sample_rate ?? props.live.sampleRateHz
  efZoom.value = String(f.zoom ?? sdrStore.viewZoom)
  efZmin.value = String(f.zmin ?? sdrStore.viewZmin)
  efZmax.value = String(f.zmax ?? sdrStore.viewZmax)
  efErrors.value = {}
  efOpen.value = true
  emit('activate')
}

function toggleEditFreqPanel(f: SdrStoredFrequency) {
  if (efOpen.value && editingFreqId.value === f.id) {
    cancelEditFreq()
  } else {
    openEditFreqPanel(f)
  }
}

function cancelEditFreq() {
  editingFreqId.value = null
  efOpen.value = false
  efErrors.value = {}
}

function validateFreqForm(): boolean {
  const errs: { label?: string; freq?: string; mode?: string; notes?: string } = {}
  const label = efLabel.value.trim()
  if (!label) errs.label = 'Label is required'
  else if (label.length > 60) errs.label = 'Label must be 60 characters or fewer'
  const hz = parseFreqMhz(efFreq.value)
  if (!hz) errs.freq = 'Enter a valid frequency in MHz'
  // Reachable when editing a stored frequency whose mode isn't one of MODES.
  if (!efMode.value || !(MODES as readonly string[]).includes(efMode.value))
    errs.mode = 'Select a mode'
  if (efNotes.value && !NOTES_ALLOWED.test(efNotes.value))
    errs.notes = 'Notes contain disallowed characters'
  efErrors.value = errs
  return Object.keys(errs).length === 0
}

function toggleEfGroup(id: number) {
  const idx = efGroupIds.value.indexOf(id)
  if (idx === -1) efGroupIds.value = [...efGroupIds.value, id]
  else efGroupIds.value = efGroupIds.value.filter((i) => i !== id)
}

// Parse the per-frequency tuning settings from the add/edit form into the API
// shape. Each value falls back to a sensible default if the field was cleared
// or non-numeric, so a malformed entry never blocks the save.
function freqSettingsPayload() {
  const gain = efGainAuto.value ? -1 : numOr(efGainDb.value, 30)
  const volume = Math.min(100, Math.max(0, Math.round(numOr(efVolume.value, 80))))
  return {
    squelch: numOr(efSquelch.value, -60),
    gain,
    bandwidth: Math.round(numOr(efBwKhz.value, 10) * 1000),
    sample_rate: efSampleRate.value,
    volume,
    zoom: numOr(efZoom.value, 1),
    zmin: numOr(efZmin.value, 0),
    zmax: numOr(efZmax.value, 0),
  }
}

function numOr(raw: string, fallback: number): number {
  const parsed = parseFloat(raw)
  return isFinite(parsed) ? parsed : fallback
}

async function saveFreq() {
  if (!validateFreqForm()) return
  const label = efLabel.value.trim()
  const hz = parseFreqMhz(efFreq.value)
  // validateFreqForm() above already guarantees a non-empty label and valid hz.
  /* v8 ignore start */
  if (!label || !hz) return
  /* v8 ignore stop */
  try {
    if (editingFreqId.value !== null) {
      const existing = freqs.value.find((x) => x.id === editingFreqId.value)
      await fetch(`/api/sdr/frequencies/${editingFreqId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          frequency_hz: hz,
          mode: efMode.value,
          group_ids: efGroupIds.value,
          ...freqSettingsPayload(),
          /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          scannable: existing?.scannable ?? true,
          /* v8 ignore stop */
          notes: efNotes.value,
        }),
      })
    } else {
      await fetch('/api/sdr/frequencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          frequency_hz: hz,
          mode: efMode.value,
          ...freqSettingsPayload(),
          scannable: true,
          group_ids: efGroupIds.value,
          notes: efNotes.value,
        }),
      })
    }
    editingFreqId.value = null
    efOpen.value = false
    emit('changed')
  } catch (_) {}
}

async function deleteFreq(id?: number) {
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  const targetId = id ?? editingFreqId.value
  /* v8 ignore stop */
  // Every caller passes a concrete row id, so targetId is never nullish here.
  /* v8 ignore start */
  if (targetId === null || targetId === undefined) return
  /* v8 ignore stop */
  try {
    await fetch(`/api/sdr/frequencies/${targetId}`, { method: 'DELETE' })
    if (editingFreqId.value === targetId) {
      editingFreqId.value = null
      efOpen.value = false
    }
    emit('changed')
  } catch (_) {}
}
</script>
