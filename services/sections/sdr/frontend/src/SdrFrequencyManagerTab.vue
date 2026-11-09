<template>
  <span v-if="readOnly" class="sr-only" role="status"
    >Frequency manager is read-only while another Sentinel controls this radio</span
  >
  <!-- Row-action announcements. Covers a failed favourite toggle (the star's
       own accessible name already reflects a SUCCESSFUL change, so that needs
       no announcement) and the remove flow, where the row and its button
       disappear from under the user. -->
  <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{
    rowStatusMessage
  }}</span>
  <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{
    searchStatusMessage
  }}</span>
  <!-- Outside the body below: its read-only dimming shouldn't reach the search,
       which keeps working when the list can't be edited. A plain text input and
       no landmark, as this panel stays mounted on every page, where it would
       otherwise be a second search beside that page's own. -->
  <BaseSearchField
    v-model="frequencySearch.query.value"
    class="sdr-frequency-search"
    variant="panel"
    input-type="text"
    :landmark="false"
    input-id="sdr-frequency-search-input"
    label="Search frequencies by label, frequency, mode, group or notes"
    placeholder="LABEL · FREQ · MODE · GROUP"
  />
  <div
    class="sdr-frequency-manager-freqs-body"
    :class="{ 'sdr-frequency-manager--readonly': readOnly }"
  >
    <div
      v-show="!(frequencyEditorOpen && editingFreqId === null)"
      class="sdr-frequency-manager-add-freq-row"
    >
      <button
        id="sdr-radio-add-freq"
        ref="addFreqButtonRef"
        class="sdr-add-freq-btn"
        :disabled="readOnly"
        @click="openAddFreqPanel()"
      >
        Add Frequency
      </button>
    </div>

    <!-- Add frequency panel (only when adding, not editing) -->
    <div
      v-if="frequencyEditorOpen && editingFreqId === null"
      id="sdr-editfreq-body"
      class="sdr-editfreq-body sdr-addfreq-body expanded"
    >
      <div class="sdr-addfreq-title-row">
        <span class="sdr-scanner-section-label">ADD FREQUENCY</span>
      </div>
      <SdrFrequencyForm
        ref="addFormRef"
        v-model="frequencyEditor"
        v-model:settings-expanded="frequencySettingsExpanded"
        id-prefix="sdr-ef"
        :groups="groups"
        :errors="frequencyEditorErrors"
        @save="saveFreq"
        @cancel="cancelEditFreq"
      />
    </div>

    <!-- Group-filter chips, tucked into their own GROUPS accordion. -->
    <SdrFrequencyGroupFilter
      v-model:expanded="groupFilter.expanded.value"
      body-id="sdr-freq-manager-groups-section"
      :groups="groupsWithFreqs"
      :selected-group-ids="groupFilter.selectedGroupIds.value"
      :all-selected="groupFilter.allSelected.value"
      :disabled="readOnly"
      @toggle-all="groupFilter.toggleAll"
      @toggle-group="groupFilter.toggleGroup"
    />

    <div id="sdr-freq-list" ref="freqListRef">
      <div
        v-for="frequency in filteredFreqs"
        :key="frequency.id"
        class="sdr-freq-row-item"
        :class="{ 'sdr-freq-editing': editingFreqId === frequency.id }"
        :data-id="frequency.id"
      >
        <SdrFrequencyRowSummary :frequency="frequency">
          <template #actions>
            <SdrFavouriteStar
              :favourite="frequency.favourite === true"
              :frequency-label="frequency.label"
              :disabled="readOnly"
              @toggle="toggleFavourite(frequency)"
            />
            <BaseIconAction
              class="sdr-freq-row-play"
              accessible-name="Tune to frequency"
              tooltip="Tune to"
              tooltip-side="bottom"
              :disabled="tuningDisabled"
              @click.stop="emit('play', frequency)"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <polygon points="2,1 11,6 2,11" fill="currentColor" />
              </svg>
            </BaseIconAction>
            <BaseIconAction
              class="sdr-freq-row-edit"
              accessible-name="Edit frequency"
              tooltip="Edit"
              tooltip-side="bottom"
              :disabled="readOnly"
              @click.stop="toggleEditFreqPanel(frequency)"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"
                  fill="currentColor"
                />
              </svg>
            </BaseIconAction>
            <!-- Inline remove confirm, same arm→confirm pattern as the
                 recordings list: ✕ arms the row, then ✓ commits and ✕ cancels.
                 Deleting a saved frequency is irreversible, so it should never
                 be one stray click away. -->
            <template v-if="confirmDeleteFreqId === frequency.id">
              <BaseIconAction
                class="sdr-freq-row-del sdr-freq-row-del--confirm"
                accessible-name="Confirm remove frequency"
                tooltip="Confirm remove"
                tooltip-side="bottom"
                :disabled="readOnly"
                @click.stop="confirmRemoveFreq(frequency)"
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
                class="sdr-freq-row-del sdr-freq-row-del--cancel"
                accessible-name="Cancel remove frequency"
                tooltip="Cancel"
                tooltip-side="bottom"
                @click.stop="cancelRemoveFreq(frequency)"
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
              class="sdr-freq-row-del"
              accessible-name="Remove frequency"
              tooltip="Remove"
              tooltip-side="bottom"
              :disabled="readOnly"
              @click.stop="armRemoveFreq(frequency)"
            >
              &#x2715;
            </BaseIconAction>
          </template>
        </SdrFrequencyRowSummary>

        <!-- Inline edit form (accordion body) -->
        <div
          v-if="frequencyEditorOpen && editingFreqId === frequency.id"
          class="sdr-editfreq-body expanded"
          @click.stop
        >
          <SdrFrequencyForm
            v-model="frequencyEditor"
            v-model:settings-expanded="frequencySettingsExpanded"
            :groups="groups"
            :errors="frequencyEditorErrors"
            @save="saveFreq"
            @cancel="cancelEditFreq"
          />
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
  </div>
</template>

<script setup lang="ts">
/**
 * SdrFrequencyManagerTab — the FREQUENCY MANAGER tab of the SDR side panel:
 * the saved-frequency list with its group filter, plus the add / inline-edit
 * forms (label, freq, mode, groups, notes and the RADIO SETTINGS grid of
 * per-frequency tuning settings). CRUD goes against /api/sdr/frequencies.
 *
 * The GROUPS filter (`SdrFrequencyGroupFilter` + `useFrequencyGroupFilter`)
 * and the row body (`SdrFrequencyRowSummary`) are shared with
 * `SdrFavouritesSection` rather than duplicated. The search field at the top
 * (`useFrequencySearch`) narrows what the group filter leaves. Each row's action cluster
 * leads with `SdrFavouriteStar` (star before play/edit/delete, so the two
 * destructive-adjacent buttons stay where muscle memory expects them) —
 * starring here is what populates the RADIO panel's FAVOURITES accordion.
 *
 * The Add panel and the inline row editor render the same `SdrFrequencyForm`;
 * this tab owns its state (`frequencyEditor`), validation and saving.
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
import { ref, computed, watch, nextTick } from 'vue'
import BaseIconAction from '@sentinel/ui/base/BaseIconAction.vue'
import BaseSearchField from '@sentinel/ui/base/BaseSearchField.vue'
import SdrFavouriteStar from './SdrFavouriteStar.vue'
import SdrFrequencyForm from './SdrFrequencyForm.vue'
import SdrFrequencyGroupFilter from './SdrFrequencyGroupFilter.vue'
import SdrFrequencyRowSummary from './SdrFrequencyRowSummary.vue'
import { useFrequencyGroupFilter } from './composables/useFrequencyGroupFilter'
import { useFrequencySearch } from './composables/useFrequencySearch'
import type { FrequencyEditorErrors, FrequencyEditorState } from './sdrFrequencyEditor'
import { useSdrStore } from './stores/sdr'
import type { SdrFrequencyGroup, SdrStoredFrequency } from './stores/sdr'
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
// State + filtering live in useFrequencyGroupFilter, paired with the
// presentational SdrFrequencyGroupFilter; this tab is the only host (the
// FAVOURITES section is deliberately unfiltered — it is a short hand-picked
// list). See the composable's doc for the "No matches." stranding behaviour
// this tab's specs pin.
const groupFilter = useFrequencyGroupFilter(freqGroupsFor)
const frequencySearch = useFrequencySearch(freqGroupsFor)
const filteredFreqs = computed<SdrStoredFrequency[]>(() =>
  frequencySearch.searchFrequencies(groupFilter.filterFrequencies(freqs.value)),
)

// Rows change silently as the user types, so a screen reader needs the count.
const searchStatusMessage = computed(() => {
  if (frequencySearch.query.value.trim() === '') return ''
  const count = filteredFreqs.value.length
  return `${count} ${count === 1 ? 'frequency' : 'frequencies'} found`
})

// Announces row-action outcomes (see the template's sr-only status span).
const rowStatusMessage = ref('')

// The saved-frequency list element, used to find a specific row's action
// button by `data-id`, and the Add Frequency button as the last-resort focus
// target when the removed row had no neighbour left to receive focus.
const freqListRef = ref<HTMLElement | null>(null)
const addFreqButtonRef = ref<HTMLButtonElement | null>(null)

// The row whose ✕ is "armed" — swaps it for a ✓ / ✕ pair until confirmed,
// mirroring the recordings list's inline delete confirm. A single value, so
// only one row can ever be armed.
const confirmDeleteFreqId = ref<number | null>(null)

// Disarm a row that leaves the visible list (group filter changed, or the
// parent reloaded the data). Without this the row stays armed while hidden and
// comes back pre-armed, leaving a destructive ✓ one stray click away in a
// state the user has long since forgotten arming.
watch(filteredFreqs, (visibleFreqs) => {
  if (confirmDeleteFreqId.value === null) return
  if (!visibleFreqs.some((freq) => freq.id === confirmDeleteFreqId.value)) {
    confirmDeleteFreqId.value = null
  }
})

/**
 * Moves keyboard focus to one of a row's action buttons, addressing the row by
 * its `data-id` rather than keeping a parallel Map of element refs: the rows
 * already carry `data-id` for exactly this kind of lookup, and every button in
 * the arm→confirm swap is created/destroyed as the state changes, so a ref map
 * would need constant re-syncing. Returns whether the target was found.
 *
 * This exists because each step of the remove flow REPLACES the button the
 * user just activated (✕ → ✓/✕ → gone), which would otherwise drop focus onto
 * `document.body` and lose the keyboard user's place in the list entirely.
 */
async function focusRowAction(frequencyId: number | null, actionSelector: string) {
  if (frequencyId === null) return false
  await nextTick()
  const button = freqListRef.value?.querySelector<HTMLElement>(
    `[data-id="${frequencyId}"] ${actionSelector}`,
  )
  button?.focus()
  return button !== null && button !== undefined
}

/** Arms a row's ✕, moving focus onto the ✓ that replaces it. */
async function armRemoveFreq(freq: SdrStoredFrequency) {
  confirmDeleteFreqId.value = freq.id
  rowStatusMessage.value = `Confirm removal of ${freq.label}, or cancel`
  await focusRowAction(freq.id, '.sdr-freq-row-del--confirm')
}

/** Cancels an armed row, returning focus to the ✕ it came from. */
async function cancelRemoveFreq(freq: SdrStoredFrequency) {
  confirmDeleteFreqId.value = null
  rowStatusMessage.value = `Removal of ${freq.label} cancelled`
  await focusRowAction(freq.id, '.sdr-freq-row-del')
}

// Star a/unstar a stored frequency. Uses the store's dedicated favourite PATCH
// (not the full-replace frequency PUT saveFreq below uses) so toggling a star
// never risks resetting the row's other fields.
async function toggleFavourite(freq: SdrStoredFrequency) {
  const nextFavourite = !freq.favourite
  try {
    await sdrStore.setFrequencyFavourite(freq.id, nextFavourite)
  } catch {
    // The row simply keeps its previous favourite state on failure — the
    // star reverts visually, so a screen-reader user needs the explicit
    // announcement to know the press didn't take.
    rowStatusMessage.value = `Failed to ${nextFavourite ? 'favourite' : 'unfavourite'} ${freq.label}`
  }
}

// ── Add / edit frequency form ─────────────────────────────────────────────────
const frequencyEditorOpen = ref(false)
const editingFreqId = ref<number | null>(null)
const addFormRef = ref<InstanceType<typeof SdrFrequencyForm> | null>(null)
// Replaced whole each time a form opens; the defaults only fill the first render.
const frequencyEditor = ref<FrequencyEditorState>({
  label: '',
  frequencyMhz: '',
  mode: 'AM',
  groupIds: [],
  notes: '',
  gainDb: '30',
  gainAuto: false,
  bandwidthKhz: '10',
  squelchDbfs: '-60',
  volumePercent: '80',
  sampleRateHz: 2048000,
  zoom: '1',
  waterfallMinDb: '0',
  waterfallMaxDb: '0',
})
// Kept here, not in the form, so RADIO SETTINGS stays as the user left it
// across openings of the form.
const frequencySettingsExpanded = ref(false)
const frequencyEditorErrors = ref<FrequencyEditorErrors>({})

// Editing a field clears its error, so the message never outlives the problem.
watch(
  () => frequencyEditor.value.label,
  () => {
    if (frequencyEditorErrors.value.label)
      frequencyEditorErrors.value = { ...frequencyEditorErrors.value, label: undefined }
  },
)
watch(
  () => frequencyEditor.value.frequencyMhz,
  () => {
    if (frequencyEditorErrors.value.freq)
      frequencyEditorErrors.value = { ...frequencyEditorErrors.value, freq: undefined }
  },
)
watch(
  () => frequencyEditor.value.mode,
  () => {
    // The mode is only ever set from the mode pills (always a valid MODES entry),
    // so clearing an existing error is the only observable effect of this watcher.
    if (frequencyEditorErrors.value.mode)
      frequencyEditorErrors.value = { ...frequencyEditorErrors.value, mode: undefined }
  },
)
watch(
  () => frequencyEditor.value.notes,
  () => {
    if (frequencyEditorErrors.value.notes)
      frequencyEditorErrors.value = { ...frequencyEditorErrors.value, notes: undefined }
  },
)

const NOTES_ALLOWED = /^[A-Za-z0-9\s.,!?\-_():;/@]*$/

function openAddFreqPanel() {
  editingFreqId.value = null
  // New frequencies default their tuning settings to the live radio settings.
  frequencyEditor.value = {
    label: '',
    frequencyMhz: props.live.freqHz ? (props.live.freqHz / 1e6).toFixed(4) : '',
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    mode: props.live.mode || 'AM',
    /* v8 ignore stop */
    groupIds: [],
    notes: '',
    gainAuto: props.live.gainAuto,
    gainDb: String(props.live.gainDb),
    bandwidthKhz: String(props.live.bwHz / 1000),
    squelchDbfs: String(props.live.squelch),
    volumePercent: String(props.live.volume),
    sampleRateHz: props.live.sampleRateHz,
    zoom: String(sdrStore.viewZoom),
    waterfallMinDb: String(sdrStore.viewZmin),
    waterfallMaxDb: String(sdrStore.viewZmax),
  }
  frequencyEditorErrors.value = {}
  frequencyEditorOpen.value = true
  emit('activate')
}

/**
 * Opens the add form for `frequencyHz`, which may differ from the tuned
 * frequency, and puts the cursor on LABEL: that's the field left to fill, and
 * the button that called this has just been hidden by the tab change, which
 * would otherwise drop keyboard focus.
 */
async function addFrequency(frequencyHz: number) {
  openAddFreqPanel()
  frequencyEditor.value.frequencyMhz = (frequencyHz / 1e6).toFixed(4)
  await nextTick()
  addFormRef.value?.focusLabel()
}

defineExpose({ addFrequency })

function openEditFreqPanel(frequency: SdrStoredFrequency) {
  editingFreqId.value = frequency.id
  // Seed the settings from the stored values, falling back to the live settings
  // for anything a legacy row (predating these fields) didn't carry.
  frequencyEditor.value = {
    label: frequency.label,
    frequencyMhz: (frequency.frequency_hz / 1e6).toFixed(4),
    mode: frequency.mode,
    groupIds: (frequency.group_ids || []).filter((groupId) => groupId !== 0),
    notes: frequency.notes ?? '',
    gainAuto: (frequency.gain ?? props.live.gainDb) < 0,
    gainDb: String(frequency.gain ?? props.live.gainDb),
    bandwidthKhz: String((frequency.bandwidth ?? props.live.bwHz) / 1000),
    squelchDbfs: String(frequency.squelch ?? props.live.squelch),
    volumePercent: String(frequency.volume ?? props.live.volume),
    sampleRateHz: frequency.sample_rate ?? props.live.sampleRateHz,
    zoom: String(frequency.zoom ?? sdrStore.viewZoom),
    waterfallMinDb: String(frequency.zmin ?? sdrStore.viewZmin),
    waterfallMaxDb: String(frequency.zmax ?? sdrStore.viewZmax),
  }
  frequencyEditorErrors.value = {}
  frequencyEditorOpen.value = true
  emit('activate')
}

function toggleEditFreqPanel(frequency: SdrStoredFrequency) {
  if (frequencyEditorOpen.value && editingFreqId.value === frequency.id) {
    cancelEditFreq()
  } else {
    openEditFreqPanel(frequency)
  }
}

function cancelEditFreq() {
  editingFreqId.value = null
  frequencyEditorOpen.value = false
  frequencyEditorErrors.value = {}
}

function validateFreqForm(): boolean {
  const editor = frequencyEditor.value
  const errors: FrequencyEditorErrors = {}
  const label = editor.label.trim()
  if (!label) errors.label = 'Label is required'
  else if (label.length > 60) errors.label = 'Label must be 60 characters or fewer'
  if (!parseFreqMhz(editor.frequencyMhz)) errors.freq = 'Enter a valid frequency in MHz'
  // Reachable when editing a stored frequency whose mode isn't one of MODES.
  if (!editor.mode || !(MODES as readonly string[]).includes(editor.mode))
    errors.mode = 'Select a mode'
  if (editor.notes && !NOTES_ALLOWED.test(editor.notes))
    errors.notes = 'Notes contain disallowed characters'
  frequencyEditorErrors.value = errors
  return Object.keys(errors).length === 0
}

// Parse the per-frequency tuning settings from the add/edit form into the API
// shape. Each value falls back to a sensible default if the field was cleared
// or non-numeric, so a malformed entry never blocks the save.
function freqSettingsPayload() {
  const editor = frequencyEditor.value
  const gain = editor.gainAuto ? -1 : numOr(editor.gainDb, 30)
  const volume = Math.min(100, Math.max(0, Math.round(numOr(editor.volumePercent, 80))))
  return {
    squelch: numOr(editor.squelchDbfs, -60),
    gain,
    bandwidth: Math.round(numOr(editor.bandwidthKhz, 10) * 1000),
    sample_rate: editor.sampleRateHz,
    volume,
    zoom: numOr(editor.zoom, 1),
    zmin: numOr(editor.waterfallMinDb, 0),
    zmax: numOr(editor.waterfallMaxDb, 0),
  }
}

function numOr(raw: string, fallback: number): number {
  const parsed = parseFloat(raw)
  return isFinite(parsed) ? parsed : fallback
}

async function saveFreq() {
  if (!validateFreqForm()) return
  const editor = frequencyEditor.value
  const label = editor.label.trim()
  const frequencyHz = parseFreqMhz(editor.frequencyMhz)
  // validateFreqForm() above already guarantees a non-empty label and valid frequency.
  /* v8 ignore start */
  if (!label || !frequencyHz) return
  /* v8 ignore stop */
  try {
    if (editingFreqId.value !== null) {
      const existing = freqs.value.find((frequency) => frequency.id === editingFreqId.value)
      await fetch(`/api/sdr/frequencies/${editingFreqId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          frequency_hz: frequencyHz,
          mode: editor.mode,
          group_ids: editor.groupIds,
          ...freqSettingsPayload(),
          /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          scannable: existing?.scannable ?? true,
          /* v8 ignore stop */
          // This PUT is a full replace (see the store's setFrequencyFavourite
          // doc for why the star toggle uses a dedicated PATCH instead), so
          // the star's current value must be resent here or saving the edit
          // form would silently unfavourite the row.
          favourite: existing?.favourite ?? false,
          notes: editor.notes,
        }),
      })
    } else {
      await fetch('/api/sdr/frequencies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label,
          frequency_hz: frequencyHz,
          mode: editor.mode,
          ...freqSettingsPayload(),
          scannable: true,
          favourite: false,
          group_ids: editor.groupIds,
          notes: editor.notes,
        }),
      })
    }
    editingFreqId.value = null
    frequencyEditorOpen.value = false
    emit('changed')
  } catch {
    // A failed request leaves the form open with what the user typed, to retry.
  }
}

/**
 * Deletes the frequency whose ✕ was armed and then confirmed with ✓. Only
 * reachable from the armed state, so the confirm is the guard — there is no
 * unconfirmed delete path.
 */
async function confirmRemoveFreq(freq: SdrStoredFrequency) {
  // Pick the focus successor BEFORE the row goes: once deleted it has no
  // neighbours to ask.
  const currentIndex = filteredFreqs.value.findIndex((item) => item.id === freq.id)
  const successorId =
    filteredFreqs.value[currentIndex + 1]?.id ?? filteredFreqs.value[currentIndex - 1]?.id ?? null
  confirmDeleteFreqId.value = null
  try {
    await fetch(`/api/sdr/frequencies/${freq.id}`, { method: 'DELETE' })
    if (editingFreqId.value === freq.id) {
      editingFreqId.value = null
      frequencyEditorOpen.value = false
    }
    rowStatusMessage.value = `${freq.label} removed`
    emit('changed')
    // The parent's reload drives the row's actual removal, so the successor's
    // ✕ may not be focusable yet on the first tick; fall back to the always
    // present Add Frequency button rather than leaving focus on nothing.
    if (!(await focusRowAction(successorId, '.sdr-freq-row-del'))) {
      addFreqButtonRef.value?.focus()
    }
  } catch {
    // Nothing to roll back locally: the row is only removed once the parent's
    // reload lands, so a failed delete simply leaves it in place.
    rowStatusMessage.value = `Failed to remove ${freq.label}`
  }
}
</script>
