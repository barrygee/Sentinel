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
        <!-- frequency manager (bookmark) -->
        <svg v-else-if="tab.id === 'frequency-manager'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M6 3h12v18l-6-4-6 4V3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" fill="none"/>
        </svg>
        <!-- search ranges (range brackets with sweep) -->
        <svg v-else-if="tab.id === 'search-ranges'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linecap="round">
          <path d="M5 7v10M5 7h3M5 17h3" stroke="currentColor" stroke-width="1.8"/>
          <path d="M19 7v10M19 7h-3M19 17h-3" stroke="currentColor" stroke-width="1.8"/>
          <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.8"/>
        </svg>
        <!-- groups (stacked tags) -->
        <svg v-else-if="tab.id === 'groups'" width="19" height="19" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" stroke-linejoin="miter">
          <path d="M4 7h10l4 4-4 4H4V7Z" stroke="currentColor" stroke-width="1.8" fill="none"/>
          <circle cx="7" cy="11" r="1.1" fill="currentColor"/>
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
        <div class="sdr-radio-section sdr-radio-section--device">
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
              placeholder=""
              autocomplete="off"
              spellcheck="false"
              :disabled="controlsDisabled"
              :readonly="scanActive"
              v-model="freqInputVal"
              @keydown.enter="tune"
              @focus="onFreqInputFocus"
              @click="onFreqInputFocus"
              @blur="onFreqInputBlur"
              @wheel.prevent="onFreqWheel"
            >
            <span class="sdr-freq-unit">MHz</span>
          </div>
          <div v-if="currentFreqLabel" class="sdr-freq-name">{{ currentFreqLabel }}</div>
          <div class="sdr-freq-actions-row">
            <button
              class="sdr-mode-pill sdr-tune-btn"
              type="button"
              title="Tune"
              :disabled="controlsDisabled || playing || scanActive || searchActive"
              @click="tune"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
            </button>
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-stop-btn"
              type="button"
              title="Stop audio"
              :disabled="!playing && !scanActive && !searchActive"
              @click="stop"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor"/></svg>
            </button>
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-rec-btn"
              :class="{ 'sdr-rec-btn--active': isRecording }"
              type="button"
              title="Record"
              :disabled="!playing && !scanActive && !searchActive"
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

        <!-- Settings accordion -->
        <div class="sdr-radio-section sdr-settings-controls">
          <button
            type="button"
            class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
            :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': settingsSectionExpanded }"
            @click="settingsSectionExpanded = !settingsSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">SETTINGS</label>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="settingsSectionExpanded">

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

            <!-- Sample Rate (hardware) — sets the spectrum/waterfall span -->
            <div class="sdr-radio-section">
              <div class="sdr-slider-header">
                <label class="sdr-field-label">SAMPLE RATE</label>
                <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }">{{ formatBwHz(sampleRateHz) }}</span>
              </div>
              <!-- Custom dropdown (NOT native <select>): native option lists
                   can't be styled (UA popup), and we want the menu to match
                   the device dropdown above. Built off the same primitives. -->
              <div
                ref="sampleRateDropdownRef"
                class="sdr-device-dropdown"
                :class="{ 'sdr-device-dropdown--open': sampleRateMenuOpen, 'sdr-device-dropdown--loading': controlsDisabled }"
                tabindex="0"
                @click.stop="toggleSampleRateMenu"
                @keydown="onSampleRateDropdownKey"
              >
                <div class="sdr-device-dropdown-selected">
                  <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{ formatBwHz(sampleRateHz) }}</span>
                  <span class="sdr-device-dropdown-arrow"></span>
                </div>
              </div>
              <Teleport to="body">
                <div
                  v-if="sampleRateMenuOpen"
                  ref="sampleRateMenuRef"
                  class="sdr-device-menu sdr-device-menu--open"
                  :style="sampleRateMenuStyle"
                  @click.stop
                >
                  <div
                    v-for="r in SAMPLE_RATE_OPTIONS"
                    :key="r"
                    class="sdr-device-menu-item"
                    :class="{ 'sdr-device-menu-item--selected': r === sampleRateHz }"
                    @click="pickSampleRate(r)"
                  >
                    {{ formatBwHz(r) }}
                  </div>
                </div>
              </Teleport>
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
        </div>

        <!-- Scan controls -->
        <div class="sdr-radio-section sdr-scan-controls">
          <button
            type="button"
            class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
            :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': scannerSectionExpanded }"
            @click="scannerSectionExpanded = !scannerSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">SCANNER</label>
            <div class="sdr-scan-state-row" v-show="scanActive">
              <span class="sdr-scan-state-label">{{ scanLocked ? 'SCANNING PAUSED' : 'SCANNING' }}</span>
              <div class="sdr-scan-indicator" :class="{ 'sdr-scan-running': scanActive && !scanLocked, 'sdr-scan-holding': scanLocked }"></div>
            </div>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="scannerSectionExpanded">
          <div class="sdr-scan-subsection-label">GROUPS</div>
          <div class="sdr-scan-groups-row">
            <button
              type="button"
              class="sdr-scan-group-chip"
              :class="{ 'sdr-scan-group-chip-active': scanAllSelected }"
              :disabled="controlsDisabled"
              @click="toggleScanAll"
            >All</button>
            <button
              v-for="g in groupsWithFreqs"
              :key="g.id"
              type="button"
              class="sdr-scan-group-chip"
              :class="{ 'sdr-scan-group-chip-active': !scanAllSelected && scanSelectedGroupIds.includes(g.id) }"
              :disabled="controlsDisabled"
              @click="toggleScanGroup(g.id)"
            >{{ g.name }}</button>
          </div>
          <div class="sdr-scan-btns-row sdr-scan-btns-row--left">
            <button
              type="button"
              class="sdr-search-adhoc-play"
              :class="{ 'sdr-search-adhoc-play--active': scanActive }"
              :disabled="controlsDisabled"
              :aria-label="scanActive ? 'Stop scan' : 'Start scan'"
              :title="scanActive ? 'Stop scan' : 'Start scan'"
              @click="onScanPrimaryClick"
            >
              <span class="sdr-search-adhoc-play-label">{{ scanActive ? 'Stop' : 'Scan' }}</span>
              <svg v-if="scanActive" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
              <svg v-else width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
            </button>
          </div>
          </div>
        </div>

        <!-- Search controls (low/high range sweep) -->
        <div class="sdr-radio-section sdr-scan-controls">
          <button
            type="button"
            class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
            :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': searchSectionExpanded }"
            @click="searchSectionExpanded = !searchSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">SEARCH</label>
            <div class="sdr-scan-state-row" v-show="searchActive">
              <span class="sdr-scan-state-label">{{ searchLocked ? 'SEARCHING PAUSED' : 'SEARCHING' }}</span>
              <div class="sdr-scan-indicator" :class="{ 'sdr-scan-running': searchActive && !searchLocked, 'sdr-scan-holding': searchLocked }"></div>
            </div>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="searchSectionExpanded">
            <div class="sdr-search-adhoc-row">
              <div class="sdr-search-adhoc-col">
                <label class="sdr-field-label">LOW (MHz)</label>
                <input
                  class="sdr-panel-input sdr-search-adhoc-input"
                  type="number"
                  step="0.0001"
                  required
                  :disabled="controlsDisabled || searchActive"
                  v-model="adhocLowMhz"
                >
              </div>
              <div class="sdr-search-adhoc-col">
                <label class="sdr-field-label">HIGH (MHz)</label>
                <input
                  class="sdr-panel-input sdr-search-adhoc-input"
                  type="number"
                  step="0.0001"
                  required
                  :disabled="controlsDisabled || searchActive"
                  v-model="adhocHighMhz"
                >
              </div>
              <div class="sdr-search-adhoc-col">
                <label class="sdr-field-label">STEP</label>
                <div
                  :ref="setAdhocStepDropdownRef"
                  class="sdr-device-dropdown sdr-step-dropdown"
                  :class="{ 'sdr-device-dropdown--open': stepMenuOpen && stepMenuTarget === 'adhoc', 'sdr-device-dropdown--loading': controlsDisabled || searchActive }"
                  tabindex="0"
                  @click.stop="(controlsDisabled || searchActive) ? null : toggleStepMenu('adhoc')"
                  @keydown="onStepDropdownKey($event, 'adhoc')"
                >
                  <div class="sdr-device-dropdown-selected">
                    <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{ adhocStepLabel }}</span>
                    <span class="sdr-device-dropdown-arrow"></span>
                  </div>
                </div>
              </div>
              <div class="sdr-search-adhoc-col sdr-search-adhoc-col--play">
                <button
                  type="button"
                  class="sdr-search-adhoc-play"
                  :class="{ 'sdr-search-adhoc-play--active': isAdhocSearching }"
                  :disabled="controlsDisabled || (!adhocSearchValid && !isAdhocSearching)"
                  :aria-label="isAdhocSearching ? 'Stop search' : 'Start search'"
                  :title="isAdhocSearching ? 'Stop search' : 'Start search'"
                  @click="onAdhocPlayClick"
                >
                  <svg v-if="isAdhocSearching" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
                  <svg v-else width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                </button>
              </div>
            </div>
            <div class="sdr-search-saved-ranges">
              <button
                type="button"
                class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
                :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': savedRangesExpanded }"
                @click="savedRangesExpanded = !savedRangesExpanded"
              >
                <label class="sdr-field-label sdr-frequency-manager-scanner-title">SAVED RANGES</label>
                <span class="sdr-frequency-manager-accordion-chevron">
                  <ChevronIcon />
                </span>
              </button>
              <div v-show="savedRangesExpanded">
                <div class="sdr-search-range-list" v-if="searchRanges.length > 0">
                  <div
                    v-for="r in searchRanges"
                    :key="r.id"
                    class="sdr-search-range-item"
                    :class="{ 'sdr-search-range-item-active': searchSelectedRangeId === r.id }"
                    :title="`step ${(r.step_hz/1000).toFixed(2)} kHz · ${r.mode}`"
                  >
                    <button
                      type="button"
                      class="sdr-search-range-item-body"
                      :disabled="controlsDisabled"
                      @click="selectSearchRange(r.id)"
                    >
                      <span class="sdr-search-range-primary">{{ r.label }}</span>
                      <span class="sdr-search-range-secondary">{{ (r.low_hz/1e6).toFixed(3) }}–{{ (r.high_hz/1e6).toFixed(3) }} MHz</span>
                    </button>
                    <button
                      type="button"
                      class="sdr-search-range-item-play"
                      :class="{ 'sdr-search-range-item-play--active': isSavedRangeSearching(r.id) }"
                      :disabled="controlsDisabled"
                      :aria-label="isSavedRangeSearching(r.id) ? 'Stop search' : 'Start search'"
                      :title="isSavedRangeSearching(r.id) ? 'Stop search' : 'Start search'"
                      @click.stop="onSavedRangePlayClick(r.id)"
                    >
                      <svg v-if="isSavedRangeSearching(r.id)" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"><rect x="1" y="1" width="8" height="8" fill="currentColor"/></svg>
                      <svg v-else width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
                    </button>
                  </div>
                </div>
                <div v-else class="sdr-scan-subsection-label" style="opacity:0.6">No ranges defined — add some in Frequency Manager.</div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ───────────── FREQUENCY MANAGER TAB (saved frequencies) ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'frequency-manager' }">

      <div class="sdr-frequency-manager-freqs-body">

        <div v-show="groupsWithFreqs.length > 0" class="sdr-frequency-manager-groups-filter">
          <div class="sdr-scan-groups-row sdr-frequency-manager-groups-filter-row">
            <button
              type="button"
              class="sdr-scan-group-chip"
              :class="{ 'sdr-scan-group-chip-active': freqFilterAllSelected }"
              @click="toggleFreqFilterAll"
            >All</button>
            <button
              v-for="g in groupsWithFreqs"
              :key="g.id"
              type="button"
              class="sdr-scan-group-chip"
              :class="{ 'sdr-scan-group-chip-active': !freqFilterAllSelected && freqFilterSelectedGroupIds.includes(g.id) }"
              @click="toggleFreqFilterGroup(g.id)"
            >{{ g.name }}</button>
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
                class="sdr-freq-row-play"
                aria-label="Play frequency"
                title="Play"
                @click.stop="playFreq(f)"
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><polygon points="2,1 11,6 2,11" fill="currentColor"/></svg>
              </button>
              <button
                class="sdr-freq-row-edit"
                aria-label="Edit frequency"
                title="Edit"
                @click.stop="toggleEditFreqPanel(f)"
              >&#x270E;</button>
              <button
                class="sdr-freq-row-del"
                aria-label="Delete frequency"
                title="Delete"
                @click.stop="deleteFreq(f.id)"
              >&#x2715;</button>
            </div>

            <!-- Inline edit form (accordion body) -->
            <div v-if="efOpen && editingFreqId === f.id" class="sdr-editfreq-body expanded" @click.stop>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">LABEL</label>
                <input class="sdr-panel-input" :class="{ 'sdr-input-error': efErrors.label }" type="text" placeholder="Label…" maxlength="60" style="width:100%" v-model="efLabel">
                <div v-if="efErrors.label" class="sdr-field-error">{{ efErrors.label }}</div>
              </div>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">FREQ (MHz)</label>
                <input class="sdr-panel-input" :class="{ 'sdr-input-error': efErrors.freq }" type="text" placeholder="118.3800" autocomplete="off" style="width:100%" v-model="efFreq">
                <div v-if="efErrors.freq" class="sdr-field-error">{{ efErrors.freq }}</div>
              </div>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">MODE</label>
                <div class="sdr-mode-pills" :class="{ 'sdr-input-error': efErrors.mode }">
                  <button
                    v-for="m in MODES"
                    :key="m"
                    class="sdr-mode-pill"
                    :class="{ active: efMode === m }"
                    @click="efMode = m"
                  >{{ m }}</button>
                </div>
                <div v-if="efErrors.mode" class="sdr-field-error">{{ efErrors.mode }}</div>
              </div>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">GROUPS</label>
                <div class="sdr-fmod-groups">
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
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">NOTES</label>
                <textarea
                  class="sdr-panel-input sdr-panel-textarea"
                  :class="{ 'sdr-input-error': efErrors.notes }"
                  placeholder="Notes…"
                  rows="4"
                  style="width:100%"
                  v-model="efNotes"
                ></textarea>
                <div v-if="efErrors.notes" class="sdr-field-error">{{ efErrors.notes }}</div>
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
        <div id="sdr-freq-empty" class="sdr-panel-empty" :style="{ display: freqs.length === 0 ? 'block' : 'none' }">
          No saved frequencies.<br>Tune to a frequency and use Add Frequency to save it.
        </div>
        <div v-if="freqs.length > 0 && filteredFreqs.length === 0" class="sdr-panel-empty">
          No matches.
        </div>

        <div v-show="!(efOpen && editingFreqId === null)" class="sdr-frequency-manager-add-freq-row">
          <button
            id="sdr-radio-add-freq"
            class="sdr-add-freq-btn"
            @click="openAddFreqPanel"
          >Add Frequency</button>
        </div>

        <!-- Add frequency panel (only when adding, not editing) -->
        <div v-if="efOpen && editingFreqId === null" id="sdr-editfreq-body" class="sdr-editfreq-body sdr-addfreq-body expanded">
          <div class="sdr-addfreq-title-row">
            <span class="sdr-scanner-section-label">ADD FREQUENCY</span>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">LABEL</label>
            <input id="sdr-ef-label" class="sdr-panel-input" :class="{ 'sdr-input-error': efErrors.label }" type="text" placeholder="Label…" maxlength="60" style="width:100%" v-model="efLabel">
            <div v-if="efErrors.label" class="sdr-field-error">{{ efErrors.label }}</div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">FREQ (MHz)</label>
            <input id="sdr-ef-freq" class="sdr-panel-input" :class="{ 'sdr-input-error': efErrors.freq }" type="text" placeholder="118.3800" autocomplete="off" style="width:100%" v-model="efFreq">
            <div v-if="efErrors.freq" class="sdr-field-error">{{ efErrors.freq }}</div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">MODE</label>
            <div id="sdr-ef-mode-pills" class="sdr-mode-pills" :class="{ 'sdr-input-error': efErrors.mode }">
              <button
                v-for="m in MODES"
                :key="m"
                class="sdr-mode-pill"
                :class="{ active: efMode === m }"
                @click="efMode = m"
              >{{ m }}</button>
            </div>
            <div v-if="efErrors.mode" class="sdr-field-error">{{ efErrors.mode }}</div>
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
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">NOTES</label>
            <textarea
              id="sdr-ef-notes"
              class="sdr-panel-input sdr-panel-textarea"
              :class="{ 'sdr-input-error': efErrors.notes }"
              placeholder="Notes…"
              rows="4"
              style="width:100%"
              v-model="efNotes"
            ></textarea>
            <div v-if="efErrors.notes" class="sdr-field-error">{{ efErrors.notes }}</div>
          </div>
          <div class="sdr-editfreq-actions">
            <div class="sdr-editfreq-actions-right">
              <button id="sdr-ef-cancel" class="sdr-panel-btn" @click="cancelEditFreq">CANCEL</button>
              <button id="sdr-ef-save" class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveFreq">SAVE</button>
            </div>
          </div>
        </div>

      </div>

      </div>

      <!-- ───────────── SEARCH RANGES TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'search-ranges' }">
      <div class="sdr-search-ranges-body">
        <div id="sdr-search-range-list">
          <div
            v-for="r in filteredSearchRanges"
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
                  <span class="sdr-freq-row-hz">{{ (r.low_hz/1e6).toFixed(3) }}–{{ (r.high_hz/1e6).toFixed(3) }} MHz</span>
                </div>
              </div>
              <span class="sdr-freq-row-play-spacer" aria-hidden="true"></span>
              <button v-if="!(rangeEditorOpen && editingRangeId === r.id)" class="sdr-freq-row-edit" aria-label="Edit range" title="Edit" @click.stop="toggleEditRange(r)">&#x270E;</button>
              <button class="sdr-freq-row-del"  aria-label="Delete range" title="Delete" @click.stop="deleteRange(r.id)">&#x2715;</button>
            </div>

            <!-- Inline edit form (accordion body) -->
            <div v-if="rangeEditorOpen && editingRangeId === r.id" class="sdr-editfreq-body expanded" @click.stop>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">LABEL</label>
                <input class="sdr-panel-input" type="text" placeholder="e.g. Air Band" maxlength="60" style="width:100%" v-model="rangeEditor.label">
              </div>
              <div class="sdr-editfreq-field sdr-range-row">
                <div class="sdr-range-col">
                  <label class="sdr-field-label">LOW (MHz)</label>
                  <input class="sdr-panel-input" type="number" step="0.0001" style="width:100%" v-model="rangeEditor.low_mhz">
                </div>
                <div class="sdr-range-col">
                  <label class="sdr-field-label">HIGH (MHz)</label>
                  <input class="sdr-panel-input" type="number" step="0.0001" style="width:100%" v-model="rangeEditor.high_mhz">
                </div>
              </div>
              <div class="sdr-editfreq-field sdr-range-row">
                <div class="sdr-range-col">
                  <label class="sdr-field-label">STEP</label>
                  <div
                    :ref="setStepDropdownRef"
                    class="sdr-device-dropdown sdr-step-dropdown"
                    :class="{ 'sdr-device-dropdown--open': stepMenuOpen }"
                    tabindex="0"
                    @click.stop="toggleStepMenu('range')"
                    @keydown="onStepDropdownKey($event, 'range')"
                  >
                    <div class="sdr-device-dropdown-selected">
                      <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{ stepMenuLabel }}</span>
                      <span class="sdr-device-dropdown-arrow"></span>
                    </div>
                  </div>
                </div>
                <div class="sdr-range-col">
                  <label class="sdr-field-label">DWELL (ms)</label>
                  <input class="sdr-panel-input" type="number" step="10" min="50" style="width:100%" v-model="rangeEditor.dwell_ms">
                </div>
              </div>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">MODE</label>
                <div class="sdr-mode-pills">
                  <button
                    v-for="m in SEARCH_MODES"
                    :key="m"
                    type="button"
                    class="sdr-mode-pill"
                    :class="{ active: rangeEditor.mode === m }"
                    @click="rangeEditor.mode = m"
                  >{{ m }}</button>
                </div>
              </div>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">THRESHOLD (dBFS)</label>
                <input class="sdr-panel-input" type="number" step="1" style="width:100%" v-model="rangeEditor.threshold_dbfs">
              </div>
              <div class="sdr-editfreq-field">
                <label class="sdr-field-label">NOTES</label>
                <textarea class="sdr-panel-input sdr-panel-textarea" rows="3" style="width:100%" v-model="rangeEditor.notes"></textarea>
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
        </div>

        <div v-if="searchRanges.length === 0" class="sdr-panel-empty">
          No search ranges defined.
        </div>
        <div v-else-if="filteredSearchRanges.length === 0" class="sdr-panel-empty">
          No ranges match your search.
        </div>

        <div v-show="!(rangeEditorOpen && editingRangeId === null)" class="sdr-frequency-manager-add-freq-row">
          <button class="sdr-add-freq-btn" @click="openAddRange">Add Range</button>
        </div>

        <!-- Add range panel (only when adding, not editing) -->
        <div v-if="rangeEditorOpen && editingRangeId === null" class="sdr-editfreq-body sdr-addfreq-body expanded">
          <div class="sdr-addfreq-title-row">
            <span class="sdr-scanner-section-label">ADD RANGE</span>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">LABEL</label>
            <input class="sdr-panel-input" type="text" placeholder="e.g. Air Band" maxlength="60" style="width:100%" v-model="rangeEditor.label">
          </div>
          <div class="sdr-editfreq-field sdr-range-row">
            <div class="sdr-range-col">
              <label class="sdr-field-label">LOW (MHz)</label>
              <input class="sdr-panel-input" type="number" step="0.0001" style="width:100%" v-model="rangeEditor.low_mhz">
            </div>
            <div class="sdr-range-col">
              <label class="sdr-field-label">HIGH (MHz)</label>
              <input class="sdr-panel-input" type="number" step="0.0001" style="width:100%" v-model="rangeEditor.high_mhz">
            </div>
          </div>
          <div class="sdr-editfreq-field sdr-range-row">
            <div class="sdr-range-col">
              <label class="sdr-field-label">STEP</label>
              <div
                :ref="setStepDropdownRef"
                class="sdr-device-dropdown sdr-step-dropdown"
                :class="{ 'sdr-device-dropdown--open': stepMenuOpen }"
                tabindex="0"
                @click.stop="toggleStepMenu('range')"
                @keydown="onStepDropdownKey($event, 'range')"
              >
                <div class="sdr-device-dropdown-selected">
                  <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{ stepMenuLabel }}</span>
                  <span class="sdr-device-dropdown-arrow"></span>
                </div>
              </div>
            </div>
            <div class="sdr-range-col">
              <label class="sdr-field-label">DWELL (ms)</label>
              <input class="sdr-panel-input" type="number" step="10" min="50" style="width:100%" v-model="rangeEditor.dwell_ms">
            </div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">MODE</label>
            <div class="sdr-mode-pills">
              <button
                v-for="m in SEARCH_MODES"
                :key="m"
                type="button"
                class="sdr-mode-pill"
                :class="{ active: rangeEditor.mode === m }"
                @click="rangeEditor.mode = m"
              >{{ m }}</button>
            </div>
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">THRESHOLD (dBFS)</label>
            <input class="sdr-panel-input" type="number" step="1" style="width:100%" v-model="rangeEditor.threshold_dbfs">
          </div>
          <div class="sdr-editfreq-field">
            <label class="sdr-field-label">NOTES</label>
            <textarea class="sdr-panel-input sdr-panel-textarea" rows="3" style="width:100%" v-model="rangeEditor.notes"></textarea>
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
      </div>

      <!-- ───────────── GROUPS TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'groups' }">
        <div id="sdr-group-list">
          <div class="sdr-group-pills">
            <div v-for="g in sortedGroups" :key="g.id" class="sdr-group-pill">
              <span class="sdr-group-pill-name">{{ g.name }}</span>
              <button class="sdr-group-pill-edit" title="Rename group" @click.stop="startEditGroupRow(g)">&#x270E;</button>
              <button class="sdr-group-pill-del" title="Delete group" @click.stop="deleteGroup(g.id)">&#x2715;</button>
            </div>
          </div>
        </div>
        <div class="sdr-panel-add-row sdr-frequency-manager-group-add-row">
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

      <!-- ───────────── RECORDINGS TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'recordings' }">
        <SdrClipsSection
          ref="clipsSectionRef"
          :live-recording="liveRecording"
          :rec-squelch-open="recSquelchOpen"
          :live-elapsed-s="liveElapsedS"
        />
      </div>

    </div>

  </div>

  <!-- Step dropdown menu (teleported so it overlays the side panel) -->
  <Teleport to="body">
    <div
      v-if="stepMenuOpen"
      ref="stepMenuRef"
      class="sdr-device-menu sdr-device-menu--open sdr-step-menu"
      :style="stepMenuStyle"
      @click.stop
    >
      <div
        v-for="s in STEP_OPTIONS_KHZ"
        :key="s"
        class="sdr-device-menu-item"
        :class="{ 'sdr-device-menu-item--selected': parseFloat(stepMenuTarget === 'adhoc' ? adhocStepKhz : rangeEditor.step_khz) === s }"
        @click="pickStep(s)"
      >
        {{ formatStepKhz(s) }}
      </div>
    </div>
  </Teleport>

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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useSdrAudio } from '@/composables/useSdrAudio'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import SdrClipsSection from './SdrClipsSection.vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import { useSdrStore } from '@/stores/sdr'
import type { SdrMode } from '@/stores/sdr'
import { useNotificationsStore } from '@/stores/notifications'
import type { SdrSearchRange } from '@/services/sdrSearchApi'
import {
  listSearchRanges as apiListSearchRanges,
  createSearchRange as apiCreateSearchRange,
  updateSearchRange as apiUpdateSearchRange,
  deleteSearchRange as apiDeleteSearchRange,
} from '@/services/sdrSearchApi'

interface SdrRadio { id: number; name: string; host: string; enabled: boolean }
interface SdrFrequencyGroup { id: number; name: string; slug: string; color: string; sort_order: number }
interface SdrStoredFrequency {
  id: number; label: string; frequency_hz: number; mode: string;
  scannable: boolean; group_ids: number[]; group_id?: number | null;
  squelch?: number; gain?: number; notes?: string
}
defineProps<{ fullPage: boolean }>()

const sdrAudio = useSdrAudio()

// Lazy store accessor. MUST be declared here — above every watcher that calls
// it — not lower in the file. `_sdrStore` is a hoisted function so it is
// *callable* early, but its body closes over the `let _spectrumStore` binding.
// The `{ immediate: true }` watchers below fire synchronously during setup and
// call _sdrStore(); if `let _spectrumStore` is declared further down it is
// still in its temporal dead zone at that point → "ReferenceError: Cannot
// access '_spectrumStore' before initialization" (the crash on every SDR page
// load). Keeping the declaration before the watchers is load-bearing.
let _spectrumStore: ReturnType<typeof useSdrStore> | null = null
function _sdrStore() {
  if (!_spectrumStore) _spectrumStore = useSdrStore()
  return _spectrumStore
}

let _notifStore: ReturnType<typeof useNotificationsStore> | null = null
function _notificationsStore() {
  if (!_notifStore) _notifStore = useNotificationsStore()
  return _notifStore
}

// Pending external (auto-tune) request, applied once the control socket opens.
let _pendingExternalTune: { hz: number; mode: SdrMode; satName: string; noradId?: string; token?: string } | null = null

// State captured the moment an auto-tune takes over the radio, so the LOS
// restore can put things back. `playing` records whether audio was running
// before AOS; when false the radio was stopped (or merely connected) and the
// restore stops playback again. `token` ties this snapshot to the firing pass so
// a stale LOS (after a newer pass retuned) is ignored. `tunedHz`/`tunedMode` are
// what we tuned *to* — the restore only acts if the radio is still on them
// (i.e. the user hasn't manually retuned since), so we never clobber a manual change.
let _autoTunePrevState:
  | { token?: string; playing: boolean; freqHz: number; mode: SdrMode; tunedHz: number; tunedMode: SdrMode }
  | null = null

const MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW'] as const
const SIGNAL_SEGS = 36
const ONLINE_CACHE_KEY  = 'sdrOnlineRadioIds'

// ── Active tab ────────────────────────────────────────────────────────────────
type SdrTab = 'radio' | 'frequency-manager' | 'search-ranges' | 'groups' | 'recordings'
const SDR_TAB_KEY = 'sentinel_sdr_tab'
const sdrTabs: ReadonlyArray<{ id: SdrTab; label: string }> = [
  { id: 'radio',      label: 'RADIO' },
  { id: 'frequency-manager', label: 'FREQUENCY MANAGER' },
  { id: 'search-ranges', label: 'SEARCH RANGES' },
  { id: 'groups',     label: 'GROUPS' },
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

// The config JSON editor (Settings → App Settings → Application Config) just
// replaced the DB settings. Re-hydrate the sdr store's cached
// autoCenterWaterfallOnTune so a change made there takes effect on the live
// waterfall immediately — SdrPanel is mounted for the whole SDR session, so
// this stays in sync even when the Settings SDR control isn't mounted.
useDocumentEvent('sentinel:config-uploaded', () => {
  void _sdrStore().hydrateAutoCenterFromDb()
  void _sdrStore().hydrateResumeDelaySecFromDb()
})

const clipsSectionRef = ref<InstanceType<typeof SdrClipsSection> | null>(null)

// ── Radio state ───────────────────────────────────────────────────────────────
const connected         = ref(false)
const playing           = ref(false)
// Mirror play state into the store so SdrWaterfall can gate its rendering.
// A single passive watch — deliberately does NOT alter any existing
// play-state logic (avoids the regression that earlier setPlayingState
// substitutions risked).
watch(playing, (v) => { _sdrStore().setPlaying(v) })
const controlsDisabled  = ref(true)
const selectedRadioId   = ref<number | null>(null)
const knownRadios       = ref<SdrRadio[]>([])
const currentMode       = ref('AM')
const freqInputVal      = ref('')
const freqInputPrev     = ref('')
const freqInputRef      = ref<HTMLInputElement | null>(null)
const currentFreqHz     = ref(0)
const gainDb            = ref(30)
const gainAuto          = ref(false)
const volume            = ref(80)
const squelch           = ref(-30)
const bwHz              = ref(10000)
const bwMax             = ref(2048000)
// Hardware sample rate (rtl_tcp): governs the spectrum/waterfall x-axis span
// and is fully independent of the demod-filter Bandwidth slider above. Tiers
// match snapToValidSampleRate() in sdrPanelUtils.ts — the 1.024 MHz floor
// avoids the stuttering 250k/300k tiers measured on the remote Pi.
const SAMPLE_RATE_OPTIONS = [1024000, 1536000, 1792000, 2048000] as const
const sampleRateHz      = ref<number>(2048000)
// Resume delay is owned by the SDR store (Settings → SDR → SCAN & SEARCH).
// Wrapped in a computed so the existing watcher code keeps using
// `resumeDelaySec.value` unchanged.
const resumeDelaySec    = computed<number>(() => _sdrStore().resumeDelaySec)
const activeFreqDisplay = ref('')
const signalSmoothed    = ref(-120)
const signalLit         = ref(0)
const worklestSquelchOpen = ref(true)

// ── Store mirrors / marker bridge ─────────────────────────────────────────────
// Passive mirrors so the spectrum/waterfall marker (SdrWaterfall, a sibling)
// can read the authoritative tuned freq + demod bandwidth. These fire on EVERY
// existing path that mutates the local refs (tune, tuneToFreq, setMode,
// onBwInput, applyStatus) — no changes to those functions.
watch(currentFreqHz, (v) => { if (v) _sdrStore().setFrequency(v) }, { immediate: true })
watch(bwHz,          (v) => { _sdrStore().setBandwidthHz(v) },       { immediate: true })

// Collapse the Scanner + Search accordions whenever the side panel opens,
// so the user starts from a clean state instead of inheriting prior expansion.
watch(() => _sdrStore().panelOpen, (open) => {
  if (open) {
    scannerSectionExpanded.value = false
    searchSectionExpanded.value = false
    savedRangesExpanded.value = false
  }
})

// Demod NCO offset bridge. The store is the single source of truth for the
// offset from the hardware centre (set by the waterfall click handler when
// auto-centre is OFF, cleared to 0 by the ON path / toggle). Push every change
// into the audio worklet. immediate so a restored 0 is asserted on mount.
watch(() => _sdrStore().tuningOffsetHz,
  (hz) => { sdrAudio.setOffsetHz(hz || 0) },
  { immediate: true },
)

// Marker retune request. The bar/marker only moves once currentFreqHz updates
// (the waterfall watches it via applyMarker), so update the display state
// immediately for snappy click-to-tune — only debounce the hardware sendCmd
// and the persistent saves so rapid drags still coalesce.
watch(() => _sdrStore().tuneRequest, (req) => {
  if (!req || !playing.value || !selectedRadioId.value) return
  const hz = Math.round(req.hz)
  if (!hz || hz === currentFreqHz.value) return
  currentFreqHz.value = hz
  activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
  freqInputVal.value = (hz / 1e6).toFixed(4)
  // A freq-axis drag-pan (req.center) commits exactly ONCE on mouse release, so
  // it needs no coalescing debounce — retune the hardware IMMEDIATELY so the
  // panned view fills with real data without the ~600ms lag. The pan means
  // "move the hardware centre" regardless of the auto-centre toggle. (Marker
  // drags / typed freqs still debounce below to coalesce continuous updates.)
  if (req.center) {
    if (_retuneDebounce) clearTimeout(_retuneDebounce)
    sendCmd({ cmd: 'tune', frequency_hz: hz })
    // Persist (best-effort) without blocking the retune.
    _retuneDebounce = setTimeout(() => {
      sessionStorage.setItem('sdrLastFreqHz', String(hz))
      saveSettings()
    }, 600)
    return
  }
  if (_retuneDebounce) clearTimeout(_retuneDebounce)
  _retuneDebounce = setTimeout(() => {
    sessionStorage.setItem('sdrLastFreqHz', String(hz))
    saveSettings()
    // Auto-centre OFF: do NOT retune the hardware — the demod NCO offset
    // (already set in the store by the waterfall click) tunes the audio while
    // the display stays put. Calling sendCmd('tune') here would both recenter
    // the hardware AND clear the offset (sendCmd zeroes it on any tune), so
    // skip it.
    if (_sdrStore().autoCenterWaterfallOnTune) {
      sendCmd({ cmd: 'tune', frequency_hz: hz })
    }
  }, 600)
})

// Waterfall FFT-size request. The waterfall sizes its desired bin count to the
// canvas's device-pixel width so each bin maps to ~1 px (no blur from upsampling
// a 1024-bin FFT into a 2600+ px canvas). Forwarded straight to the backend; it
// clamps to a power of two in [MIN_FFT_SIZE, MAX_FFT_SIZE].
watch(() => _sdrStore().fftSizeRequest, (req) => {
  if (!req) return
  sendCmd({ cmd: 'fft_size', bins: req.bins })
})

// Marker bandwidth request — demod audio filter ONLY (no sample_rate command;
// matches SDR++/SDR#/GQRX and avoids the rtl_tcp reconfigure stall).
watch(() => _sdrStore().bwRequest, (req) => {
  if (!req || !playing.value) return
  const v = Math.round(req.hz)
  if (!v || v === bwHz.value) return
  bwHz.value = v               // re-mirrors to the store via the watch above
  saveSettings()
  sdrAudio.setBandwidthHz(v)
})

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
const scanSelectedGroupIds = ref<number[]>([])
const scanAllSelected = ref(true)
let _scanQueue: SdrStoredFrequency[] = []
let _scanIdx   = 0
let _scanTimer: ReturnType<typeof setTimeout> | null = null

// ── Search (high/low frequency range sweep) ──────────────────────────────────
const searchSectionExpanded = ref(false)
const savedRangesExpanded = ref(false)
const rangesSectionExpanded = ref(false)
const searchRanges          = ref<SdrSearchRange[]>([])
const filteredSearchRanges = computed<SdrSearchRange[]>(() => searchRanges.value)
const searchActive          = ref(false)
const searchLocked          = ref(false)
const searchSelectedRangeId = ref<number | null>(null)
// Tracks whether the running search was started from the ad-hoc inputs or a
// saved range list item — needed so per-item play/stop buttons can show the
// correct icon and toggle the correct sweep.
const searchActiveSource    = ref<'adhoc' | 'saved' | null>(null)
const searchCurrentHz       = ref<number | null>(null)

// Ad-hoc search inputs (low/high MHz, step kHz) — required fields shown
// above the saved ranges list. When all three are valid, SEARCH uses these
// instead of a saved range.
const adhocLowMhz  = ref<string>('')
const adhocHighMhz = ref<string>('')
const adhocStepKhz = ref<string>('12.5')
const adhocSearchValid = computed(() => {
  const lo = parseFloat(adhocLowMhz.value)
  const hi = parseFloat(adhocHighMhz.value)
  const st = parseFloat(adhocStepKhz.value)
  return isFinite(lo) && isFinite(hi) && isFinite(st) && lo < hi && st > 0
})
let _searchHz = 0
let _searchTimer: ReturnType<typeof setTimeout> | null = null

// Post-tune race guard for the search engine. The backend tags FFT frames with
// `conn.center_hz` at FFT time, not at IQ-read time — so a frame can be labelled
// with the new frequency while its IQ samples were captured at the previous
// one. We track how many frames have arrived bearing the expected center_hz
// since the last retune, and only sample after a minimum settle window has
// elapsed *and* at least one matching frame has been seen (we discard the
// first one as a race-window guard).
let _expectedCenterHz: number | null = null
let _postTuneFrameCount = 0
let _tuneAtMs = 0
const SEARCH_MIN_SETTLE_MS = 250
const SEARCH_RECHECK_MS = 80
const SEARCH_MAX_RECHECKS = 6

// Latest spectrum frame stash — used by the search engine to read the centre
// bin's dBFS power after the dwell interval to decide hold-on-signal.
let _lastSpectrum: { bins: number[]; center_hz: number; sample_rate: number } | null = null

// ── Groups + frequencies ──────────────────────────────────────────────────────
const groups       = ref<SdrFrequencyGroup[]>([])
const freqs        = ref<SdrStoredFrequency[]>([])
const freqFilterSelectedGroupIds = ref<number[]>([])
const freqFilterAllSelected = ref(true)
const scannerSectionExpanded = ref(false)
const settingsSectionExpanded = ref(true)
const newGroupName = ref('')

const currentFreqLabel = computed<string>(() => {
  const hz = currentFreqHz.value
  if (!hz) return ''
  const match = freqs.value.find(f => f.frequency_hz === hz)
  return match?.label || ''
})

const filteredFreqs = computed<SdrStoredFrequency[]>(() => {
  if (!freqFilterAllSelected.value && freqFilterSelectedGroupIds.value.length > 0) {
    const selected = new Set(freqFilterSelectedGroupIds.value)
    return freqs.value.filter(f => freqGroupsFor(f).some(g => selected.has(g.id)))
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

const groupsWithFreqs = computed<SdrFrequencyGroup[]>(() => {
  const idsWithFreqs = new Set<number>()
  freqs.value.forEach(f => {
    ;(f.group_ids || []).forEach(id => { if (id !== 0) idsWithFreqs.add(id) })
    if (f.group_id != null && f.group_id !== 0) idsWithFreqs.add(f.group_id)
  })
  return groups.value
    .filter(g => idsWithFreqs.has(g.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
})

const sortedGroups = computed<SdrFrequencyGroup[]>(() =>
  groups.value.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
)

// Mirror scanner sweep state + selected group labels into the store. The
// waterfall component reads these to show the same paused/holding overlay
// used during a range search whenever the scanner is stepping between
// frequencies (but not when it has locked onto an active signal).
watch(
  [scanActive, scanLocked, scanAllSelected, scanSelectedGroupIds, groupsWithFreqs],
  ([active, locked, allSel, selIds, groupsList]) => {
    const _ss = _sdrStore()
    _ss.scanSweeping = !!active && !locked
    if (allSel || (selIds as number[]).length === 0) {
      _ss.scanGroupNames = ['All']
    } else {
      const sel = new Set(selIds as number[])
      _ss.scanGroupNames = (groupsList as SdrFrequencyGroup[])
        .filter(g => sel.has(g.id))
        .map(g => g.name)
    }
  },
  { immediate: true, deep: true },
)

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
const efNotes       = ref('')
const efErrors      = ref<{ label?: string; freq?: string; mode?: string; notes?: string }>({})
const NOTES_ALLOWED = /^[A-Za-z0-9\s.,!?\-_():;/@]*$/
watch(efLabel, () => { if (efErrors.value.label) efErrors.value = { ...efErrors.value, label: undefined } })
watch(efFreq,  () => { if (efErrors.value.freq)  efErrors.value = { ...efErrors.value, freq:  undefined } })
watch(efMode,  () => { if (efErrors.value.mode)  efErrors.value = { ...efErrors.value, mode:  undefined } })
watch(efNotes, () => { if (efErrors.value.notes) efErrors.value = { ...efErrors.value, notes: undefined } })

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

import { formatBwHz, parseFreqMhz, defaultBwHz } from './sdrPanelUtils'

function saveSettings() {
  try {
    sessionStorage.setItem('sdrSettings', JSON.stringify({
      gainDb: gainDb.value, gainAuto: gainAuto.value, squelch: squelch.value,
      bwHz: bwHz.value, vol: volume.value, mode: currentMode.value, freqHz: currentFreqHz.value,
      sampleRateHz: sampleRateHz.value,
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
    if (typeof s.sampleRateHz === 'number' &&
        SAMPLE_RATE_OPTIONS.includes(s.sampleRateHz as typeof SAMPLE_RATE_OPTIONS[number])) {
      sampleRateHz.value = s.sampleRateHz
      bwMax.value = s.sampleRateHz
    }
  } catch (_) {}
}

// ── Control WebSocket ─────────────────────────────────────────────────────────

let _ctrlSocket:       WebSocket | null = null
let _ctrlReconnectDelay = 500
const CTRL_RECONNECT_MAX = 30000
let _ctrlRadioId:      number | null    = null
let _ctrlReconnect:    ReturnType<typeof setTimeout> | null = null
let _ctrlDataConfirmed = false

function _markInitialised(id: number) { sessionStorage.setItem(`sdrInit_${id}`, '1') }
function _isInitialised(id: number)   { return sessionStorage.getItem(`sdrInit_${id}`) === '1' }

function sendCmd(obj: object) {
  // A hardware tune always recenters the SDR on the new freq, so any prior
  // demod NCO offset (auto-centre OFF) is no longer valid — clear it here, the
  // single chokepoint for every retune path (typed, saved, marker, restore).
  // The auto-centre-OFF click path deliberately does NOT call sendCmd('tune'),
  // so it keeps its offset.
  if ((obj as { cmd?: string }).cmd === 'tune' && _sdrStore().tuningOffsetHz !== 0) {
    _sdrStore().setTuningOffsetHz(0)
  }
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
    const res = await fetch('/api/sdr/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ radio_id: radioId }),
    })
    // 404 means this radio no longer exists in the DB (e.g. deleted while a
    // stale sdrLastRadioId lingered in sessionStorage). Retrying would 404
    // every reconnect — clear the id and stop the loop instead.
    if (res.status === 404) {
      sessionStorage.removeItem('sdrLastRadioId')
      closeControlSocket()
      selectedRadioId.value = null
      deviceDropdownLabel.value = '— select radio —'
      controlsDisabled.value = true
      return
    }
  } catch (_) {}

  // Bail if the radio selection changed (or the socket was torn down) while the
  // connect request was in flight — otherwise we'd open a socket for a stale id.
  if (_ctrlRadioId !== radioId) return

  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws    = new WebSocket(`${proto}://${location.host}/ws/sdr/${radioId}`)
  _ctrlSocket = ws

  ws.addEventListener('open', () => {
    _ctrlReconnectDelay = 500
    const lastMode = sessionStorage.getItem('sdrLastMode') || 'AM'
    if (!_isInitialised(radioId)) _markInitialised(radioId)
    if (sessionStorage.getItem('sdrPlaying') === '1') {
      playing.value = true
      sdrAudio.setMode(lastMode as SdrMode)
      sdrAudio.initAudio(radioId)
    }
    // Replay the most recent waterfall-driven FFT size request, if any. The
    // waterfall publishes its target bin count on mount, which may have fired
    // before this socket opened (sendCmd silently drops while CONNECTING).
    const fftReq = _sdrStore().fftSizeRequest
    if (fftReq) sendCmd({ cmd: 'fft_size', bins: fftReq.bins })
    // Push the restored hardware sample rate so the backend's span matches
    // what the user last picked, instead of whatever the device default is.
    sendCmd({ cmd: 'sample_rate', rate_hz: sampleRateHz.value })
    // Apply a queued auto-tune now that the socket can accept commands.
    if (_pendingExternalTune) _applyPendingExternalTune()
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
        if (Array.isArray(msg.bins)) {
          _sdrStore().setSpectrum({
            bins: msg.bins,
            center_hz: msg.center_hz,
            sample_rate: msg.sample_rate,
            ts: msg.timestamp_ms,
          })
          _lastSpectrum = {
            bins: msg.bins as number[],
            center_hz: msg.center_hz as number,
            sample_rate: msg.sample_rate as number,
          }
          if (_expectedCenterHz !== null && msg.center_hz === _expectedCenterHz) {
            _postTuneFrameCount++
          }
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
    const delay = _ctrlReconnectDelay
    _ctrlReconnectDelay = Math.min(_ctrlReconnectDelay * 2, CTRL_RECONNECT_MAX)
    _ctrlReconnect = setTimeout(() => {
      if (_ctrlRadioId === radioId) void openControlSocket(radioId)
    }, delay)
  })

  ws.addEventListener('error', () => { setStatus(false) })
}

function closeControlSocket() {
  _ctrlReconnectDelay = 500
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

// ── Scroll-to-tune (per-digit) ────────────────────────────────────────────────
// Hover a digit in the frequency input and scroll the wheel to step that digit's
// place value. We work in Hz and reformat (rather than editing the character) so
// 9→0 carries fall out naturally. Display updates live per notch; the hardware
// retune is debounced (250ms) via the store's tuneRequest path so the spectrum
// marker stays in sync — matching onPlotWheel in SdrWaterfall.vue.
let _freqWheelDebounce: ReturnType<typeof setTimeout> | null = null
let _freqWheelMirror: HTMLSpanElement | null = null

// Measure the on-screen left edge (px, from the input's content box) of each
// character in `str`, using a hidden span that mirrors the input's exact font
// metrics — including letter-spacing, which canvas measureText ignores. The
// browser does the real layout, so the boundaries are pixel-accurate and don't
// accumulate rounding error across the string.
function freqCharEdges(el: HTMLInputElement, str: string): number[] {
  if (!_freqWheelMirror) {
    _freqWheelMirror = document.createElement('span')
    _freqWheelMirror.style.position = 'absolute'
    _freqWheelMirror.style.visibility = 'hidden'
    _freqWheelMirror.style.whiteSpace = 'pre'
    _freqWheelMirror.style.left = '-9999px'
    _freqWheelMirror.style.top = '0'
    document.body.appendChild(_freqWheelMirror)
  }
  const m = _freqWheelMirror
  const cs = getComputedStyle(el)
  m.style.font = cs.font
  m.style.fontFamily = cs.fontFamily
  m.style.fontSize = cs.fontSize
  m.style.fontWeight = cs.fontWeight
  m.style.fontVariantNumeric = cs.fontVariantNumeric
  m.style.letterSpacing = cs.letterSpacing
  // Width of each leading prefix "", "N", "NN", … gives every character's right
  // edge; index i's span is [edges[i], edges[i+1]).
  const edges: number[] = [0]
  for (let i = 1; i <= str.length; i++) {
    m.textContent = str.slice(0, i)
    edges.push(m.getBoundingClientRect().width)
  }
  return edges
}

// Map the wheel event's cursor X to the place value (in Hz) of the digit under it,
// using the authoritative currentFreqHz (the input may be transiently blanked on
// focus). Returns null when the cursor is over the decimal point or out of range.
function freqDigitPlaceHz(e: WheelEvent): number | null {
  const el = freqInputRef.value
  if (!el || !currentFreqHz.value) return null
  const str = (currentFreqHz.value / 1e6).toFixed(4) // "NNN.DDDD"
  const rect = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  // Text starts after the left padding/border (both 0 here, but read to be safe).
  const x = e.clientX - rect.left - parseFloat(cs.paddingLeft || '0') - parseFloat(cs.borderLeftWidth || '0')
  if (x < 0) return null
  const edges = freqCharEdges(el, str)
  let idx = -1
  for (let i = 0; i < str.length; i++) {
    if (x >= edges[i] && x < edges[i + 1]) { idx = i; break }
  }
  if (idx < 0 || str[idx] === '.') return null
  const dot = str.indexOf('.')
  // Integer digit at index idx: place 10^(dot-1-idx) MHz. Decimal digit: 10^-(idx-dot) MHz.
  const placeMhz = idx < dot
    ? Math.pow(10, dot - 1 - idx)
    : Math.pow(10, -(idx - dot))
  return placeMhz * 1e6
}

function onFreqWheel(e: WheelEvent) {
  if (controlsDisabled.value || scanActive.value) return
  const placeHz = freqDigitPlaceHz(e)
  if (placeHz == null) return
  const dir = e.deltaY < 0 ? 1 : -1 // scroll up → higher freq
  const newHz = Math.round(currentFreqHz.value + dir * placeHz)
  if (newHz <= 0) return
  // Update the display live every notch.
  currentFreqHz.value = newHz
  activeFreqDisplay.value = (newHz / 1e6).toFixed(3) + ' MHz'
  freqInputVal.value = (newHz / 1e6).toFixed(4)
  // Commit to hardware once the burst settles (only when playing). Reuses the
  // tuneRequest watcher: marker sync + sendCmd('tune') + persistence.
  if (playing.value && selectedRadioId.value) {
    if (_freqWheelDebounce) clearTimeout(_freqWheelDebounce)
    _freqWheelDebounce = setTimeout(() => {
      _freqWheelDebounce = null
      _sdrStore().requestTune(currentFreqHz.value, true)
    }, 250)
  }
}

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
  if (scanActive.value) stopScan()
  if (searchActive.value) stopSearch()
  sdrAudio.stop()
  setPlayingState(false)
  signalSmoothed.value = -120
  signalLit.value = 0
}

function formatFreqInput() {
  const raw = freqInputVal.value.trim()
  if (!raw) return
  const n = parseFloat(raw)
  if (!isFinite(n)) return
  freqInputVal.value = n.toFixed(4)
}

function onFreqInputFocus() {
  if (freqInputVal.value !== '') {
    freqInputPrev.value = freqInputVal.value
    const el = freqInputRef.value
    if (el) el.style.minWidth = `${el.getBoundingClientRect().width}px`
  }
  freqInputVal.value = ''
}

function onFreqInputBlur() {
  if (!freqInputVal.value.trim()) {
    freqInputVal.value = freqInputPrev.value
  } else {
    formatFreqInput()
  }
  const el = freqInputRef.value
  if (el) el.style.minWidth = ''
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

function onBwInput(e: Event) {
  const v = parseInt((e.target as HTMLInputElement).value, 10)
  bwHz.value = v
  saveSettings()
  // Demod audio filter only — the spectrum/FFT span is governed by the
  // hardware sample rate (separate Sample Rate selector below), matching
  // SDR# / SDR++ / GQRX where Bandwidth never reconfigures the device.
  sdrAudio.setBandwidthHz(v)
}

const sampleRateDropdownRef = ref<HTMLElement | null>(null)
const sampleRateMenuRef     = ref<HTMLElement | null>(null)
const sampleRateMenuOpen    = ref(false)
const sampleRateMenuStyle   = ref<Record<string, string>>({})

function positionSampleRateMenu() {
  const el = sampleRateDropdownRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  sampleRateMenuStyle.value = { left: rect.left + 'px', top: rect.bottom + 'px', width: rect.width + 'px' }
}

function toggleSampleRateMenu() {
  if (controlsDisabled.value) return
  if (sampleRateMenuOpen.value) { closeSampleRateMenu(); return }
  positionSampleRateMenu()
  sampleRateMenuOpen.value = true
}

function closeSampleRateMenu() { sampleRateMenuOpen.value = false }

function onSampleRateDropdownKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSampleRateMenu() }
  if (e.key === 'Escape') closeSampleRateMenu()
}

function pickSampleRate(v: number) {
  closeSampleRateMenu()
  if (!SAMPLE_RATE_OPTIONS.includes(v as typeof SAMPLE_RATE_OPTIONS[number])) return
  if (v === sampleRateHz.value) return
  sampleRateHz.value = v
  // Update the BW slider ceiling synchronously so the UI doesn't wait for the
  // backend's status echo, and clamp the current bwHz down if it now exceeds.
  bwMax.value = v
  if (bwHz.value > v) {
    bwHz.value = v
    sdrAudio.setBandwidthHz(v)
  }
  saveSettings()
  sendCmd({ cmd: 'sample_rate', rate_hz: v })
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
  // Seed the frequency field from the device's center_hz even while the radio is
  // still reporting connected=false (the initial status sent right after a page
  // refresh). Without this the input stays blank until the user manually tunes,
  // which looked like "the selected SDR can't be tuned again after a refresh".
  const hadUserFreq = currentFreqHz.value && currentFreqHz.value !== msg.center_hz
  if (!hadUserFreq && msg.center_hz > 0) {
    currentFreqHz.value = msg.center_hz
    freqInputVal.value = (msg.center_hz / 1e6).toFixed(4)
    activeFreqDisplay.value = (msg.center_hz / 1e6).toFixed(3) + ' MHz'
  }
  // The remaining fields reflect live hardware state — only trust them once the
  // device is actually connected and streaming.
  if (!msg.connected) return
  currentMode.value = msg.mode
  gainDb.value = msg.gain_db
  gainAuto.value = msg.gain_auto
  bwMax.value = msg.sample_rate
  if (SAMPLE_RATE_OPTIONS.includes(msg.sample_rate as typeof SAMPLE_RATE_OPTIONS[number])) {
    sampleRateHz.value = msg.sample_rate
  }
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

function onDocumentClick() {
  if (deviceMenuOpen.value) closeDeviceMenu()
  if (sampleRateMenuOpen.value) closeSampleRateMenu()
  if (stepMenuOpen.value) closeStepMenu()
}

// ── Populate radios (called externally via event / boot) ──────────────────────

const RADIOS_CACHE_KEY2 = 'sdrRadiosCache'

function populateRadios(radios: SdrRadio[]) {
  knownRadios.value = radios
  radiosLoading.value = false
  try { sessionStorage.setItem(RADIOS_CACHE_KEY2, JSON.stringify(radios)) } catch (_) {}
  const savedId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '', 10)
  const savedRadio = savedId ? radios.find(r => r.id === savedId && r.enabled) : undefined
  // Pick a radio to make the panel usable without a manual dropdown selection:
  //   1. the remembered radio (if still present + enabled), else
  //   2. the sole enabled radio — when there's exactly one, there's nothing to
  //      disambiguate, so auto-select it (fixes "freshly added SDR leaves the
  //      whole radio panel locked / no way to type a frequency").
  // With two or more enabled radios and nothing remembered we can't guess which
  // one the user wants, so fall back to the "select radio" placeholder.
  const enabledRadios = radios.filter(r => r.enabled)
  const autoRadio = savedRadio ?? (enabledRadios.length === 1 ? enabledRadios[0] : undefined)
  if (autoRadio) {
    selectedRadioId.value = autoRadio.id
    deviceDropdownLabel.value = autoRadio.name
    sessionStorage.setItem('sdrLastRadioId', String(autoRadio.id))
    controlsDisabled.value = false
    void openControlSocket(autoRadio.id)
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

function onScanPrimaryClick() {
  if (scanActive.value && scanLocked.value) {
    toggleScanLock()
  } else {
    toggleScan()
  }
}

function toggleScanAll() {
  scanAllSelected.value = true
  scanSelectedGroupIds.value = []
  refreshScanQueue()
}

function toggleScanGroup(id: number) {
  if (scanAllSelected.value) {
    scanAllSelected.value = false
    scanSelectedGroupIds.value = [id]
    refreshScanQueue()
    return
  }
  const idx = scanSelectedGroupIds.value.indexOf(id)
  if (idx >= 0) scanSelectedGroupIds.value.splice(idx, 1)
  else scanSelectedGroupIds.value.push(id)
  if (scanSelectedGroupIds.value.length === 0) scanAllSelected.value = true
  refreshScanQueue()
}

function refreshScanQueue() {
  if (!scanActive.value) return
  const next = buildScanQueue()
  if (next.length === 0) { stopScan(); return }
  _scanQueue = next
  _scanIdx = 0
  if (!scanLocked.value) {
    if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null }
    doScanStep()
  }
}

function buildScanQueue(): SdrStoredFrequency[] {
  const scannable = freqs.value.filter(f => f.scannable)
  if (scanAllSelected.value || scanSelectedGroupIds.value.length === 0) return scannable
  const selected = new Set(scanSelectedGroupIds.value)
  return scannable.filter(f => {
    const ids = new Set<number>((f.group_ids || []).filter(id => id !== 0))
    if (f.group_id != null && f.group_id !== 0) ids.add(f.group_id)
    for (const id of ids) if (selected.has(id)) return true
    return false
  })
}

function startScan() {
  if (scanLocked.value) return
  _scanQueue = buildScanQueue()
  if (_scanQueue.length === 0) return
  // Mutual exclusion with the range search — both drive `tune`.
  if (searchActive.value) stopSearch()
  scanActive.value = true
  _scanIdx = 0
  doScanStep()
}

function stopScan() {
  scanActive.value = false
  scanLocked.value = false
  scanCurrentHz.value = null
  if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null }
  stopResumeWatcher()
}

const SCAN_DWELL_MS = 250
const SCAN_MAX_RECHECKS = 12

function doScanStep() {
  if (!scanActive.value || scanLocked.value || _scanQueue.length === 0) return
  const f = _scanQueue[_scanIdx % _scanQueue.length]
  tuneToFreq(f)
  scanCurrentHz.value = f.frequency_hz
  _scanIdx++

  // Reuse the search engine's post-tune race guard so we don't sample
  // pre-retune IQ.
  _lastSpectrum = null
  _expectedCenterHz = f.frequency_hz
  _postTuneFrameCount = 0
  _tuneAtMs = performance.now()

  const thresholdDb = squelch.value

  let rechecks = 0
  const evaluate = () => {
    _scanTimer = null
    if (!scanActive.value || scanLocked.value) return
    const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
    const frameOk = _postTuneFrameCount >= 2
        && _lastSpectrum != null
        && _lastSpectrum.center_hz === f.frequency_hz
    if (!(settled && frameOk)) {
      if (rechecks < SCAN_MAX_RECHECKS) {
        rechecks++
        _scanTimer = setTimeout(evaluate, SEARCH_RECHECK_MS)
        return
      }
      // Couldn't get a clean frame — advance.
      doScanStep()
      return
    }
    const db = sampleChannelDb()
    if (db >= thresholdDb) {
      scanLocked.value = true
      startResumeWatcher(thresholdDb, () => {
        if (!scanActive.value || !scanLocked.value) return
        toggleScanLock()
      })
      return
    }
    doScanStep()
  }
  _scanTimer = setTimeout(evaluate, SCAN_DWELL_MS)
}

function toggleScanLock() {
  scanLocked.value = !scanLocked.value
  stopResumeWatcher()
  if (!scanLocked.value && scanActive.value) {
    if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null }
    doScanStep()
  }
}

// Lightweight retune used by the scan engine: the stream is already running,
// so this only moves the receiver — it must NOT (re)init audio or toggle the
// playing state on every scan step.
function tuneToFreq(f: SdrStoredFrequency) {
  currentFreqHz.value = f.frequency_hz
  currentMode.value   = f.mode
  freqInputVal.value  = (f.frequency_hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (f.frequency_hz / 1e6).toFixed(3) + ' MHz'
  sendCmd({ cmd: 'tune', frequency_hz: f.frequency_hz })
  sendCmd({ cmd: 'mode', mode: f.mode })
}

// Play button on a saved frequency row: tune AND start the audio stream.
function playFreq(f: SdrStoredFrequency) {
  if (!selectedRadioId.value) return
  if (scanActive.value) stopScan()
  if (searchActive.value) stopSearch()
  currentFreqHz.value = f.frequency_hz
  currentMode.value   = f.mode
  freqInputVal.value  = (f.frequency_hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (f.frequency_hz / 1e6).toFixed(3) + ' MHz'
  sdrAudio.initAudio(selectedRadioId.value)
  sdrAudio.setMode(f.mode as SdrMode)
  const bw = defaultBwHz(f.mode)
  sdrAudio.setBandwidthHz(bw)
  bwHz.value = bw
  setPlayingState(true)
  sessionStorage.setItem('sdrLastFreqHz', String(f.frequency_hz))
  sessionStorage.setItem('sdrLastMode', f.mode)
  saveSettings()
  sendCmd({ cmd: 'tune', frequency_hz: f.frequency_hz })
  sendCmd({ cmd: 'mode', mode: f.mode })
}

// ── Search engine (low/high range sweep with stop-on-signal) ─────────────────

function adhocRange(): SdrSearchRange | null {
  if (!adhocSearchValid.value) return null
  const lo = parseFloat(adhocLowMhz.value)
  const hi = parseFloat(adhocHighMhz.value)
  const st = parseFloat(adhocStepKhz.value)
  return {
    id: -1,
    label: 'Ad-hoc',
    low_hz: Math.round(lo * 1e6),
    high_hz: Math.round(hi * 1e6),
    step_hz: Math.round(st * 1000),
    mode: currentMode.value || 'NFM',
    threshold_dbfs: -30,
    dwell_ms: 250,
    band_name: '',
    enabled: true,
    notes: '',
    sort_order: 0,
  }
}

function savedRange(id: number | null): SdrSearchRange | null {
  if (id == null) return null
  return searchRanges.value.find(r => r.id === id) ?? null
}

// Returns the range currently being searched (or that would be searched if the
// main SEARCH button were pressed now). When a search is active, the source is
// pinned by searchActiveSource so the per-item buttons stay accurate even if
// ad-hoc inputs change mid-sweep.
function currentSearchRange(): SdrSearchRange | null {
  if (searchActive.value) {
    if (searchActiveSource.value === 'adhoc') return adhocRange()
    if (searchActiveSource.value === 'saved') return savedRange(searchSelectedRangeId.value)
  }
  return adhocRange() ?? savedRange(searchSelectedRangeId.value)
}

const isAdhocSearching = computed(() =>
  searchActive.value && searchActiveSource.value === 'adhoc'
)
function isSavedRangeSearching(id: number): boolean {
  return searchActive.value
    && searchActiveSource.value === 'saved'
    && searchSelectedRangeId.value === id
}

function sampleChannelDb(): number {
  const s = _lastSpectrum
  if (!s || !s.bins || s.bins.length === 0) return -120
  // Peak dB across the demod channel around the tuner, skipping only the
  // single centre DC spike. Mean across a narrow ±3..±5 window underreports
  // narrow signals — the audio worklet (which sees the full demod channel)
  // opened squelch but this sampler missed the peak. Sizing the window to
  // the demod bandwidth (with a sensible floor) and taking the max matches
  // what the user hears.
  const n = s.bins.length
  const mid = Math.floor(n / 2)
  const binHz = (s.sample_rate || 2_048_000) / n
  // Half-width: at least 4 bins, otherwise the demod bandwidth in bins.
  const halfBins = Math.max(4, Math.ceil((bwHz.value / 2) / binHz))
  const lo = Math.max(0, mid - halfBins)
  const hi = Math.min(n - 1, mid + halfBins)
  let peak = -Infinity
  for (let i = lo; i <= hi; i++) {
    if (i === mid) continue // skip LO/DC spike
    const v = s.bins[i]
    if (typeof v === 'number' && isFinite(v) && v > peak) peak = v
  }
  return peak === -Infinity ? -120 : peak
}

function tuneToHzMode(hz: number, mode: string) {
  currentFreqHz.value = hz
  currentMode.value   = mode
  freqInputVal.value  = (hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
  sendCmd({ cmd: 'tune', frequency_hz: hz })
  sendCmd({ cmd: 'mode', mode })
}

// Map a satellite's downlink mode string (e.g. "FM", "USB", "FSK9k6") to a
// demodulator the SDR supports. Satellite FM voice is narrowband, so "FM" maps
// to NFM (not broadcast WFM); anything unrecognised falls back to NFM.
function _coerceSdrMode(mode: string | undefined): SdrMode {
  const m = (mode || '').toUpperCase()
  if (m === 'WFM') return 'WFM'
  if (m === 'NFM' || m === 'FM') return 'NFM'
  if (m === 'AM') return 'AM'
  if (m === 'USB') return 'USB'
  if (m === 'LSB') return 'LSB'
  if (m === 'CW') return 'CW'
  return 'NFM'
}

// True while an auto-tune is actively holding the radio: we have a snapshot AND
// the radio is still parked on exactly what we tuned it to. If the user (or a
// scan/search) has since moved off that freq, the lock is no longer held and a
// fresh pass may take over. Shared by onExternalTune (lock-in priority) and
// onExternalTuneRestore (only restore if still on the tuned freq).
function _isAutoTuneLockHeld(): boolean {
  const snap = _autoTunePrevState
  if (!snap) return false
  if (scanActive.value || searchActive.value) return false
  return playing.value
    && Math.round(currentFreqHz.value) === snap.tunedHz
    && (currentMode.value as SdrMode) === snap.tunedMode
}

// External tune request (currently from satellite auto-tune at AOS). Tunes the
// SDR to the given freq+mode, starting the default radio hands-free if nothing
// is playing. Because the control socket opens asynchronously, the actual tune
// is queued in _pendingExternalTune and applied once the socket is open (see
// openControlSocket's 'open' handler).
function onExternalTune(e: Event): void {
  const detail = (e as CustomEvent<{ hz: number; mode?: string; satName?: string; noradId?: string; token?: string }>).detail
  if (!detail || !detail.hz) return
  const hz = Math.round(detail.hz)
  const mode = _coerceSdrMode(detail.mode)
  const satName = detail.satName || 'SATELLITE'
  const noradId = detail.noradId
  const token = detail.token

  // Lock-in priority: if an earlier overlapping pass already holds the radio,
  // skip this later one rather than grabbing the tuner mid-copy. Leave the
  // snapshot/radio untouched so the holder's LOS restore still matches its
  // token. A scan/search or a manual retune releases the lock (see
  // _isAutoTuneLockHeld), letting the next pass take over normally.
  if (_isAutoTuneLockHeld() && _autoTunePrevState!.token !== token) {
    _notificationsStore().add({
      type: 'autotune', title: `${satName} PASS SKIPPED`,
      detail: 'Radio busy with an earlier pass — not retuned',
      noradId,
    })
    return
  }

  // Snapshot the pre-AOS state so the LOS restore can put it back. Captured
  // before any mutation below. A scan/search counts as "not the prior idle
  // freq", so we record whether it was running and just stop on restore.
  _autoTunePrevState = {
    token,
    playing: playing.value,
    freqHz: currentFreqHz.value,
    mode: currentMode.value as SdrMode,
    tunedHz: hz,
    tunedMode: mode,
  }

  if (selectedRadioId.value && playing.value) {
    // Already running — just retune (+ keep the audio demod in sync).
    currentFreqHz.value = hz
    currentMode.value   = mode
    freqInputVal.value  = (hz / 1e6).toFixed(4)
    activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
    sdrAudio.setMode(mode)
    const bw = defaultBwHz(mode)
    sdrAudio.setBandwidthHz(bw); bwHz.value = bw
    sessionStorage.setItem('sdrLastFreqHz', String(hz))
    sessionStorage.setItem('sdrLastMode', mode)
    sendCmd({ cmd: 'tune', frequency_hz: hz })
    sendCmd({ cmd: 'mode', mode })
    _notifyAutoTuned(satName, hz, mode, noradId)
    return
  }

  // Not playing: pick a radio. Prefer the currently-selected one, else the
  // last-used (sdrLastRadioId), else the first enabled known radio.
  let radio: SdrRadio | null = null
  if (selectedRadioId.value) {
    radio = knownRadios.value.find(r => r.id === selectedRadioId.value) ?? null
  }
  if (!radio) {
    const lastId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '', 10)
    if (!isNaN(lastId)) radio = knownRadios.value.find(r => r.id === lastId && r.enabled) ?? null
  }
  if (!radio) radio = knownRadios.value.find(r => r.enabled) ?? null
  if (!radio) {
    _notifyAutoTuneFailed(satName)
    return
  }

  // Queue the tune to fire once the control socket is open.
  _pendingExternalTune = { hz, mode, satName, noradId, token }
  const sameRadio = selectedRadioId.value === radio.id
  const sockOpen = !!_ctrlSocket && _ctrlSocket.readyState === WebSocket.OPEN
  const sockConnecting = !!_ctrlSocket && _ctrlSocket.readyState === WebSocket.CONNECTING
  if (sameRadio && sockOpen) {
    _applyPendingExternalTune()
  } else if (sameRadio && sockConnecting) {
    // Socket already opening for this radio — its 'open' handler will drain the
    // pending tune. Re-selecting would early-return and never fire 'open'.
  } else {
    selectRadio(radio)
  }
}

function _applyPendingExternalTune(): void {
  const p = _pendingExternalTune
  if (!p) return
  _pendingExternalTune = null
  if (!selectedRadioId.value) return
  currentFreqHz.value = p.hz
  currentMode.value   = p.mode
  freqInputVal.value  = (p.hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (p.hz / 1e6).toFixed(3) + ' MHz'
  sdrAudio.initAudio(selectedRadioId.value)
  sdrAudio.setMode(p.mode)
  const bw = defaultBwHz(p.mode)
  sdrAudio.setBandwidthHz(bw); bwHz.value = bw
  setPlayingState(true)
  sessionStorage.setItem('sdrLastFreqHz', String(p.hz))
  sessionStorage.setItem('sdrLastMode', p.mode)
  saveSettings()
  sendCmd({ cmd: 'tune', frequency_hz: p.hz })
  sendCmd({ cmd: 'mode', mode: p.mode })
  _notifyAutoTuned(p.satName, p.hz, p.mode, p.noradId)
}

function _notifyAutoTuned(satName: string, hz: number, mode: string, noradId?: string): void {
  _notificationsStore().add({
    type: 'autotune', title: `${satName} AUTO-TUNED`,
    detail: `Downlink ${(hz / 1e6).toFixed(3)} MHz ${mode} @ AOS`,
    noradId,
  })
}

function _notifyAutoTuneFailed(satName: string): void {
  _notificationsStore().add({
    type: 'system', title: `${satName} AUTO-TUNE`,
    detail: 'No SDR radio configured — open the RADIO panel to add one',
  })
}

// LOS restore: undo an auto-tune once the pass ends, returning the radio to the
// state captured at AOS. We only act if the radio is still parked on the
// frequency/mode we auto-tuned to — if the user (or a newer pass) has retuned
// since, the snapshot is stale and we leave things alone.
function onExternalTuneRestore(e: Event): void {
  const detail = (e as CustomEvent<{ satName?: string; noradId?: string; token?: string }>).detail
  const snap = _autoTunePrevState
  if (!snap) return
  // Token mismatch means a later AOS overwrote the snapshot; that newer pass
  // owns the restore now, so ignore this stale LOS.
  if (detail?.token && snap.token && detail.token !== snap.token) return
  _autoTunePrevState = null

  const satName = detail?.satName || 'SATELLITE'
  const noradId = detail?.noradId

  // Bail if the user has taken manual control (retuned, scanned, searched, or
  // stopped) since the auto-tune — respect their state over the restore. Note
  // _isAutoTuneLockHeld reads _autoTunePrevState, which we cleared above, so
  // re-check against the captured snapshot directly here.
  if (scanActive.value || searchActive.value) return
  const onTunedFreq = playing.value
    && Math.round(currentFreqHz.value) === snap.tunedHz
    && (currentMode.value as SdrMode) === snap.tunedMode
  if (!onTunedFreq) return

  if (!snap.playing) {
    // Radio was stopped/connected-but-idle before AOS — stop playback again.
    stop()
    _notifyAutoRestored(satName, null, null, noradId)
    return
  }

  // Was playing on another frequency before AOS — retune back to it.
  if (!selectedRadioId.value) return
  currentFreqHz.value = snap.freqHz
  currentMode.value   = snap.mode
  freqInputVal.value  = (snap.freqHz / 1e6).toFixed(4)
  activeFreqDisplay.value = (snap.freqHz / 1e6).toFixed(3) + ' MHz'
  sdrAudio.setMode(snap.mode)
  const bw = defaultBwHz(snap.mode)
  sdrAudio.setBandwidthHz(bw); bwHz.value = bw
  sessionStorage.setItem('sdrLastFreqHz', String(snap.freqHz))
  sessionStorage.setItem('sdrLastMode', snap.mode)
  sendCmd({ cmd: 'tune', frequency_hz: snap.freqHz })
  sendCmd({ cmd: 'mode', mode: snap.mode })
  _notifyAutoRestored(satName, snap.freqHz, snap.mode, noradId)
}

function _notifyAutoRestored(satName: string, hz: number | null, mode: string | null, noradId?: string): void {
  _notificationsStore().add({
    type: 'autotune', title: `${satName} PASS ENDED`,
    detail: hz != null && mode != null
      ? `Restored SDR → ${(hz / 1e6).toFixed(3)} MHz ${mode}`
      : 'Stopped SDR (was idle before pass)',
    noradId,
  })
}

function startSearch(source?: 'adhoc' | 'saved') {
  // Resolve which source to run if not explicitly chosen: ad-hoc takes
  // priority when its inputs are valid, otherwise the selected saved range.
  const resolved: 'adhoc' | 'saved' | null = source
    ?? (adhocSearchValid.value ? 'adhoc' : (searchSelectedRangeId.value != null ? 'saved' : null))
  if (!resolved) return
  const r = resolved === 'adhoc' ? adhocRange() : savedRange(searchSelectedRangeId.value)
  if (!r) return
  if (r.low_hz >= r.high_hz || r.step_hz <= 0) return
  // Mutual exclusion with scanner — both drive `tune`.
  if (scanActive.value) stopScan()
  if (selectedRadioId.value) {
    sdrAudio.initAudio(selectedRadioId.value)
    sdrAudio.setMode(r.mode as SdrMode)
    const bw = defaultBwHz(r.mode)
    sdrAudio.setBandwidthHz(bw)
    bwHz.value = bw
    setPlayingState(true)
  }
  searchActive.value = true
  searchActiveSource.value = resolved
  searchLocked.value = false
  const _ss = _sdrStore()
  _ss.searchSweeping = true
  _ss.searchLowHz = r.low_hz
  _ss.searchHighHz = r.high_hz
  _ss.searchCurrentHz = r.low_hz
  _searchHz = r.low_hz
  // Invalidate any stale spectrum frame so the first step waits for fresh data.
  _lastSpectrum = null
  doSearchStep()
}

function stopSearch() {
  searchActive.value = false
  searchActiveSource.value = null
  searchLocked.value = false
  const _ss = _sdrStore()
  _ss.searchSweeping = false
  _ss.searchLowHz = null
  _ss.searchHighHz = null
  _ss.searchCurrentHz = null
  searchCurrentHz.value = null
  _expectedCenterHz = null
  _postTuneFrameCount = 0
  if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null }
  stopResumeWatcher()
}

function toggleSearch() { if (searchActive.value) stopSearch(); else startSearch() }

function onSearchPrimaryClick() {
  if (searchActive.value && searchLocked.value) toggleSearchLock()
  else toggleSearch()
}

function onAdhocPlayClick() {
  if (isAdhocSearching.value) { stopSearch(); return }
  if (searchActive.value) stopSearch()
  startSearch('adhoc')
}

function onSavedRangePlayClick(id: number) {
  if (isSavedRangeSearching(id)) { stopSearch(); return }
  if (searchActive.value) stopSearch()
  searchSelectedRangeId.value = id
  startSearch('saved')
}

function toggleSearchLock() {
  if (!searchActive.value) return
  searchLocked.value = !searchLocked.value
  _sdrStore().searchSweeping = searchActive.value && !searchLocked.value
  stopResumeWatcher()
  if (!searchLocked.value) {
    if (_searchTimer) { clearTimeout(_searchTimer); _searchTimer = null }
    // Advance past the current freq so we don't immediately re-hold on the same signal.
    const r = currentSearchRange()
    if (r) {
      _searchHz += r.step_hz
      if (_searchHz > r.high_hz) _searchHz = r.low_hz
    }
    doSearchStep()
  }
}

// Shared auto-resume watcher used by both search and scan. When a freq is
// locked on a signal, poll sampleChannelDb() and only call onResume() once the
// channel has been below `thresholdDb` continuously for `delaySec` seconds.
// delaySec == 0 → resume on the next poll where the signal is gone.
const RESUME_POLL_MS = 200
let _resumeTimer: ReturnType<typeof setTimeout> | null = null
let _quietSinceMs: number | null = null

function stopResumeWatcher() {
  if (_resumeTimer) { clearTimeout(_resumeTimer); _resumeTimer = null }
  _quietSinceMs = null
}

function startResumeWatcher(thresholdDb: number, onResume: () => void) {
  stopResumeWatcher()
  const delayMs = Math.max(0, resumeDelaySec.value) * 1000
  const tick = () => {
    _resumeTimer = null
    const db = sampleChannelDb()
    const active = db >= thresholdDb
    if (active) {
      _quietSinceMs = null
    } else {
      if (_quietSinceMs == null) _quietSinceMs = performance.now()
      if (performance.now() - _quietSinceMs >= delayMs) {
        _quietSinceMs = null
        onResume()
        return
      }
    }
    _resumeTimer = setTimeout(tick, RESUME_POLL_MS)
  }
  _resumeTimer = setTimeout(tick, RESUME_POLL_MS)
}

function doSearchStep() {
  if (!searchActive.value || searchLocked.value) return
  const r = currentSearchRange()
  if (!r) { stopSearch(); return }
  const stepHz = _searchHz
  tuneToHzMode(stepHz, r.mode)
  searchCurrentHz.value = stepHz
  _sdrStore().searchCurrentHz = stepHz
  // Reset the post-tune race guard. Frames bearing the new expected center_hz
  // are counted by the WS handler; we discard the first one because the backend
  // labels frames with conn.center_hz at FFT time, not at IQ-read time — so the
  // first label-matching frame can still contain pre-retune IQ.
  _lastSpectrum = null
  _expectedCenterHz = stepHz
  _postTuneFrameCount = 0
  _tuneAtMs = performance.now()
  const dwellMs = Math.max(50, r.dwell_ms)

  let rechecks = 0
  const evaluate = () => {
    if (!searchActive.value || searchLocked.value) return
    const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
    const frameOk = _postTuneFrameCount >= 2
        && _lastSpectrum != null
        && _lastSpectrum.center_hz === stepHz
    if (!(settled && frameOk)) {
      if (rechecks < SEARCH_MAX_RECHECKS) {
        rechecks++
        _searchTimer = setTimeout(evaluate, SEARCH_RECHECK_MS)
        return
      }
      // Give up waiting for a clean frame and advance without sampling.
      _searchHz += r.step_hz
      if (_searchHz > r.high_hz) _searchHz = r.low_hz
      doSearchStep()
      return
    }
    // Use the SQUELCH slider as the activity threshold so "audible" lines up
    // with "lock here" — same gate the audio path uses. Range threshold_dbfs
    // is intentionally ignored.
    const db = sampleChannelDb()
    if (db >= squelch.value) {
      // Lock on signal. A watcher will auto-advance once the signal
      // drops and the user-configured RESUME DELAY has elapsed; until then
      // the user can also press HOLD/RESUME to force-continue.
      searchLocked.value = true
      _sdrStore().searchSweeping = false
      startResumeWatcher(squelch.value, () => {
        if (!searchActive.value || !searchLocked.value) return
        toggleSearchLock()
      })
      return
    }
    _searchHz += r.step_hz
    if (_searchHz > r.high_hz) _searchHz = r.low_hz
    doSearchStep()
  }
  _searchTimer = setTimeout(evaluate, dwellMs)
}

async function reloadSearchRanges() {
  try { searchRanges.value = await apiListSearchRanges() } catch { searchRanges.value = [] }
  // If the selected range was deleted elsewhere, clear the selection.
  if (searchSelectedRangeId.value != null
      && !searchRanges.value.find(r => r.id === searchSelectedRangeId.value)) {
    if (searchActive.value) stopSearch()
    searchSelectedRangeId.value = searchRanges.value[0]?.id ?? null
  } else if (searchSelectedRangeId.value == null && searchRanges.value.length > 0) {
    searchSelectedRangeId.value = searchRanges.value[0].id
  }
}

function selectSearchRange(id: number) {
  if (searchActive.value) stopSearch()
  searchSelectedRangeId.value = id
  adhocLowMhz.value = ''
  adhocHighMhz.value = ''
}

// ── Search range editor (Frequency Manager tab) ──────────────────────────────

const SEARCH_MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW']

// Common channel step sizes (kHz) used by scanners / SDR apps. Covers HF fine
// tuning (0.1–2.5), HF/CB (5), digital voice (6.25), 8.33 air band (EU),
// 9 kHz MW (EU/AS), 10 kHz MW (US), 12.5 NFM PMR/marine, 25 NFM, and FM
// broadcast (100/200).
const STEP_OPTIONS_KHZ = [
  0.1, 0.25, 0.5, 1, 2.5, 5, 6.25, 7.5, 8.33, 9, 10,
  12.5, 15, 20, 25, 30, 50, 100, 200,
] as const

function formatStepKhz(v: number): string {
  return `${v} kHz`
}

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

const rangeEditorOpen = ref(false)
const editingRangeId  = ref<number | null>(null)
const rangeEditor = ref<RangeEditorState>(blankRangeEditor())
const rangeEditorError = ref<string>('')

// Step dropdown (custom — matches sample-rate dropdown). Only one range form
// renders at a time (edit vs add), so a single ref/state is sufficient.
const stepDropdownRef = ref<HTMLElement | null>(null)
const stepMenuRef     = ref<HTMLElement | null>(null)
// Function ref: the edit form and add form both render a step dropdown (only
// one at a time), so a plain template ref would be set/unset by both. Capture
// only the live element here.
function setStepDropdownRef(el: Element | null | { $el?: Element }) {
  if (el && (el as HTMLElement).getBoundingClientRect) {
    stepDropdownRef.value = el as HTMLElement
  } else if (el == null) {
    // ignore unmounts from the *other* form — only clear if it was ours
  }
}
const adhocStepDropdownRef = ref<HTMLElement | null>(null)
function setAdhocStepDropdownRef(el: Element | null | { $el?: Element }) {
  if (el && (el as HTMLElement).getBoundingClientRect) {
    adhocStepDropdownRef.value = el as HTMLElement
  } else if (el == null) {
    adhocStepDropdownRef.value = null
  }
}
const stepMenuOpen    = ref(false)
const stepMenuStyle   = ref<Record<string, string>>({})
const stepMenuTarget  = ref<'range' | 'adhoc'>('range')

function positionStepMenu() {
  const el = stepMenuTarget.value === 'adhoc' ? adhocStepDropdownRef.value : stepDropdownRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  stepMenuStyle.value = { left: rect.left + 'px', top: rect.bottom + 'px', width: rect.width + 'px' }
}

function toggleStepMenu(target: 'range' | 'adhoc' = 'range') {
  if (stepMenuOpen.value && stepMenuTarget.value === target) { closeStepMenu(); return }
  stepMenuTarget.value = target
  positionStepMenu()
  stepMenuOpen.value = true
}

function closeStepMenu() { stepMenuOpen.value = false }

function onStepDropdownKey(e: KeyboardEvent, target: 'range' | 'adhoc' = 'range') {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStepMenu(target) }
  if (e.key === 'Escape') closeStepMenu()
}

function pickStep(v: number) {
  const target = stepMenuTarget.value
  closeStepMenu()
  if (target === 'adhoc') {
    adhocStepKhz.value = v.toString()
  } else {
    rangeEditor.value.step_khz = v.toString()
  }
}

const stepMenuLabel = computed(() => {
  const raw = stepMenuTarget.value === 'adhoc' ? adhocStepKhz.value : rangeEditor.value.step_khz
  const v = parseFloat(raw)
  if (!isFinite(v) || v <= 0) return '— select step —'
  return formatStepKhz(v)
})

const adhocStepLabel = computed(() => {
  const v = parseFloat(adhocStepKhz.value)
  if (!isFinite(v) || v <= 0) return 'Select…'
  return formatStepKhz(v)
})

function blankRangeEditor(): RangeEditorState {
  return {
    id: null, label: '', low_mhz: '', high_mhz: '',
    step_khz: '12.5', mode: 'NFM', threshold_dbfs: '-70',
    dwell_ms: '200', notes: '',
  }
}

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
  const lowHz  = Math.round(parseFloat(e.low_mhz)  * 1e6)
  const highHz = Math.round(parseFloat(e.high_mhz) * 1e6)
  const stepHz = Math.round(parseFloat(e.step_khz) * 1000)
  const thr    = parseFloat(e.threshold_dbfs)
  const dwell  = parseInt(e.dwell_ms, 10)
  if (!e.label.trim()) { rangeEditorError.value = 'Label required'; return }
  if (!isFinite(lowHz) || !isFinite(highHz) || lowHz <= 0 || highHz <= 0) {
    rangeEditorError.value = 'Low and high MHz required'
    return
  }
  if (lowHz >= highHz) { rangeEditorError.value = 'Low must be less than high'; return }
  if (!isFinite(stepHz) || stepHz <= 0) { rangeEditorError.value = 'Step must be positive'; return }
  if (!isFinite(thr)) { rangeEditorError.value = 'Threshold must be a number'; return }
  if (!isFinite(dwell) || dwell <= 0) { rangeEditorError.value = 'Dwell must be positive'; return }

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
    sort_order: editingRangeId.value == null
      ? (searchRanges.value.length)
      : (searchRanges.value.find(r => r.id === editingRangeId.value)?.sort_order ?? 0),
  }
  const ok = editingRangeId.value == null
    ? !!(await apiCreateSearchRange(body))
    : !!(await apiUpdateSearchRange(editingRangeId.value, body))
  if (!ok) { rangeEditorError.value = 'Save failed'; return }
  rangeEditorOpen.value = false
  editingRangeId.value = null
  await reloadSearchRanges()
}

async function deleteRange(id: number) {
  if (searchActive.value && searchSelectedRangeId.value === id) stopSearch()
  await apiDeleteSearchRange(id)
  if (editingRangeId.value === id) cancelRangeEditor()
  await reloadSearchRanges()
}

// ── Data reload ───────────────────────────────────────────────────────────────

async function reloadData() {
  try {
    const [gRes, fRes] = await Promise.all([fetch('/api/sdr/groups'), fetch('/api/sdr/frequencies')])
    groups.value = await gRes.json()
    freqs.value  = await fRes.json()
    void reloadSearchRanges()
    // Mirror into the SDR store so SdrWaterfall can render label markers on the
    // FFT. SdrPanel owns the fetch; the store keeps the slimmer shape consumed
    // by other components.
    _sdrStore().frequencies = freqs.value.map(f => ({
      id: f.id, group_id: f.group_id ?? null, label: f.label,
      frequency_hz: f.frequency_hz, mode: f.mode,
    }))
    _scanQueue = buildScanQueue()
  } catch (_) {}
  await clipsSectionRef.value?.reload()
}

// Refresh the list when frequencies are imported from the settings panel
useDocumentEvent('sdr:frequenciesImported', () => { reloadData() })

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
  efNotes.value = ''
  efErrors.value = {}
  efOpen.value = true
  switchSdrTab('frequency-manager')
}

function openEditFreqPanel(f: SdrStoredFrequency) {
  editingFreqId.value = f.id
  efLabel.value = f.label
  efFreq.value  = (f.frequency_hz / 1e6).toFixed(4)
  efMode.value  = f.mode
  efGroupIds.value = (f.group_ids || []).filter(id => id !== 0)
  efNotes.value = f.notes ?? ''
  efErrors.value = {}
  efOpen.value = true
  switchSdrTab('frequency-manager')
}

function toggleEditFreqPanel(f: SdrStoredFrequency) {
  if (efOpen.value && editingFreqId.value === f.id) {
    cancelEditFreq()
  } else {
    openEditFreqPanel(f)
  }
}

function cancelEditFreq() { editingFreqId.value = null; efOpen.value = false; efErrors.value = {} }

function validateFreqForm(): boolean {
  const errs: { label?: string; freq?: string; mode?: string; notes?: string } = {}
  const label = efLabel.value.trim()
  if (!label) errs.label = 'Label is required'
  else if (label.length > 60) errs.label = 'Label must be 60 characters or fewer'
  const hz = parseFreqMhz(efFreq.value)
  if (!hz) errs.freq = 'Enter a valid frequency in MHz'
  if (!efMode.value || !(MODES as readonly string[]).includes(efMode.value)) errs.mode = 'Select a mode'
  if (efNotes.value && !NOTES_ALLOWED.test(efNotes.value)) errs.notes = 'Notes contain disallowed characters'
  efErrors.value = errs
  return Object.keys(errs).length === 0
}

function toggleEfGroup(id: number) {
  const idx = efGroupIds.value.indexOf(id)
  if (idx === -1) efGroupIds.value = [...efGroupIds.value, id]
  else efGroupIds.value = efGroupIds.value.filter(i => i !== id)
}

async function saveFreq() {
  if (!validateFreqForm()) return
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
          notes: efNotes.value,
        }),
      })
    } else {
      await fetch('/api/sdr/frequencies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, frequency_hz: hz, mode: efMode.value, squelch: squelch.value, gain: gainDb.value, scannable: true, group_ids: efGroupIds.value, notes: efNotes.value }),
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
}

function onSquelchChangeCallback(open: boolean) {
  // The audio worklet's squelch is the source of truth for "is this channel
  // audible". The scan/search dwell check samples the spectrum waterfall
  // (sampleChannelDb), which can underreport narrow signals the worklet's
  // squelch did open on — so a signal could be playing while the scan kept
  // stepping. Lock the moment the worklet opens squelch on an active, unlocked
  // sweep, but only once the post-tune settle has elapsed so we don't lock on
  // residual audio from the previous frequency.
  if (open) {
    const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
    if (settled) {
      if (scanActive.value && !scanLocked.value) {
        scanLocked.value = true
        startResumeWatcher(squelch.value, () => {
          if (!scanActive.value || !scanLocked.value) return
          toggleScanLock()
        })
      } else if (searchActive.value && !searchLocked.value) {
        searchLocked.value = true
        _sdrStore().searchSweeping = false
        startResumeWatcher(squelch.value, () => {
          if (!searchActive.value || !searchLocked.value) return
          toggleSearchLock()
        })
      }
    }
  }

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

  // Hydrate the resume delay from the DB so the scan/search watcher uses the
  // user's persisted value even if the Settings SDR panel hasn't been opened
  // yet in this session.
  void _sdrStore().hydrateResumeDelaySecFromDb()

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
useDocumentEvent('sentinel:sdr-tune-external', onExternalTune)
useDocumentEvent('sentinel:sdr-tune-restore', onExternalTuneRestore)
</script>

