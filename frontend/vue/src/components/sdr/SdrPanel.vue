<template>
  <!-- ── LEFT RAIL (teleported so it persists when the side panel hides) ── -->
  <Teleport to="body">
    <div id="sdr-sidebar-rail" v-show="isSdrRoute">
      <button
        v-for="tab in sdrTabs"
        :key="tab.id"
        type="button"
        class="sdr-rail-btn"
        :class="{ 'sdr-rail-btn-active': activeSdrTab === tab.id && sidebarOpen }"
        :data-tab="tab.id"
        :data-tooltip="tab.label"
        :aria-label="tab.label"
        @click="onSdrTabClick(tab.id)"
      >
        <!-- radio (receiver with antenna and dial) -->
        <svg v-if="tab.id === 'radio'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linecap="round">
          <line x1="6" y1="9" x2="18" y2="3" stroke="currentColor" stroke-width="1.6"/>
          <rect x="3" y="9" width="18" height="12" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
          <circle cx="16" cy="15" r="2.6" stroke="currentColor" stroke-width="1.6"/>
          <line x1="6" y1="13" x2="11" y2="13" stroke="currentColor" stroke-width="1.6"/>
          <line x1="6" y1="17" x2="11" y2="17" stroke="currentColor" stroke-width="1.6"/>
        </svg>
        <!-- scanner -->
        <svg v-else-if="tab.id === 'scanner'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linecap="round">
          <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.8"/>
          <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" stroke-width="1.6"/>
          <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" stroke-width="1.8"/>
        </svg>
        <!-- memory (bookmark) -->
        <svg v-else-if="tab.id === 'memory'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M6 3h12v18l-6-4-6 4V3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
        </svg>
        <!-- recordings -->
        <svg v-else-if="tab.id === 'recordings'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
          <circle cx="12" cy="12" r="4" fill="currentColor"/>
        </svg>
      </button>
    </div>
  </Teleport>

  <div id="sdr-panel-panes">

    <!-- ── TAB PANES ── -->
    <div class="sdr-tab-panes">

      <!-- ───────────── RADIO TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'radio' }">

        <!-- Device dropdown -->
        <div class="sdr-radio-section">
          <div
            ref="deviceDropdownRef"
            class="sdr-device-dropdown"
            :class="{
              'sdr-device-dropdown--loading': radiosLoading,
              'sdr-device-dropdown--open': deviceMenuOpen,
            }"
            tabindex="0"
            @click.stop="toggleDeviceMenu"
            @keydown="onDeviceDropdownKey"
          >
            <div class="sdr-device-dropdown-selected">
              <div
                class="sdr-conn-dot"
                :class="connected ? 'sdr-dot-on' : 'sdr-dot-off'"
                :title="connected ? 'CONNECTED' : 'DISCONNECTED'"
              ></div>
              <span
                class="sdr-device-dropdown-text"
                :class="{ 'sdr-device-dropdown-text--chosen': selectedRadioId !== null }"
              >{{ deviceDropdownLabel }}</span>
              <span class="sdr-device-dropdown-arrow"></span>
            </div>
          </div>
          <Teleport to="body">
            <div
              v-if="deviceMenuOpen"
              ref="deviceMenuRef"
              class="sdr-device-menu sdr-device-menu--open"
              :style="deviceMenuStyle"
              @click.stop
            >
              <div class="sdr-device-menu-item sdr-device-menu-placeholder" @click="selectRadio(null)">— select radio —</div>
              <template v-if="menuCheckingRadios">
                <div class="sdr-device-menu-item sdr-device-menu-placeholder">checking radios…</div>
              </template>
              <template v-else-if="menuRadios.length === 0">
                <div class="sdr-device-menu-item sdr-device-menu-placeholder">no radios online</div>
              </template>
              <template v-else>
                <div
                  v-for="r in menuRadios"
                  :key="r.id"
                  class="sdr-device-menu-item"
                  @click="selectRadio(r)"
                >
                  {{ r.name }}<span class="sdr-device-menu-item-host">{{ r.host }}</span>
                </div>
              </template>
            </div>
          </Teleport>
        </div>

        <!-- Frequency -->
        <div class="sdr-radio-section">
          <div class="sdr-freq-row">
            <input
              ref="freqInputRef"
              class="sdr-freq-input-large"
              type="text"
              size="8"
              placeholder="100.0000"
              autocomplete="off"
              spellcheck="false"
              :disabled="controlsDisabled"
              v-model="freqInputVal"
              @keydown.enter="tune"
              @input="onFreqInputChange"
              @blur="formatFreqInput"
            >
            <span class="sdr-freq-unit">MHz</span>
          </div>
          <div class="sdr-freq-actions-row">
            <button
              class="sdr-mode-pill sdr-tune-btn"
              type="button"
              title="Tune"
              :disabled="controlsDisabled || playing"
              @click="tune"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
            </button>
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-stop-btn"
              type="button"
              title="Stop audio"
              :disabled="!playing"
              @click="stop"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>
            </button>
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-rec-btn"
              :class="{ 'sdr-rec-btn--active': isRecording }"
              type="button"
              title="Record"
              :disabled="!playing"
              @click="toggleRecording"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <template v-if="isRecording">
                  <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor"/>
                </template>
                <template v-else>
                  <circle cx="5" cy="5" r="4" fill="currentColor"/>
                </template>
              </svg>
            </button>
          </div>
        </div>

        <!-- Mode pills -->
        <div class="sdr-radio-section">
          <label class="sdr-field-label">MODE</label>
          <div class="sdr-mode-pills">
            <button
              v-for="m in MODES"
              :key="m"
              class="sdr-mode-pill"
              :class="{ active: currentMode === m }"
              :disabled="controlsDisabled"
              @click="setMode(m)"
            >{{ m }}</button>
          </div>
        </div>

        <!-- Signal meter -->
        <div class="sdr-radio-section">
          <span class="sdr-field-label">SIGNAL</span>
          <div class="sdr-signal-segments" :class="{ 'sdr-signal-segments--muted': !signalAudible }">
            <div
              v-for="i in SIGNAL_SEGS"
              :key="i"
              class="sdr-signal-seg"
              :class="{ 'sdr-signal-seg--on': i <= signalLit }"
            ></div>
          </div>
        </div>

        <!-- Volume -->
        <div class="sdr-radio-section">
          <div class="sdr-slider-header">
            <label class="sdr-field-label">VOLUME</label>
            <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{ volume }}%</span>
          </div>
          <input
            class="sdr-panel-slider"
            type="range" min="0" max="200" step="1"
            :value="volume"
            :disabled="controlsDisabled"
            @input="onVolumeInput"
          >
        </div>

        <!-- Squelch -->
        <div class="sdr-radio-section">
          <div class="sdr-slider-header">
            <label class="sdr-field-label">SQUELCH</label>
            <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{ squelch }} dBFS</span>
          </div>
          <input
            class="sdr-panel-slider"
            type="range" min="-120" max="0" step="1"
            :value="squelch"
            :disabled="controlsDisabled"
            @input="onSquelchInput"
          >
        </div>

        <!-- Bandwidth -->
        <div class="sdr-radio-section">
          <div class="sdr-slider-header">
            <label class="sdr-field-label">BANDWIDTH</label>
            <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{ formatBwHz(bwHz) }}</span>
          </div>
          <input
            class="sdr-panel-slider"
            type="range" min="1000" :max="bwMax" step="500"
            :value="bwHz"
            :disabled="controlsDisabled"
            @input="onBwInput"
          >
        </div>

        <!-- RF Gain -->
        <div class="sdr-radio-section">
          <div class="sdr-slider-header">
            <label class="sdr-field-label">RF GAIN</label>
            <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{ gainAuto ? 'AUTO' : `${gainDb.toFixed(1)} dB` }}</span>
          </div>
          <input
            class="sdr-panel-slider"
            type="range" min="-1" max="49" step="0.5"
            :value="gainDb"
            :disabled="controlsDisabled || gainAuto"
            @input="onGainInput"
          >
        </div>

        <!-- AGC -->
        <div class="sdr-radio-section sdr-agc-row">
          <label class="sdr-checkbox-label">
            <input
              type="checkbox"
              class="sdr-checkbox"
              :checked="gainAuto"
              :disabled="controlsDisabled"
              @change="onAgcChange"
            >
            <span class="sdr-checkbox-custom"></span>
            <span class="sdr-checkbox-text">AGC (Automatic Gain Control)</span>
          </label>
        </div>

      </div>

      <!-- ───────────── SCANNER TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'scanner' }">
        <div class="sdr-tab-header">
          <span class="sdr-tab-title">SCANNER</span>
        </div>

        <!-- Scan controls -->
      <div class="sdr-scan-controls">
        <div class="sdr-scan-state-row">
          <div class="sdr-scan-indicator" :class="{ 'sdr-scan-running': scanActive }"></div>
          <span class="sdr-scan-state-label">{{ scanActive ? 'SCANNING' : 'IDLE' }}</span>
          <span class="sdr-scan-state-freq">{{ scanActive && scanCurrentHz ? `→ ${(scanCurrentHz / 1e6).toFixed(4)} MHz` : '' }}</span>
        </div>
        <div class="sdr-scan-btns-row">
          <button
            class="sdr-scan-action-btn sdr-scan-action-btn--bg"
            :class="{ 'sdr-scan-active-btn': scanActive }"
            :disabled="controlsDisabled"
            @click="toggleScan"
          >{{ scanActive ? 'STOP SCANNING' : 'START SCANNING' }}</button>
          <button
            class="sdr-scan-action-btn sdr-scan-action-btn--bg"
            :class="{ 'sdr-btn-active': scanLocked }"
            :disabled="controlsDisabled"
            title="Hold scanner on current frequency"
            @click="toggleScanLock"
          >{{ scanLocked ? 'RESUME SCAN' : 'HOLD SCAN' }}</button>
        </div>
      </div>

      </div>

      <!-- ───────────── MEMORY TAB (saved frequencies) ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'memory' }">

      <div class="sdr-scanner-section-body sdr-scanner-section-body-expanded">

        <div class="sdr-memory-search-row">
          <input
            class="sdr-panel-input sdr-memory-search-input"
            type="text"
            placeholder="NAME · FREQ · GROUP"
            autocomplete="off"
            spellcheck="false"
            v-model="memorySearchQuery"
          />
          <button
            v-if="memorySearchQuery.length > 0"
            class="sdr-memory-search-clear"
            aria-label="Clear filter"
            @click="memorySearchQuery = ''"
          >✕</button>
        </div>

        <button
          type="button"
          class="sdr-scanner-section-label-row sdr-memory-freqs-label-row sdr-memory-accordion-toggle"
          :class="{ 'sdr-memory-accordion-toggle-expanded': freqsSectionExpanded }"
          @click="toggleFreqsSection"
        >
          <span class="sdr-scanner-section-label">FREQUENCIES</span>
          <span class="sdr-memory-accordion-chevron">
            <ChevronIcon />
          </span>
        </button>

        <div v-show="freqsSectionExpanded" id="sdr-freq-list">
          <div
            v-for="f in filteredFreqs"
            :key="f.id"
            class="sdr-freq-row-item"
            :class="{ 'sdr-freq-editing': editingFreqId === f.id }"
            :data-id="f.id"
            @click="onFreqRowClick(f)"
          >
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
                  <span
                    v-for="g in freqGroupsFor(f)"
                    :key="g.id"
                    class="sdr-freq-row-group-chip"
                  >
                    {{ g.name }}
                  </span>
                </template>
                <span v-else class="sdr-freq-row-group-chip">
                  Default
                </span>
              </div>
            </div>
            <button
              class="sdr-freq-row-del"
              aria-label="Delete frequency"
              title="Delete"
              @click.stop="deleteFreq(f.id)"
            >&#x2715;</button>
          </div>
        </div>
        <div v-show="freqsSectionExpanded" id="sdr-freq-empty" class="sdr-panel-empty" :style="{ display: freqs.length === 0 ? 'block' : 'none' }">
          No saved frequencies.<br>Tune to a frequency and use Add Frequency to save it.
        </div>
        <div v-if="freqsSectionExpanded && freqs.length > 0 && filteredFreqs.length === 0" class="sdr-panel-empty">
          No matches.
        </div>

        <div v-show="freqsSectionExpanded && !efOpen" class="sdr-memory-add-freq-row">
          <button
            id="sdr-radio-add-freq"
            class="sdr-add-freq-btn"
            @click="openAddFreqPanel"
          >Add Frequency</button>
        </div>

        <!-- Edit frequency panel -->
        <div v-if="efOpen" id="sdr-editfreq-body" class="sdr-editfreq-body expanded">
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">LABEL</label>
            <input id="sdr-ef-label" class="sdr-panel-input" type="text" placeholder="Label…" maxlength="60" style="width:100%" v-model="efLabel">
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">FREQ (MHz)</label>
            <input id="sdr-ef-freq" class="sdr-panel-input" type="text" placeholder="118.3800" autocomplete="off" style="width:100%" v-model="efFreq">
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">MODE</label>
            <div id="sdr-ef-mode-pills" class="sdr-mode-pills">
              <button
                v-for="m in MODES"
                :key="m"
                class="sdr-mode-pill"
                :class="{ active: efMode === m }"
                @click="efMode = m"
              >{{ m }}</button>
            </div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">GROUPS</label>
            <div id="sdr-ef-groups" class="sdr-fmod-groups">
              <button
                class="sdr-mode-pill sdr-ef-gpill"
                :class="{ active: efGroupIds.length === 0 }"
                type="button"
                @click="efGroupIds = []"
              >Default</button>
              <button
                v-for="g in groups"
                :key="g.id"
                class="sdr-mode-pill sdr-ef-gpill"
                :class="{ active: efGroupIds.includes(g.id) }"
                type="button"
                @click="toggleEfGroup(g.id)"
              >
                {{ g.name }}
              </button>
            </div>
          </div>
          <div class="sdr-editfreq-actions">
            <div class="sdr-editfreq-actions-right">
              <button id="sdr-ef-cancel" class="sdr-panel-btn" @click="cancelEditFreq">CANCEL</button>
              <button id="sdr-ef-save" class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveFreq">SAVE</button>
            </div>
          </div>
        </div>

        <!-- GROUPS -->
        <button
          type="button"
          class="sdr-scanner-section-label-row sdr-memory-groups-label-row sdr-memory-accordion-toggle"
          :class="{ 'sdr-memory-accordion-toggle-expanded': groupsSectionExpanded }"
          @click="groupsSectionExpanded = !groupsSectionExpanded"
        >
          <span class="sdr-scanner-section-label">GROUPS</span>
          <span class="sdr-memory-accordion-chevron">
            <ChevronIcon />
          </span>
        </button>
        <div v-show="groupsSectionExpanded" id="sdr-group-list">
          <div class="sdr-group-pills">
            <div v-for="g in groups" :key="g.id" class="sdr-group-pill">
              <span class="sdr-group-pill-name">{{ g.name }}</span>
              <button class="sdr-group-pill-edit" title="Rename group" @click.stop="startEditGroupRow(g)">&#x270E;</button>
              <button class="sdr-group-pill-del" title="Delete group" @click.stop="deleteGroup(g.id)">&#x2715;</button>
            </div>
          </div>
        </div>
        <div v-show="groupsSectionExpanded" class="sdr-panel-add-row sdr-memory-group-add-row">
          <input
            ref="newGroupNameRef"
            class="sdr-panel-input"
            type="text"
            placeholder="Group name…"
            maxlength="40"
            v-model="newGroupName"
            @keydown.enter="submitGroupRow"
            @keydown.escape="cancelEditGroupRow"
          >
          <button v-if="editingGroupId !== null" class="sdr-panel-btn" @click="cancelEditGroupRow">CANCEL</button>
          <button class="sdr-panel-btn" @click="submitGroupRow">{{ editingGroupId !== null ? 'SAVE' : 'ADD' }}</button>
        </div>
      </div>

      </div>

      <!-- ───────────── RECORDINGS TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'recordings' }">
        <div class="sdr-tab-header">
          <span class="sdr-tab-title">RECORDINGS</span>
        </div>
        <SdrClipsSection
          ref="clipsSectionRef"
          :live-recording="liveRecording"
          :rec-squelch-open="recSquelchOpen"
          :live-elapsed-s="liveElapsedS"
        />
      </div>

    </div>

  </div>

  <!-- ── GROUP RENAME MODAL ── -->
  <div id="sdr-group-modal" class="sdr-modal-overlay" :style="{ display: groupModalOpen ? 'flex' : 'none' }" @click.self="closeGroupModal">
    <div class="sdr-modal">
      <div class="sdr-modal-title">EDIT GROUP</div>
      <div class="sdr-modal-field">
        <label class="sdr-field-label">NAME</label>
        <input ref="gmodNameRef" id="sdr-gmod-name" class="sdr-panel-input sdr-modal-input" type="text" placeholder="Group name…" maxlength="40" v-model="gmodName">
      </div>
      <div class="sdr-modal-actions">
        <button id="sdr-gmod-cancel" class="sdr-panel-btn" @click="closeGroupModal">CANCEL</button>
        <button id="sdr-gmod-save" class="sdr-panel-btn sdr-fmod-save-btn" @click="saveGroupModal">SAVE</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import './SdrPanel.css'
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useSdrAudio } from '@/composables/useSdrAudio'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import SdrClipsSection from './SdrClipsSection.vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import type { SdrMode } from '@/stores/sdr'

interface SdrRadio { id: number; name: string; host: string; enabled: boolean }
interface SdrFrequencyGroup { id: number; name: string; color: string; sort_order: number }
interface SdrStoredFrequency {
  id: number; label: string; frequency_hz: number; mode: string;
  scannable: boolean; group_ids: number[]; group_id?: number | null;
  squelch?: number; gain?: number; notes?: string
}
defineProps<{ fullPage: boolean }>()

const sdrAudio = useSdrAudio()

const MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW'] as const
const SIGNAL_SEGS = 36
const ONLINE_CACHE_KEY  = 'sdrOnlineRadioIds'

// ── Active tab ────────────────────────────────────────────────────────────────
type SdrTab = 'radio' | 'scanner' | 'memory' | 'recordings'
const SDR_TAB_KEY = 'sentinel_sdr_tab'
const sdrTabs: ReadonlyArray<{ id: SdrTab; label: string }> = [
  { id: 'radio',      label: 'RADIO' },
  { id: 'scanner',    label: 'SCANNER' },
  { id: 'memory',     label: 'MEMORY' },
  { id: 'recordings', label: 'RECORDINGS' },
]
function _restoreSdrTab(): SdrTab {
  try {
    const v = sessionStorage.getItem(SDR_TAB_KEY) as SdrTab | null
    if (v && sdrTabs.some(t => t.id === v)) return v
  } catch {}
  return 'radio'
}
const activeSdrTab = ref<SdrTab>(_restoreSdrTab())
function switchSdrTab(tab: SdrTab) {
  activeSdrTab.value = tab
  try { sessionStorage.setItem(SDR_TAB_KEY, tab) } catch {}
}

const route = useRoute()
const isSdrRoute = computed(() => route.path.startsWith('/sdr'))
const sidebarOpen = ref<boolean>(_readSidebarOpen())
function _readSidebarOpen(): boolean {
  try { return sessionStorage.getItem('sentinel_sidebar_open') === '1' } catch { return false }
}
function onSdrTabClick(tab: SdrTab) {
  if (activeSdrTab.value === tab && sidebarOpen.value) {
    document.dispatchEvent(new CustomEvent('sentinel:sdr-toggle-panel'))
    return
  }
  switchSdrTab(tab)
  if (!sidebarOpen.value) {
    document.dispatchEvent(new CustomEvent('sentinel:sdr-open-panel'))
  }
}
useDocumentEvent('sentinel:sidebar-state', (e: Event) => {
  sidebarOpen.value = !!(e as CustomEvent<{ open: boolean }>).detail?.open
})

const clipsSectionRef = ref<InstanceType<typeof SdrClipsSection> | null>(null)

// ── Radio state ───────────────────────────────────────────────────────────────
const connected         = ref(false)
const playing           = ref(false)
const controlsDisabled  = ref(true)
const selectedRadioId   = ref<number | null>(null)
const knownRadios       = ref<SdrRadio[]>([])
const currentMode       = ref('AM')
const freqInputVal      = ref('')
const currentFreqHz     = ref(0)
const gainDb            = ref(30)
const gainAuto          = ref(false)
const volume            = ref(80)
const squelch           = ref(-120)
const bwHz              = ref(10000)
const bwMax             = ref(2048000)
const activeFreqDisplay = ref('')
const signalSmoothed    = ref(-120)
const signalLit         = ref(0)
const worklestSquelchOpen = ref(true)

const signalAudible = computed(() =>
  playing.value && (squelch.value <= -119 || worklestSquelchOpen.value)
)

// ── Device dropdown ───────────────────────────────────────────────────────────
const deviceDropdownRef  = ref<HTMLElement | null>(null)
const deviceMenuRef      = ref<HTMLElement | null>(null)
const deviceMenuOpen     = ref(false)
const radiosLoading      = ref(true)
const menuRadios         = ref<SdrRadio[]>([])
const menuCheckingRadios = ref(false)
const deviceMenuStyle    = ref<Record<string, string>>({})
const deviceDropdownLabel = ref('loading…')

// ── Scanner ───────────────────────────────────────────────────────────────────
const scanActive    = ref(false)
const scanLocked    = ref(false)
const scanCurrentHz = ref<number | null>(null)
let _scanQueue: SdrStoredFrequency[] = []
let _scanIdx   = 0
let _scanTimer: ReturnType<typeof setTimeout> | null = null

// ── Groups + frequencies ──────────────────────────────────────────────────────
const groups       = ref<SdrFrequencyGroup[]>([])
const freqs        = ref<SdrStoredFrequency[]>([])
const memorySearchQuery = ref('')
const freqsSectionExpanded = ref(true)
const groupsSectionExpanded = ref(true)
const newGroupName = ref('')

const filteredFreqs = computed<SdrStoredFrequency[]>(() => {
  const q = memorySearchQuery.value.trim().toLowerCase()
  if (!q) return freqs.value
  return freqs.value.filter(f => {
    const label = (f.label || '').toLowerCase()
    const freqMhz = (f.frequency_hz / 1e6).toFixed(4)
    const freqHz = String(f.frequency_hz)
    const fGroups = freqGroupsFor(f)
    const groupNames = fGroups.length
      ? fGroups.map(g => g.name.toLowerCase())
      : ['default']
    return (
      label.includes(q) ||
      freqMhz.includes(q) ||
      freqHz.includes(q) ||
      groupNames.some(n => n.includes(q))
    )
  })
})
const newGroupNameRef = ref<HTMLInputElement | null>(null)

function freqGroupsFor(f: SdrStoredFrequency): SdrFrequencyGroup[] {
  const ids = new Set<number>((f.group_ids || []).filter(id => id !== 0))
  if (f.group_id != null && f.group_id !== 0) ids.add(f.group_id)
  return groups.value.filter(g => ids.has(g.id))
}

const groupedFreqs = computed(() => {
  const result: Array<{ id: number | string; name: string; color: string; items: SdrStoredFrequency[] }> = []
  const grouped: Record<number | string, SdrStoredFrequency[]> = { default: [] }
  groups.value.forEach(g => { grouped[g.id] = [] })
  freqs.value.forEach(f => {
    const realIds = (f.group_ids || []).filter(id => id !== 0 && groups.value.some(g => g.id === id))
    if (realIds.length === 0) grouped['default'].push(f)
    else realIds.forEach(id => { if (!grouped[id]) grouped[id] = []; grouped[id].push(f) })
  })
  groups.value.forEach(g => {
    if (grouped[g.id]?.length) result.push({ id: g.id, name: g.name, color: g.color, items: grouped[g.id] })
  })
  if (grouped['default'].length) result.push({ id: 'default', name: 'Default', color: 'rgba(255,255,255,0.2)', items: grouped['default'] })
  return result
})

// ── Edit frequency panel ──────────────────────────────────────────────────────
const efOpen        = ref(false)
const editingFreqId = ref<number | null>(null)
const efLabel       = ref('')
const efFreq        = ref('')
const efMode        = ref('AM')
const efGroupIds    = ref<number[]>([])

// ── Recording state (live recording props passed to SdrClipsSection) ──────────

const isRecording    = ref(false)
const recSquelchOpen = ref(true)
const liveElapsedS   = ref(0)
interface LiveRec { frequency_hz: number; mode: string; startedAt: string }
const liveRecording = ref<LiveRec | null>(null)
let _recStartEpoch  = 0
let _recPausedMs    = 0
let _recPauseStart: number | null = null
let _recTimerInterval: ReturnType<typeof setInterval> | null = null

const groupModalOpen = ref(false)
const gmodName       = ref('')
const gmodNameRef    = ref<HTMLInputElement | null>(null)
const editingGroupId = ref<number | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

import { formatBwHz, parseFreqMhz, defaultBwHz, snapToValidSampleRate } from './sdrPanelUtils'

function saveSettings() {
  try {
    sessionStorage.setItem('sdrSettings', JSON.stringify({
      gainDb: gainDb.value, gainAuto: gainAuto.value, squelch: squelch.value,
      bwHz: bwHz.value, vol: volume.value, mode: currentMode.value, freqHz: currentFreqHz.value,
    }))
  } catch (_) {}
}

function restoreSettings() {
  try {
    const raw = sessionStorage.getItem('sdrSettings')
    if (!raw) return
    const s = JSON.parse(raw)
    if (s.freqHz > 0) {
      currentFreqHz.value = s.freqHz
      freqInputVal.value = (s.freqHz / 1e6).toFixed(4)
      activeFreqDisplay.value = (s.freqHz / 1e6).toFixed(3) + ' MHz'
    }
    if (s.mode) currentMode.value = s.mode
    if (typeof s.gainDb === 'number') { gainDb.value = s.gainDb; gainAuto.value = !!s.gainAuto }
    if (typeof s.squelch === 'number') squelch.value = s.squelch
    if (typeof s.bwHz === 'number' && s.bwHz > 0) bwHz.value = s.bwHz
    if (typeof s.vol === 'number') { volume.value = s.vol; sdrAudio.setVolume(s.vol / 100) }
  } catch (_) {}
}

// ── Control WebSocket ─────────────────────────────────────────────────────────

let _ctrlSocket:       WebSocket | null = null
let _ctrlRadioId:      number | null    = null
let _ctrlReconnect:    ReturnType<typeof setTimeout> | null = null
let _ctrlDataConfirmed = false

function _markInitialised(id: number) { sessionStorage.setItem(`sdrInit_${id}`, '1') }
function _isInitialised(id: number)   { return sessionStorage.getItem(`sdrInit_${id}`) === '1' }

function sendCmd(obj: object) {
  if (_ctrlSocket && _ctrlSocket.readyState === WebSocket.OPEN) {
    _ctrlSocket.send(JSON.stringify(obj))
  }
}

async function openControlSocket(radioId: number) {
  if (_ctrlReconnect) { clearTimeout(_ctrlReconnect); _ctrlReconnect = null }
  if (_ctrlRadioId === radioId && _ctrlSocket &&
      (_ctrlSocket.readyState === WebSocket.CONNECTING || _ctrlSocket.readyState === WebSocket.OPEN)) return
  if (_ctrlSocket) { _ctrlSocket.close(); _ctrlSocket = null }
  _ctrlRadioId = radioId
  _ctrlDataConfirmed = false
  sessionStorage.setItem('sdrLastRadioId', String(radioId))

  try {
    await fetch('/api/sdr/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radio_id: radioId }),
    })
  } catch (_) {}

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws    = new WebSocket(`${proto}://${location.host}/ws/sdr/${radioId}`)
  _ctrlSocket = ws

  ws.addEventListener('open', () => {
    const lastMode = sessionStorage.getItem('sdrLastMode') || 'AM'
    if (!_isInitialised(radioId)) _markInitialised(radioId)
    if (sessionStorage.getItem('sdrPlaying') === '1') {
      playing.value = true
      sdrAudio.setMode(lastMode as SdrMode)
      sdrAudio.initAudio(radioId)
    }
  })

  ws.addEventListener('message', (ev: MessageEvent) => {
    let msg: any
    try { msg = JSON.parse(ev.data) } catch { return }
    switch (msg.type) {
      case 'status':
        applyStatus(msg)
        sdrAudio.setMode(msg.mode as SdrMode)
        if (!sessionStorage.getItem('sdrLastFreqHz') || !currentFreqHz.value) {
          sessionStorage.setItem('sdrLastFreqHz', String(msg.center_hz))
        }
        sessionStorage.setItem('sdrLastMode', msg.mode)
        break
      case 'spectrum':
        if (!_ctrlDataConfirmed) {
          _ctrlDataConfirmed = true
          setStatus(true)
        }
        break
      case 'error':
        _ctrlDataConfirmed = false
        setStatus(false)
        break
      case 'pong':
        break
    }
  })

  ws.addEventListener('close', () => {
    setStatus(false)
    if (_ctrlReconnect) clearTimeout(_ctrlReconnect)
    _ctrlReconnect = setTimeout(() => {
      if (_ctrlRadioId === radioId) void openControlSocket(radioId)
    }, 500)
  })

  ws.addEventListener('error', () => { setStatus(false) })
}

function closeControlSocket() {
  if (_ctrlReconnect) { clearTimeout(_ctrlReconnect); _ctrlReconnect = null }
  if (_ctrlSocket)    { _ctrlSocket.close(); _ctrlSocket = null }
  if (_ctrlRadioId != null) sessionStorage.removeItem(`sdrInit_${_ctrlRadioId}`)
  _ctrlRadioId = null
  _ctrlDataConfirmed = false
}

// ── Playing state ─────────────────────────────────────────────────────────────

function setPlayingState(on: boolean) {
  playing.value = on
  sessionStorage.setItem('sdrPlaying', on ? '1' : '0')
  if (!on) stopRecordingIfActive()
}

// ── Tune ──────────────────────────────────────────────────────────────────────

let _retuneDebounce: ReturnType<typeof setTimeout> | null = null

function tune() {
  if (!selectedRadioId.value) return
  formatFreqInput()
  const hz = parseFreqMhz(freqInputVal.value)
  if (!hz) return
  currentFreqHz.value = hz
  activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
  sdrAudio.initAudio(selectedRadioId.value)
  sdrAudio.setMode(currentMode.value as SdrMode)
  const bw = defaultBwHz(currentMode.value)
  sdrAudio.setBandwidthHz(bw)
  bwHz.value = bw
  setPlayingState(true)
  sessionStorage.setItem('sdrLastFreqHz', String(hz))
  sessionStorage.setItem('sdrLastMode', currentMode.value)
  saveSettings()
  sendCmd({ cmd: 'tune', frequency_hz: hz })
}

function stop() {
  sdrAudio.stop()
  setPlayingState(false)
}

function formatFreqInput() {
  const raw = freqInputVal.value.trim()
  if (!raw) return
  const n = parseFloat(raw)
  if (!isFinite(n)) return
  freqInputVal.value = n.toFixed(4)
}

function onFreqInputChange() {
  if (!playing.value) return
  const hz = parseFreqMhz(freqInputVal.value)
  if (!hz) return
  if (_retuneDebounce) clearTimeout(_retuneDebounce)
  _retuneDebounce = setTimeout(() => {
    currentFreqHz.value = hz
    activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
    sessionStorage.setItem('sdrLastFreqHz', String(hz))
    sendCmd({ cmd: 'tune', frequency_hz: hz })
  }, 600)
}

// ── Gain ──────────────────────────────────────────────────────────────────────

let _gainDebounce: ReturnType<typeof setTimeout> | null = null

function onGainInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  gainDb.value = v
  gainAuto.value = v < 0
  saveSettings()
  if (_gainDebounce) clearTimeout(_gainDebounce)
  _gainDebounce = setTimeout(() => sendCmd({ cmd: 'gain', gain_db: gainAuto.value ? null : v }), 150)
}

function onAgcChange(e: Event) {
  gainAuto.value = (e.target as HTMLInputElement).checked
  saveSettings()
  if (_gainDebounce) clearTimeout(_gainDebounce)
  _gainDebounce = setTimeout(() => sendCmd({ cmd: 'gain', gain_db: gainAuto.value ? null : gainDb.value }), 150)
}

// ── Volume / squelch / bandwidth ──────────────────────────────────────────────

function onVolumeInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  volume.value = v
  saveSettings()
  sdrAudio.setVolume(v / 100)
}

let _sqDebounce: ReturnType<typeof setTimeout> | null = null
function onSquelchInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  squelch.value = v
  saveSettings()
  if (_sqDebounce) clearTimeout(_sqDebounce)
  _sqDebounce = setTimeout(() => {
    sendCmd({ cmd: 'squelch', squelch_dbfs: v })
    sdrAudio.setSquelch(v)
  }, 150)
}

let _bwDebounce: ReturnType<typeof setTimeout> | null = null
function onBwInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  bwHz.value = v
  saveSettings()
  sdrAudio.setBandwidthHz(v)
  if (_bwDebounce) clearTimeout(_bwDebounce)
  _bwDebounce = setTimeout(() => sendCmd({ cmd: 'sample_rate', rate_hz: snapToValidSampleRate(v) }), 150)
}

// ── Mode ──────────────────────────────────────────────────────────────────────

function setMode(m: string) {
  currentMode.value = m
  saveSettings()
  sendCmd({ cmd: 'mode', mode: m })
  sdrAudio.setMode(m as SdrMode)
  const bw = defaultBwHz(m)
  sdrAudio.setBandwidthHz(bw)
  bwHz.value = bw
}

// ── Signal meter ──────────────────────────────────────────────────────────────

function updateSignalBar(dbfs: number, squelchOpen?: boolean) {
  if (squelchOpen !== undefined) worklestSquelchOpen.value = squelchOpen
  if (squelchOpen === false) {
    signalSmoothed.value = -120
    signalLit.value = 0
    return
  }
  const alpha = dbfs > signalSmoothed.value ? 0.3 : 0.05
  signalSmoothed.value += alpha * (dbfs - signalSmoothed.value)
  signalLit.value = Math.round(Math.max(0, Math.min(SIGNAL_SEGS, ((signalSmoothed.value + 120) / 120) * SIGNAL_SEGS)))
}

// ── Status ────────────────────────────────────────────────────────────────────

function setStatus(isConnected: boolean) {
  connected.value = isConnected
  if (isConnected) {
    if (!playing.value && sessionStorage.getItem('sdrPlaying') === '1') playing.value = true
  } else {
    playing.value = false
    stopRecordingIfActive()
    controlsDisabled.value = true
    activeFreqDisplay.value = ''
    signalSmoothed.value = -120
    signalLit.value = 0
  }
}

function applyStatus(msg: {
  connected: boolean; center_hz: number; mode: string;
  gain_db: number; gain_auto: boolean; sample_rate: number
}) {
  if (!msg.connected) return
  const hadUserFreq = currentFreqHz.value && currentFreqHz.value !== msg.center_hz
  if (!hadUserFreq) {
    currentFreqHz.value = msg.center_hz
    freqInputVal.value = (msg.center_hz / 1e6).toFixed(4)
    activeFreqDisplay.value = (msg.center_hz / 1e6).toFixed(3) + ' MHz'
  }
  currentMode.value = msg.mode
  gainDb.value = msg.gain_db
  gainAuto.value = msg.gain_auto
  bwMax.value = msg.sample_rate
  const clampedBw = Math.min(bwHz.value, msg.sample_rate)
  bwHz.value = clampedBw
  sdrAudio.setBandwidthHz(clampedBw)
  saveSettings()
}

// ── Radio selection ───────────────────────────────────────────────────────────

function clearRadioSelection() {
  selectedRadioId.value = null
  deviceDropdownLabel.value = '— select radio —'
  setPlayingState(false)
  controlsDisabled.value = true
  closeControlSocket()
  sdrAudio.stop()
}

function selectRadio(r: SdrRadio | null) {
  closeDeviceMenu()
  if (!r) { clearRadioSelection(); return }
  if (playing.value) { sdrAudio.stop(); setPlayingState(false); setStatus(false) }
  selectedRadioId.value = r.id
  deviceDropdownLabel.value = r.name
  sessionStorage.setItem('sdrLastRadioId', String(r.id))
  controlsDisabled.value = false
  void openControlSocket(r.id)
}

// ── Device dropdown ───────────────────────────────────────────────────────────

function positionDeviceMenu() {
  const el = deviceDropdownRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  deviceMenuStyle.value = { left: rect.left + 'px', top: rect.bottom + 'px', width: rect.width + 'px' }
}

function toggleDeviceMenu() {
  if (deviceMenuOpen.value) { closeDeviceMenu(); return }
  positionDeviceMenu()
  deviceMenuOpen.value = true
  probeMenuRadios()
}

function closeDeviceMenu() { deviceMenuOpen.value = false }

async function probeMenuRadios() {
  const enabled = knownRadios.value.filter(r => r.enabled)
  let cachedIds: number[] | null = null
  try { const raw = sessionStorage.getItem(ONLINE_CACHE_KEY); if (raw) cachedIds = JSON.parse(raw) } catch (_) {}
  if (cachedIds !== null) {
    menuRadios.value = enabled.filter(r => (cachedIds as number[]).includes(r.id))
    return
  }
  menuCheckingRadios.value = true
  const results = await Promise.allSettled(
    enabled.map(r =>
      fetch('/api/sdr/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ radio_id: r.id }) })
        .then(res => res.ok ? r : null).catch(() => null)
    )
  )
  const online = results.map(r => r.status === 'fulfilled' ? r.value : null).filter((r): r is SdrRadio => r !== null)
  try { sessionStorage.setItem(ONLINE_CACHE_KEY, JSON.stringify(online.map(r => r.id))) } catch (_) {}
  menuCheckingRadios.value = false
  if (!deviceMenuOpen.value) return
  menuRadios.value = online
}

function onDeviceDropdownKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleDeviceMenu() }
  if (e.key === 'Escape') closeDeviceMenu()
}

function onDocumentClick() { if (deviceMenuOpen.value) closeDeviceMenu() }

// ── Populate radios (called externally via event / boot) ──────────────────────

const RADIOS_CACHE_KEY2 = 'sdrRadiosCache'

function populateRadios(radios: SdrRadio[]) {
  knownRadios.value = radios
  radiosLoading.value = false
  try { sessionStorage.setItem(RADIOS_CACHE_KEY2, JSON.stringify(radios)) } catch (_) {}
  const savedId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '', 10)
  if (savedId) {
    const r = radios.find(r => r.id === savedId && r.enabled)
    if (r) {
      selectedRadioId.value = r.id
      deviceDropdownLabel.value = r.name
      controlsDisabled.value = false
      void openControlSocket(r.id)
    } else {
      deviceDropdownLabel.value = '— select radio —'
    }
  } else {
    deviceDropdownLabel.value = '— select radio —'
  }
  const radioTabBtn = document.querySelector<HTMLElement>('.msb-tab[data-tab="radio"]')
  if (radioTabBtn) radioTabBtn.classList.remove('msb-tab--pending')
}

async function loadRadios() {
  try {
    const cached = sessionStorage.getItem(RADIOS_CACHE_KEY2)
    if (cached) populateRadios(JSON.parse(cached))
  } catch (_) {}
  try {
    const res = await fetch('/api/sdr/radios')
    const radios: SdrRadio[] = await res.json()
    populateRadios(radios)
  } catch (_) {}
}

// ── Scanner ───────────────────────────────────────────────────────────────────

function toggleScan() { if (scanActive.value) stopScan(); else startScan() }

function startScan() {
  if (scanLocked.value) return
  _scanQueue = freqs.value.filter(f => f.scannable)
  if (_scanQueue.length === 0) return
  scanActive.value = true
  _scanIdx = 0
  doScanStep()
}

function stopScan() {
  scanActive.value = false
  scanCurrentHz.value = null
  if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null }
}

function doScanStep() {
  if (!scanActive.value || scanLocked.value || _scanQueue.length === 0) return
  const f = _scanQueue[_scanIdx % _scanQueue.length]
  tuneToFreq(f)
  scanCurrentHz.value = f.frequency_hz
  _scanIdx++
  _scanTimer = setTimeout(doScanStep, 2000)
}

function toggleScanLock() { scanLocked.value = !scanLocked.value }

function tuneToFreq(f: SdrStoredFrequency) {
  currentFreqHz.value = f.frequency_hz
  currentMode.value   = f.mode
  freqInputVal.value  = (f.frequency_hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (f.frequency_hz / 1e6).toFixed(3) + ' MHz'
  sendCmd({ cmd: 'tune', frequency_hz: f.frequency_hz })
  sendCmd({ cmd: 'mode', mode: f.mode })
}

// ── Data reload ───────────────────────────────────────────────────────────────

async function reloadData() {
  try {
    const [gRes, fRes] = await Promise.all([fetch('/api/sdr/groups'), fetch('/api/sdr/frequencies')])
    groups.value = await gRes.json()
    freqs.value  = await fRes.json()
    _scanQueue = freqs.value.filter(f => f.scannable)
  } catch (_) {}
  await clipsSectionRef.value?.reload()
}

// ── Groups CRUD ───────────────────────────────────────────────────────────────

async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    const res = await fetch('/api/sdr/groups', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: '#c8ff00', sort_order: groups.value.length }),
    })
    if (res.ok) { newGroupName.value = ''; await reloadData() }
  } catch (_) {}
}

function startEditGroupRow(g: SdrFrequencyGroup) {
  editingGroupId.value = g.id
  newGroupName.value = g.name
  nextTick(() => newGroupNameRef.value?.focus())
}

function cancelEditGroupRow() {
  editingGroupId.value = null
  newGroupName.value = ''
}

async function submitGroupRow() {
  if (editingGroupId.value !== null) {
    const name = newGroupName.value.trim()
    if (!name) return
    try {
      const existing = groups.value.find(g => g.id === editingGroupId.value)
      await fetch(`/api/sdr/groups/${editingGroupId.value}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          color: existing?.color ?? '#c8ff00',
          sort_order: existing?.sort_order ?? 0,
        }),
      })
      editingGroupId.value = null
      newGroupName.value = ''
      await reloadData()
    } catch (_) {}
  } else {
    await addGroup()
  }
}

async function deleteGroup(id: number) {
  try { await fetch(`/api/sdr/groups/${id}`, { method: 'DELETE' }); await reloadData() } catch (_) {}
}

function openEditGroupModal(g: SdrFrequencyGroup) {
  editingGroupId.value = g.id
  gmodName.value = g.name
  groupModalOpen.value = true
  nextTick(() => gmodNameRef.value?.focus())
}

function closeGroupModal() { groupModalOpen.value = false; editingGroupId.value = null }

async function saveGroupModal() {
  const name = gmodName.value.trim()
  if (!name || editingGroupId.value === null) return
  try {
    const existing = groups.value.find(g => g.id === editingGroupId.value)
    await fetch(`/api/sdr/groups/${editingGroupId.value}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        color: existing?.color ?? '#c8ff00',
        sort_order: existing?.sort_order ?? 0,
      }),
    })
    closeGroupModal()
    await reloadData()
  } catch (_) {}
}

// ── Frequency CRUD ────────────────────────────────────────────────────────────

function openAddFreqPanel() {
  editingFreqId.value = null
  efLabel.value = ''
  efFreq.value = currentFreqHz.value ? (currentFreqHz.value / 1e6).toFixed(4) : ''
  efMode.value = currentMode.value || 'AM'
  efGroupIds.value = []
  efOpen.value = true
  switchSdrTab('memory')
}

function onFreqRowClick(f: SdrStoredFrequency) {
  tuneToFreq(f)
  openEditFreqPanel(f)
}

function openEditFreqPanel(f: SdrStoredFrequency) {
  editingFreqId.value = f.id
  efLabel.value = f.label
  efFreq.value  = (f.frequency_hz / 1e6).toFixed(4)
  efMode.value  = f.mode
  efGroupIds.value = (f.group_ids || []).filter(id => id !== 0)
  efOpen.value = true
  switchSdrTab('memory')
}

function cancelEditFreq() { editingFreqId.value = null; efOpen.value = false }

function toggleFreqsSection() {
  freqsSectionExpanded.value = !freqsSectionExpanded.value
  if (!freqsSectionExpanded.value && efOpen.value) {
    efOpen.value = false
    editingFreqId.value = null
  }
}

function toggleEfGroup(id: number) {
  const idx = efGroupIds.value.indexOf(id)
  if (idx === -1) efGroupIds.value = [...efGroupIds.value, id]
  else efGroupIds.value = efGroupIds.value.filter(i => i !== id)
}

async function saveFreq() {
  const label = efLabel.value.trim()
  const hz    = parseFreqMhz(efFreq.value)
  if (!label || !hz) return
  try {
    if (editingFreqId.value !== null) {
      const existing = freqs.value.find(x => x.id === editingFreqId.value)
      await fetch(`/api/sdr/frequencies/${editingFreqId.value}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label, frequency_hz: hz, mode: efMode.value,
          group_ids: efGroupIds.value,
          squelch: existing?.squelch ?? squelch.value,
          gain: existing?.gain ?? gainDb.value,
          scannable: existing?.scannable ?? true,
          notes: existing?.notes ?? '',
        }),
      })
    } else {
      await fetch('/api/sdr/frequencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, frequency_hz: hz, mode: efMode.value, squelch: squelch.value, gain: gainDb.value, scannable: true, group_ids: efGroupIds.value }),
      })
    }
    editingFreqId.value = null
    efOpen.value = false
    await reloadData()
  } catch (_) {}
}

async function deleteFreq(id?: number) {
  const targetId = id ?? editingFreqId.value
  if (targetId === null || targetId === undefined) return
  try {
    await fetch(`/api/sdr/frequencies/${targetId}`, { method: 'DELETE' })
    if (editingFreqId.value === targetId) {
      editingFreqId.value = null
      efOpen.value = false
    }
    await reloadData()
  } catch (_) {}
}

// ── Recording ─────────────────────────────────────────────────────────────────

async function toggleRecording() {
  if (isRecording.value) { await stopRecordingIfActive(); return }
  const radioName = selectedRadioId.value ? knownRadios.value.find(r => r.id === selectedRadioId.value)?.name ?? '' : ''
  const metadata = {
    radio_id:     selectedRadioId.value,
    radio_name:   radioName,
    frequency_hz: currentFreqHz.value || 0,
    mode:         currentMode.value   || 'AM',
    gain_db:      gainDb.value        || 30,
    squelch_dbfs: squelch.value       || -60,
    sample_rate:  2048000,
  }
  const recId = await sdrAudio.startRecording(metadata)
  if (!recId) return
  isRecording.value = true
  _recStartEpoch = Date.now()
  _recPausedMs   = 0
  const sqActive = (metadata.squelch_dbfs ?? -120) > -119
  recSquelchOpen.value = !sqActive
  _recPauseStart = sqActive ? Date.now() : null
  const now = new Date(_recStartEpoch)
  liveRecording.value = {
    frequency_hz: metadata.frequency_hz,
    mode:         metadata.mode,
    startedAt:    now.toISOString().replace('T', ' ').slice(0, 16),
  }
  liveElapsedS.value = 0
  if (clipsSectionRef.value) clipsSectionRef.value.recordingsExpanded = true
  _recTimerInterval = setInterval(() => {
    const pausedSoFar = _recPauseStart != null ? _recPausedMs + (Date.now() - _recPauseStart) : _recPausedMs
    liveElapsedS.value = Math.floor((Date.now() - _recStartEpoch - pausedSoFar) / 1000)
  }, 1000)
}

async function stopRecordingIfActive() {
  if (!isRecording.value) return
  isRecording.value = false
  if (_recTimerInterval) { clearInterval(_recTimerInterval); _recTimerInterval = null }
  const radioName = selectedRadioId.value ? knownRadios.value.find(r => r.id === selectedRadioId.value)?.name ?? '' : ''
  await sdrAudio.stopRecording({
    frequency_hz: currentFreqHz.value || 0,
    mode: currentMode.value || 'AM',
  })
  liveRecording.value = null
  await clipsSectionRef.value?.reload()
  setTimeout(() => clipsSectionRef.value?.reload(), 2000)
  clipsSectionRef.value && (clipsSectionRef.value.recordingsExpanded = true)
}

function onSquelchChangeCallback(open: boolean) {
  if (!isRecording.value) return
  if (open && !recSquelchOpen.value) {
    if (_recPauseStart != null) { _recPausedMs += Date.now() - _recPauseStart; _recPauseStart = null }
    recSquelchOpen.value = true
  } else if (!open && recSquelchOpen.value) {
    _recPauseStart = Date.now()
    recSquelchOpen.value = false
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onRadiosChanged() {
  try { sessionStorage.removeItem(ONLINE_CACHE_KEY) } catch (_) {}
  loadRadios()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(() => {
  restoreSettings()


  sdrAudio.onSquelchChange(onSquelchChangeCallback)
  sdrAudio.onPower(updateSignalBar)

  loadRadios()
  reloadData()
})

onUnmounted(() => {
  stopScan()
  if (_recTimerInterval) clearInterval(_recTimerInterval)
  // Keep socket open — SdrTabPanel persists across navigation, audio must survive
  // Only close if unmounting the full-page SdrView (not the RADIO tab)
})

useDocumentEvent('click', onDocumentClick)
useDocumentEvent('sdr:radios-changed', onRadiosChanged)
</script>

