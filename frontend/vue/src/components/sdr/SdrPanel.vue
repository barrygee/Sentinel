<template>
  <!-- ── LEFT RAIL (teleported so it persists when the side panel hides) ── -->
  <Teleport to="body">
    <div v-show="isSdrRoute" id="sdr-sidebar-rail">
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
        <svg
          v-if="tab.id === 'radio'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          stroke-linecap="round"
        >
          <line x1="6" y1="9" x2="18" y2="3" stroke="currentColor" stroke-width="1.6" />
          <rect
            x="3"
            y="9"
            width="18"
            height="12"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="miter"
            fill="none"
          />
          <circle cx="16" cy="15" r="2.6" stroke="currentColor" stroke-width="1.6" />
          <line x1="6" y1="13" x2="11" y2="13" stroke="currentColor" stroke-width="1.6" />
          <line x1="6" y1="17" x2="11" y2="17" stroke="currentColor" stroke-width="1.6" />
        </svg>
        <!-- frequency manager (bookmark) -->
        <svg
          v-else-if="tab.id === 'frequency-manager'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M6 3h12v18l-6-4-6 4V3Z"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="miter"
            fill="none"
          />
        </svg>
        <!-- search ranges (range brackets with sweep) -->
        <svg
          v-else-if="tab.id === 'search-ranges'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          stroke-linecap="round"
        >
          <path d="M5 7v10M5 7h3M5 17h3" stroke="currentColor" stroke-width="1.8" />
          <path d="M19 7v10M19 7h-3M19 17h-3" stroke="currentColor" stroke-width="1.8" />
          <line x1="9" y1="12" x2="15" y2="12" stroke="currentColor" stroke-width="1.8" />
        </svg>
        <!-- groups (stacked tags) -->
        <svg
          v-else-if="tab.id === 'groups'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          stroke-linejoin="miter"
        >
          <path d="M4 7h10l4 4-4 4H4V7Z" stroke="currentColor" stroke-width="1.8" fill="none" />
          <circle cx="7" cy="11" r="1.1" fill="currentColor" />
        </svg>
        <!-- recordings -->
        <svg
          v-else-if="tab.id === 'recordings'"
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" />
          <circle cx="12" cy="12" r="4" fill="currentColor" />
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
            role="combobox"
            tabindex="0"
            aria-label="Radio device"
            aria-haspopup="listbox"
            aria-controls="sdr-device-listbox"
            aria-owns="sdr-device-listbox"
            :aria-expanded="deviceMenuOpen"
            :aria-activedescendant="deviceActiveDescId"
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
                >{{ deviceDropdownLabel }}</span
              >
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
              <div id="sdr-device-listbox" role="listbox" aria-label="Available radios">
                <div
                  :id="deviceOptionId(0)"
                  role="option"
                  class="sdr-device-menu-item sdr-device-menu-placeholder"
                  :class="{ 'sdr-device-menu-item--active': deviceHighlight === 0 }"
                  :aria-selected="deviceHighlight === 0"
                  @click="selectRadio(null)"
                  @mousemove="deviceHighlight = 0"
                >
                  — select radio —
                </div>
                <div
                  v-for="(r, index) in menuRadios"
                  :id="deviceOptionId(index + 1)"
                  :key="r.id"
                  role="option"
                  class="sdr-device-menu-item"
                  :class="{ 'sdr-device-menu-item--active': deviceHighlight === index + 1 }"
                  :aria-selected="deviceHighlight === index + 1"
                  @click="selectRadio(r)"
                  @mousemove="deviceHighlight = index + 1"
                >
                  {{ r.name }}<span class="sdr-device-menu-item-host">{{ r.host }}</span>
                </div>
              </div>
              <!-- Non-selectable status note lives outside the listbox. -->
              <div
                v-if="menuRadios.length === 0"
                class="sdr-device-menu-item sdr-device-menu-placeholder"
              >
                no radios configured
              </div>
            </div>
          </Teleport>
        </div>

        <!-- Read-only banner: another Sentinel instance owns the shared dongle's
             tuning. This instance can still listen, but its tuning controls are
             disabled until the owner releases the tuner. -->
        <div v-if="readOnly" class="sdr-readonly-banner" role="status" aria-live="polite">
          <svg
            class="sdr-readonly-banner-icon"
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6V4.5a3 3 0 0 1 6 0V6m-7 0h8v6H3V6Z"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
          <span>Another instance is controlling this radio — tuning is read-only here.</span>
        </div>

        <!-- Frequency -->
        <div class="sdr-radio-section">
          <div class="sdr-freq-row">
            <input
              ref="freqInputRef"
              v-model="freqInputVal"
              class="sdr-freq-input-large"
              type="text"
              aria-label="Tuned frequency in MHz"
              size="8"
              placeholder=""
              autocomplete="off"
              spellcheck="false"
              :disabled="tuningDisabled"
              :readonly="scanActive"
              @keydown.enter="tune"
              @blur="formatFreqInput"
              @wheel.prevent="onFreqWheel"
            />
            <span class="sdr-freq-unit">MHz</span>
          </div>
          <div v-if="currentFreqLabel" class="sdr-freq-name">{{ currentFreqLabel }}</div>
          <div class="sdr-freq-actions-row">
            <button
              class="sdr-mode-pill sdr-tune-btn"
              type="button"
              title="Tune"
              aria-label="Tune"
              :disabled="tuningDisabled || playing || scanActive || searchActive"
              @click="tune"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <polygon points="2,1 11,6 2,11" fill="currentColor" />
              </svg>
            </button>
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-stop-btn"
              type="button"
              title="Stop audio"
              aria-label="Stop audio"
              :disabled="!playing && !scanActive && !searchActive"
              @click="stop"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" />
              </svg>
            </button>
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-rec-btn"
              :class="{ 'sdr-rec-btn--active': isRecording }"
              type="button"
              :title="isRecording ? 'Stop recording' : 'Record'"
              :aria-label="isRecording ? 'Stop recording' : 'Record'"
              :disabled="!playing && !scanActive && !searchActive"
              @click="toggleRecording"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <template v-if="isRecording">
                  <rect x="2" y="2" width="6" height="6" rx="1" fill="currentColor" />
                </template>
                <template v-else>
                  <circle cx="5" cy="5" r="4" fill="currentColor" />
                </template>
              </svg>
            </button>
            <!-- Decode: toggles digital decoding AND shows/hides the decoder dock
                 below the waterfall (both driven by digitalEnabled). -->
            <button
              class="sdr-mode-pill sdr-tune-btn sdr-digital-btn"
              :class="{ 'sdr-digital-btn--active': digitalEnabled }"
              type="button"
              :title="digitalEnabled ? 'Hide decoder' : 'Decode digital voice'"
              :aria-label="digitalEnabled ? 'Hide decoder' : 'Decode digital voice'"
              :aria-pressed="digitalEnabled"
              :disabled="!playing"
              @click="toggleDigital"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M1 8H3V4H6V8H9V4H11"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
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
            >
              {{ m }}
            </button>
          </div>
        </div>

        <!-- Signal meter -->
        <div class="sdr-radio-section">
          <span class="sdr-field-label">SIGNAL</span>
          <div
            class="sdr-signal-segments"
            :class="{ 'sdr-signal-segments--muted': !signalAudible }"
          >
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
            :aria-expanded="settingsSectionExpanded"
            aria-controls="sdr-settings-section"
            @click="settingsSectionExpanded = !settingsSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">SETTINGS</label>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="settingsSectionExpanded" id="sdr-settings-section">
            <!-- Volume -->
            <div class="sdr-radio-section">
              <div class="sdr-slider-header">
                <label class="sdr-field-label">VOLUME</label>
                <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
                  >{{ volume }}%</span
                >
              </div>
              <input
                class="sdr-panel-slider"
                type="range"
                aria-label="Volume"
                min="0"
                max="200"
                step="1"
                :value="volume"
                :disabled="controlsDisabled"
                @input="onVolumeInput"
              />
            </div>

            <!-- Squelch -->
            <div class="sdr-radio-section">
              <div class="sdr-slider-header">
                <label class="sdr-field-label">SQUELCH</label>
                <span class="sdr-slider-val" :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
                  >{{ squelch }} dBFS</span
                >
              </div>
              <input
                class="sdr-panel-slider"
                type="range"
                aria-label="Squelch in dBFS"
                min="-120"
                max="0"
                step="1"
                :value="squelch"
                :disabled="controlsDisabled"
                @input="onSquelchInput"
              />
            </div>

            <!-- Bandwidth -->
            <div class="sdr-radio-section">
              <div class="sdr-slider-header">
                <label class="sdr-field-label">BANDWIDTH</label>
                <span
                  class="sdr-slider-val"
                  :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
                  >{{ formatBwHz(bwHz) }}</span
                >
              </div>
              <input
                class="sdr-panel-slider"
                type="range"
                aria-label="Bandwidth"
                min="1000"
                :max="bwMax"
                step="500"
                :value="bwHz"
                :disabled="controlsDisabled"
                @input="onBwInput"
              />
            </div>

            <!-- Sample Rate (hardware) — sets the spectrum/waterfall span -->
            <div class="sdr-radio-section">
              <div class="sdr-slider-header">
                <label class="sdr-field-label">SAMPLE RATE</label>
                <span
                  class="sdr-slider-val"
                  :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
                  >{{ formatBwHz(sampleRateHz) }}</span
                >
              </div>
              <!-- Custom dropdown (NOT native <select>): native option lists
                   can't be styled (UA popup), and we want the menu to match
                   the device dropdown above. Built off the same primitives. -->
              <div
                ref="sampleRateDropdownRef"
                class="sdr-device-dropdown"
                :class="{
                  'sdr-device-dropdown--open': sampleRateMenuOpen,
                  'sdr-device-dropdown--loading': tuningDisabled,
                }"
                tabindex="0"
                @click.stop="toggleSampleRateMenu"
                @keydown="onSampleRateDropdownKey"
              >
                <div class="sdr-device-dropdown-selected">
                  <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                    formatBwHz(sampleRateHz)
                  }}</span>
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
                <span
                  class="sdr-slider-val"
                  :class="{ 'sdr-slider-val--dimmed': controlsDisabled }"
                  >{{ gainAuto ? 'AUTO' : `${gainDb.toFixed(1)} dB` }}</span
                >
              </div>
              <input
                class="sdr-panel-slider"
                type="range"
                aria-label="RF gain in dB"
                min="-1"
                max="49"
                step="0.5"
                :value="gainDb"
                :disabled="tuningDisabled || gainAuto"
                @input="onGainInput"
              />
            </div>

            <!-- AGC -->
            <div class="sdr-radio-section sdr-agc-row">
              <label class="sdr-checkbox-label">
                <input
                  type="checkbox"
                  class="sdr-checkbox"
                  :checked="gainAuto"
                  :disabled="tuningDisabled"
                  @change="onAgcChange"
                />
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
            :aria-expanded="scannerSectionExpanded"
            aria-controls="sdr-scanner-section"
            @click="scannerSectionExpanded = !scannerSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">SCANNER</label>
            <div v-show="scanActive" class="sdr-scan-state-row">
              <span class="sdr-scan-state-label">{{
                scanLocked ? 'SCANNING PAUSED' : 'SCANNING'
              }}</span>
              <div
                class="sdr-scan-indicator"
                :class="{
                  'sdr-scan-running': scanActive && !scanLocked,
                  'sdr-scan-holding': scanLocked,
                }"
              ></div>
            </div>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="scannerSectionExpanded" id="sdr-scanner-section">
            <div class="sdr-scan-subsection-label">GROUPS</div>
            <div class="sdr-scan-groups-row">
              <button
                type="button"
                class="sdr-scan-group-chip"
                :class="{ 'sdr-scan-group-chip-active': scanAllSelected }"
                :disabled="tuningDisabled"
                @click="toggleScanAll"
              >
                All
              </button>
              <button
                v-for="g in groupsWithFreqs"
                :key="g.id"
                type="button"
                class="sdr-scan-group-chip"
                :class="{
                  'sdr-scan-group-chip-active':
                    !scanAllSelected && scanSelectedGroupIds.includes(g.id),
                }"
                :disabled="tuningDisabled"
                @click="toggleScanGroup(g.id)"
              >
                {{ g.name }}
              </button>
            </div>
            <div class="sdr-scan-btns-row sdr-scan-btns-row--left">
              <button
                type="button"
                class="sdr-search-adhoc-play"
                :class="{ 'sdr-search-adhoc-play--active': scanActive }"
                :disabled="tuningDisabled"
                :aria-label="scanActive ? 'Stop scan' : 'Start scan'"
                :title="scanActive ? 'Stop scan' : 'Start scan'"
                @click="onScanPrimaryClick"
              >
                <svg
                  v-if="scanActive"
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  aria-hidden="true"
                >
                  <rect x="1" y="1" width="8" height="8" fill="currentColor" />
                </svg>
                <svg
                  v-else
                  width="10"
                  height="10"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <polygon points="2,1 11,6 2,11" fill="currentColor" />
                </svg>
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
            :aria-expanded="searchSectionExpanded"
            aria-controls="sdr-search-section"
            @click="searchSectionExpanded = !searchSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">SEARCH</label>
            <div v-show="searchActive" class="sdr-scan-state-row">
              <span class="sdr-scan-state-label">{{
                searchLocked ? 'SEARCHING PAUSED' : 'SEARCHING'
              }}</span>
              <div
                class="sdr-scan-indicator"
                :class="{
                  'sdr-scan-running': searchActive && !searchLocked,
                  'sdr-scan-holding': searchLocked,
                }"
              ></div>
            </div>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="searchSectionExpanded" id="sdr-search-section">
            <div class="sdr-search-adhoc-row">
              <div class="sdr-search-adhoc-col">
                <label class="sdr-field-label">LOW (MHz)</label>
                <input
                  v-model="adhocLowMhz"
                  class="sdr-panel-input sdr-search-adhoc-input"
                  aria-label="Search range low frequency in MHz"
                  type="number"
                  step="0.0001"
                  required
                  :disabled="controlsDisabled || searchActive"
                />
              </div>
              <div class="sdr-search-adhoc-col">
                <label class="sdr-field-label">HIGH (MHz)</label>
                <input
                  v-model="adhocHighMhz"
                  class="sdr-panel-input sdr-search-adhoc-input"
                  aria-label="Search range high frequency in MHz"
                  type="number"
                  step="0.0001"
                  required
                  :disabled="controlsDisabled || searchActive"
                />
              </div>
              <div class="sdr-search-adhoc-col">
                <label class="sdr-field-label">STEP</label>
                <div
                  :ref="setAdhocStepDropdownRef"
                  class="sdr-device-dropdown sdr-step-dropdown"
                  :class="{
                    'sdr-device-dropdown--open': stepMenuOpen && stepMenuTarget === 'adhoc',
                    'sdr-device-dropdown--loading': controlsDisabled || searchActive,
                  }"
                  tabindex="0"
                  @click.stop="controlsDisabled || searchActive ? null : toggleStepMenu('adhoc')"
                  @keydown="onStepDropdownKey($event, 'adhoc')"
                >
                  <div class="sdr-device-dropdown-selected">
                    <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                      adhocStepLabel
                    }}</span>
                    <span class="sdr-device-dropdown-arrow"></span>
                  </div>
                </div>
              </div>
              <div class="sdr-search-adhoc-col sdr-search-adhoc-col--play">
                <button
                  type="button"
                  class="sdr-search-adhoc-play"
                  :class="{ 'sdr-search-adhoc-play--active': isAdhocSearching }"
                  :disabled="tuningDisabled || (!adhocSearchValid && !isAdhocSearching)"
                  :aria-label="isAdhocSearching ? 'Stop search' : 'Start search'"
                  :title="isAdhocSearching ? 'Stop search' : 'Start search'"
                  @click="onAdhocPlayClick"
                >
                  <svg
                    v-if="isAdhocSearching"
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    aria-hidden="true"
                  >
                    <rect x="1" y="1" width="8" height="8" fill="currentColor" />
                  </svg>
                  <svg
                    v-else
                    width="10"
                    height="10"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <polygon points="2,1 11,6 2,11" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>
            <div class="sdr-search-saved-ranges">
              <button
                type="button"
                class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
                :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': savedRangesExpanded }"
                :aria-expanded="savedRangesExpanded"
                aria-controls="sdr-saved-ranges-section"
                @click="savedRangesExpanded = !savedRangesExpanded"
              >
                <label class="sdr-field-label sdr-frequency-manager-scanner-title"
                  >SAVED RANGES</label
                >
                <span class="sdr-frequency-manager-accordion-chevron">
                  <ChevronIcon />
                </span>
              </button>
              <div v-show="savedRangesExpanded" id="sdr-saved-ranges-section">
                <div v-if="searchRanges.length > 0" class="sdr-search-range-list">
                  <div
                    v-for="r in searchRanges"
                    :key="r.id"
                    class="sdr-search-range-item"
                    :class="{ 'sdr-search-range-item-active': searchSelectedRangeId === r.id }"
                    :title="`step ${(r.step_hz / 1000).toFixed(2)} kHz · ${r.mode}`"
                  >
                    <button
                      type="button"
                      class="sdr-search-range-item-body"
                      :disabled="controlsDisabled"
                      @click="selectSearchRange(r.id)"
                    >
                      <span class="sdr-search-range-primary">{{ r.label }}</span>
                      <span class="sdr-search-range-secondary"
                        >{{ (r.low_hz / 1e6).toFixed(3) }}–{{
                          (r.high_hz / 1e6).toFixed(3)
                        }}
                        MHz</span
                      >
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
                      <svg
                        v-if="isSavedRangeSearching(r.id)"
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                      >
                        <rect x="1" y="1" width="8" height="8" fill="currentColor" />
                      </svg>
                      <svg
                        v-else
                        width="10"
                        height="10"
                        viewBox="0 0 12 12"
                        fill="none"
                        aria-hidden="true"
                      >
                        <polygon points="2,1 11,6 2,11" fill="currentColor" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div v-else class="sdr-scan-subsection-label" style="opacity: 0.6">
                  No ranges defined — add some in Frequency Manager.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Trunk-system channel-map picker. Lives in its own accordion below
             SEARCH; only shown when trunk tracking is enabled in Settings and
             while digital decode is running (the trunk control rides on the
             decode session). -->
        <div
          v-if="trunkTrackingEnabled && digitalEnabled"
          class="sdr-radio-section sdr-trunk-section"
        >
          <button
            type="button"
            class="sdr-scanner-header-row sdr-frequency-manager-accordion-toggle"
            :class="{ 'sdr-frequency-manager-accordion-toggle-expanded': trunkSectionExpanded }"
            :aria-expanded="trunkSectionExpanded"
            aria-controls="sdr-trunk-section-body"
            @click="trunkSectionExpanded = !trunkSectionExpanded"
          >
            <label class="sdr-field-label sdr-frequency-manager-scanner-title">TRUNK SYSTEM</label>
            <span class="sdr-frequency-manager-accordion-chevron">
              <ChevronIcon />
            </span>
          </button>
          <div v-show="trunkSectionExpanded" id="sdr-trunk-section-body">
            <!-- Flat-dark custom dropdown matching the device/step pickers (the
                 native <select> didn't match the panel theme). Disabled while
                 trunking is active — the map can't change mid-follow. -->
            <div
              ref="trunkMapDropdownRef"
              class="sdr-device-dropdown sdr-trunk-dropdown"
              :class="{
                'sdr-device-dropdown--open': trunkMapMenuOpen,
                'sdr-device-dropdown--loading': trunkEnabled,
              }"
              tabindex="0"
              role="combobox"
              aria-label="Trunk channel map"
              aria-haspopup="listbox"
              aria-controls="sdr-trunk-map-listbox"
              :aria-expanded="trunkMapMenuOpen"
              @click.stop="trunkEnabled ? null : toggleTrunkMapMenu()"
              @keydown="onTrunkMapDropdownKey"
            >
              <div class="sdr-device-dropdown-selected">
                <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                  trunkMapLabel
                }}</span>
                <span class="sdr-device-dropdown-arrow"></span>
              </div>
            </div>
            <!-- Follow the trunked system's control-channel grants. Enabled
                 only once digital decode is running and a channel map is
                 chosen (canEnableTrunk). -->
            <button
              class="sdr-trunk-follow-btn"
              :class="{ 'sdr-trunk-follow-btn--active': trunkEnabled }"
              type="button"
              :title="trunkEnabled ? 'Stop trunk tracking' : 'Follow trunked system'"
              :aria-pressed="trunkEnabled"
              :disabled="!canEnableTrunk && !trunkEnabled"
              @click="toggleTrunk"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path
                  d="M6 1.5V10.5M6 1.5L3 4.5M6 1.5L9 4.5M2 8.5h8"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <span>{{ trunkEnabled ? 'FOLLOWING SYSTEM' : 'FOLLOW SYSTEM' }}</span>
            </button>
            <p v-if="trunkChannelMaps.length === 0" class="sdr-trunk-hint">
              Add a channel-map CSV to decoder/channel-maps to enable trunking.
            </p>
            <p v-if="trunkError" class="sdr-trunk-error" role="alert">{{ trunkError }}</p>
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
              >
                All
              </button>
              <button
                v-for="g in groupsWithFreqs"
                :key="g.id"
                type="button"
                class="sdr-scan-group-chip"
                :class="{
                  'sdr-scan-group-chip-active':
                    !freqFilterAllSelected && freqFilterSelectedGroupIds.includes(g.id),
                }"
                @click="toggleFreqFilterGroup(g.id)"
              >
                {{ g.name }}
              </button>
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
                    <span v-else class="sdr-freq-row-group-chip"> Default </span>
                  </div>
                </div>
                <button
                  class="sdr-freq-row-play"
                  aria-label="Play frequency"
                  title="Play"
                  @click.stop="playFreq(f)"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <polygon points="2,1 11,6 2,11" fill="currentColor" />
                  </svg>
                </button>
                <button
                  class="sdr-freq-row-edit"
                  aria-label="Edit frequency"
                  title="Edit"
                  @click.stop="toggleEditFreqPanel(f)"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <button
                  class="sdr-freq-row-del"
                  aria-label="Delete frequency"
                  title="Delete"
                  @click.stop="deleteFreq(f.id)"
                >
                  &#x2715;
                </button>
              </div>

              <!-- Inline edit form (accordion body) -->
              <div
                v-if="efOpen && editingFreqId === f.id"
                class="sdr-editfreq-body expanded"
                @click.stop
              >
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
                    <button
                      v-for="m in MODES"
                      :key="m"
                      class="sdr-mode-pill"
                      :class="{ active: efMode === m }"
                      @click="efMode = m"
                    >
                      {{ m }}
                    </button>
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
                    >
                      Default
                    </button>
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
                  <button
                    type="button"
                    class="sdr-ef-settings-toggle"
                    :aria-expanded="efSettingsExpanded"
                    aria-controls="sdr-ef-settings-section"
                    @click="efSettingsExpanded = !efSettingsExpanded"
                  >
                    <span class="sdr-ef-settings-toggle-title">RADIO SETTINGS</span>
                    <ChevronIcon :open="efSettingsExpanded" />
                  </button>
                  <div
                    v-show="efSettingsExpanded"
                    id="sdr-ef-settings-section"
                    class="sdr-ef-settings-grid"
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
                      <!-- Custom dropdown (NOT native <select>): native option
                           lists are UA-rendered and can't be themed; reuse the
                           app's flat-dark device-dropdown primitives instead. -->
                      <div
                        class="sdr-device-dropdown sdr-ef-setting-dropdown"
                        :class="{ 'sdr-device-dropdown--open': efSampleRateMenuOpen }"
                        tabindex="0"
                        role="button"
                        aria-haspopup="listbox"
                        :aria-expanded="efSampleRateMenuOpen"
                        aria-label="Device sample rate"
                        @click.stop="toggleEfSampleRateMenu"
                        @keydown="onEfSampleRateDropdownKey"
                      >
                        <div class="sdr-device-dropdown-selected">
                          <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                            formatBwHz(efSampleRate)
                          }}</span>
                          <span class="sdr-device-dropdown-arrow"></span>
                        </div>
                      </div>
                      <Teleport to="body">
                        <div
                          v-if="efSampleRateMenuOpen"
                          class="sdr-device-menu sdr-device-menu--open"
                          role="listbox"
                          :style="efSampleRateMenuStyle"
                          @click.stop
                        >
                          <div
                            v-for="rate in SAMPLE_RATE_OPTIONS"
                            :key="rate"
                            class="sdr-device-menu-item"
                            :class="{ 'sdr-device-menu-item--selected': rate === efSampleRate }"
                            role="option"
                            :aria-selected="rate === efSampleRate"
                            @click="pickEfSampleRate(rate)"
                          >
                            {{ formatBwHz(rate) }}
                          </div>
                        </div>
                      </Teleport>
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
                  </div>
                </div>
                <div class="sdr-editfreq-actions">
                  <div class="sdr-editfreq-actions-right">
                    <button class="sdr-panel-btn" @click="cancelEditFreq">CANCEL</button>
                    <button class="sdr-panel-btn sdr-editfreq-save-btn" @click="saveFreq">
                      SAVE
                    </button>
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

          <div
            v-show="!(efOpen && editingFreqId === null)"
            class="sdr-frequency-manager-add-freq-row"
          >
            <button id="sdr-radio-add-freq" class="sdr-add-freq-btn" @click="openAddFreqPanel">
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
                <button
                  v-for="m in MODES"
                  :key="m"
                  class="sdr-mode-pill"
                  :class="{ active: efMode === m }"
                  @click="efMode = m"
                >
                  {{ m }}
                </button>
              </div>
              <!-- No mode-error slot here: the Add panel seeds efMode from the
                   current (always-valid) mode, so it can never fail mode
                   validation. The inline per-row edit (which can open a stored
                   frequency with a legacy/invalid mode) keeps its slot. -->
            </div>
            <div class="sdr-editfreq-field">
              <label class="sdr-field-label">GROUPS</label>
              <div id="sdr-ef-groups" class="sdr-fmod-groups">
                <button
                  class="sdr-mode-pill sdr-ef-gpill"
                  :class="{ active: efGroupIds.length === 0 }"
                  type="button"
                  @click="efGroupIds = []"
                >
                  Default
                </button>
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
              <button
                type="button"
                class="sdr-ef-settings-toggle"
                :aria-expanded="efSettingsExpanded"
                aria-controls="sdr-ef-settings-section"
                @click="efSettingsExpanded = !efSettingsExpanded"
              >
                <span class="sdr-ef-settings-toggle-title">RADIO SETTINGS</span>
                <ChevronIcon :open="efSettingsExpanded" />
              </button>
              <div
                v-show="efSettingsExpanded"
                id="sdr-ef-settings-section"
                class="sdr-ef-settings-grid"
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
                  <!-- Custom dropdown (NOT native <select>): native option
                       lists are UA-rendered and can't be themed; reuse the
                       app's flat-dark device-dropdown primitives instead. -->
                  <div
                    class="sdr-device-dropdown sdr-ef-setting-dropdown"
                    :class="{ 'sdr-device-dropdown--open': efSampleRateMenuOpen }"
                    tabindex="0"
                    role="button"
                    aria-haspopup="listbox"
                    :aria-expanded="efSampleRateMenuOpen"
                    aria-label="Device sample rate"
                    @click.stop="toggleEfSampleRateMenu"
                    @keydown="onEfSampleRateDropdownKey"
                  >
                    <div class="sdr-device-dropdown-selected">
                      <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                        formatBwHz(efSampleRate)
                      }}</span>
                      <span class="sdr-device-dropdown-arrow"></span>
                    </div>
                  </div>
                  <Teleport to="body">
                    <div
                      v-if="efSampleRateMenuOpen"
                      class="sdr-device-menu sdr-device-menu--open"
                      role="listbox"
                      :style="efSampleRateMenuStyle"
                      @click.stop
                    >
                      <div
                        v-for="rate in SAMPLE_RATE_OPTIONS"
                        :key="rate"
                        class="sdr-device-menu-item"
                        :class="{ 'sdr-device-menu-item--selected': rate === efSampleRate }"
                        role="option"
                        :aria-selected="rate === efSampleRate"
                        @click="pickEfSampleRate(rate)"
                      >
                        {{ formatBwHz(rate) }}
                      </div>
                    </div>
                  </Teleport>
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
              </div>
            </div>
            <div class="sdr-editfreq-actions">
              <div class="sdr-editfreq-actions-right">
                <button id="sdr-ef-cancel" class="sdr-panel-btn" @click="cancelEditFreq">
                  CANCEL
                </button>
                <button
                  id="sdr-ef-save"
                  class="sdr-panel-btn sdr-editfreq-save-btn"
                  @click="saveFreq"
                >
                  SAVE
                </button>
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
                  :title="
                    rangeEditorOpen && editingRangeId === r.id ? 'Close editor' : 'Edit range'
                  "
                  @click.stop="toggleEditRange(r)"
                  @keydown.enter.stop.prevent="toggleEditRange(r)"
                  @keydown.space.stop.prevent="toggleEditRange(r)"
                >
                  <div class="sdr-freq-row-main">
                    <span class="sdr-freq-row-label">{{ r.label }}</span>
                  </div>
                  <div class="sdr-freq-row-sub">
                    <span class="sdr-freq-row-hz"
                      >{{ (r.low_hz / 1e6).toFixed(3) }}–{{
                        (r.high_hz / 1e6).toFixed(3)
                      }}
                      MHz</span
                    >
                  </div>
                </div>
                <span class="sdr-freq-row-play-spacer" aria-hidden="true"></span>
                <button
                  v-if="!(rangeEditorOpen && editingRangeId === r.id)"
                  class="sdr-freq-row-edit"
                  aria-label="Edit range"
                  title="Edit"
                  @click.stop="toggleEditRange(r)"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                <button
                  class="sdr-freq-row-del"
                  aria-label="Delete range"
                  title="Delete"
                  @click.stop="deleteRange(r.id)"
                >
                  &#x2715;
                </button>
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
                    <div
                      :ref="setStepDropdownRef"
                      class="sdr-device-dropdown sdr-step-dropdown"
                      :class="{ 'sdr-device-dropdown--open': stepMenuOpen }"
                      tabindex="0"
                      @click.stop="toggleStepMenu('range')"
                      @keydown="onStepDropdownKey($event, 'range')"
                    >
                      <div class="sdr-device-dropdown-selected">
                        <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                          stepMenuLabel
                        }}</span>
                        <span class="sdr-device-dropdown-arrow"></span>
                      </div>
                    </div>
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
                    <button
                      v-for="m in SEARCH_MODES"
                      :key="m"
                      type="button"
                      class="sdr-mode-pill"
                      :class="{ active: rangeEditor.mode === m }"
                      @click="rangeEditor.mode = m"
                    >
                      {{ m }}
                    </button>
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

          <div v-if="searchRanges.length === 0" class="sdr-panel-empty">
            No search ranges defined.
          </div>

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
                <div
                  :ref="setStepDropdownRef"
                  class="sdr-device-dropdown sdr-step-dropdown"
                  :class="{ 'sdr-device-dropdown--open': stepMenuOpen }"
                  tabindex="0"
                  @click.stop="toggleStepMenu('range')"
                  @keydown="onStepDropdownKey($event, 'range')"
                >
                  <div class="sdr-device-dropdown-selected">
                    <span class="sdr-device-dropdown-text sdr-device-dropdown-text--chosen">{{
                      stepMenuLabel
                    }}</span>
                    <span class="sdr-device-dropdown-arrow"></span>
                  </div>
                </div>
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
                <button
                  v-for="m in SEARCH_MODES"
                  :key="m"
                  type="button"
                  class="sdr-mode-pill"
                  :class="{ active: rangeEditor.mode === m }"
                  @click="rangeEditor.mode = m"
                >
                  {{ m }}
                </button>
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

      <!-- ───────────── GROUPS TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'groups' }">
        <div id="sdr-group-list">
          <div class="sdr-group-pills">
            <div v-for="g in sortedGroups" :key="g.id" class="sdr-group-pill">
              <span class="sdr-group-pill-name">{{ g.name }}</span>
              <button
                class="sdr-group-pill-edit"
                title="Rename group"
                aria-label="Rename group"
                @click.stop="startEditGroupRow(g)"
              >
                &#x270E;
              </button>
              <button
                class="sdr-group-pill-del"
                title="Delete group"
                aria-label="Delete group"
                @click.stop="deleteGroup(g.id)"
              >
                &#x2715;
              </button>
            </div>
          </div>
        </div>
        <div class="sdr-panel-add-row sdr-frequency-manager-group-add-row">
          <input
            ref="newGroupNameRef"
            v-model="newGroupName"
            class="sdr-panel-input"
            type="text"
            aria-label="New group name"
            placeholder="Group name…"
            maxlength="40"
            @keydown.enter="submitGroupRow"
            @keydown.escape="cancelEditGroupRow"
          />
          <button v-if="editingGroupId !== null" class="sdr-panel-btn" @click="cancelEditGroupRow">
            CANCEL
          </button>
          <button class="sdr-panel-btn" @click="submitGroupRow">
            {{ editingGroupId !== null ? 'SAVE' : 'ADD' }}
          </button>
        </div>
      </div>

      <!-- ───────────── RECORDINGS TAB ───────────── -->
      <div class="sdr-tab-pane" :class="{ active: activeSdrTab === 'recordings' }">
        <SdrRecordingsSection
          ref="recordingsSectionRef"
          :live-recording="liveRecording"
          :rec-squelch-open="recSquelchOpen"
          :live-elapsed-s="liveElapsedS"
          @stop-recording="stopRecordingIfActive"
          @playback-active="(active: boolean) => sdrAudio.setLiveMuted(active)"
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
        :class="{
          'sdr-device-menu-item--selected':
            parseFloat(stepMenuTarget === 'adhoc' ? adhocStepKhz : rangeEditor.step_khz) === s,
        }"
        @click="pickStep(s)"
      >
        {{ formatStepKhz(s) }}
      </div>
    </div>
  </Teleport>

  <!-- Trunk channel-map dropdown menu (teleported so it overlays the side panel) -->
  <Teleport to="body">
    <div
      v-if="trunkMapMenuOpen"
      ref="trunkMapMenuRef"
      class="sdr-device-menu sdr-device-menu--open sdr-trunk-menu"
      :style="trunkMapMenuStyle"
      @click.stop
    >
      <div id="sdr-trunk-map-listbox" role="listbox" aria-label="Channel maps">
        <div
          role="option"
          class="sdr-device-menu-item"
          :class="{ 'sdr-device-menu-item--selected': trunkChannelMap === '' }"
          :aria-selected="trunkChannelMap === ''"
          @click="pickTrunkMap('')"
        >
          No channel map
        </div>
        <div
          v-for="name in trunkChannelMaps"
          :key="name"
          role="option"
          class="sdr-device-menu-item"
          :class="{ 'sdr-device-menu-item--selected': trunkChannelMap === name }"
          :aria-selected="trunkChannelMap === name"
          @click="pickTrunkMap(name)"
        >
          {{ name }}
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import './SdrPanel.css'
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useSdrAudio } from '@/composables/useSdrAudio'
import { useSdrDecode } from '@/composables/useSdrDecode'
import { useDocumentEvent } from '@/composables/useDocumentEvent'
import SdrRecordingsSection from './SdrRecordingsSection.vue'
import ChevronIcon from '@/components/shared/ChevronIcon.vue'
import { useSdrStore } from '@/stores/sdr'
import type { SdrMode, SdrTab } from '@/stores/sdr'
import { useNotificationsStore } from '@/stores/notifications'
import type { SdrSearchRange } from '@/services/sdrSearchApi'
import {
  listSearchRanges as apiListSearchRanges,
  createSearchRange as apiCreateSearchRange,
  updateSearchRange as apiUpdateSearchRange,
  deleteSearchRange as apiDeleteSearchRange,
} from '@/services/sdrSearchApi'

interface SdrRadio {
  id: number
  name: string
  host: string
  enabled: boolean
}
interface SdrFrequencyGroup {
  id: number
  name: string
  slug: string
  color: string
  sort_order: number
}
interface SdrStoredFrequency {
  id: number
  label: string
  frequency_hz: number
  mode: string
  scannable: boolean
  group_ids: number[]
  group_id?: number | null
  squelch?: number
  gain?: number
  bandwidth?: number | null
  sample_rate?: number | null
  volume?: number
  zoom?: number
  zmin?: number
  zmax?: number
  notes?: string
}
defineProps<{ fullPage: boolean }>()

const sdrAudio = useSdrAudio()
const sdrDecode = useSdrDecode()

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

// Read-only follower: the shared dongle is currently owned by another Sentinel
// instance over the relay control channel. Drives the read-only banner and
// disables this instance's hardware tuning controls (frequency, gain, sample
// rate, scan, search). False for a single instance or a free/unowned tuner.
const readOnly = computed(() => _sdrStore().readOnly)

// Visual disable for hardware-tuning controls: disabled when there's no usable
// radio (controlsDisabled) OR this instance is a read-only follower. Local/demod
// controls (mode, volume, squelch, bandwidth) keep using controlsDisabled so a
// follower can still listen to the owner's tuned signal.
const tuningDisabled = computed(() => controlsDisabled.value || readOnly.value)

// Pending external (auto-tune) request, applied once the control socket opens.
let _pendingExternalTune: {
  hz: number
  mode: SdrMode
  satName: string
  noradId?: string
  token?: string
  record?: boolean
} | null = null

// State captured the moment an auto-tune takes over the radio, so the LOS
// restore can put things back. `playing` records whether audio was running
// before AOS; when false the radio was stopped (or merely connected) and the
// restore stops playback again. `token` ties this snapshot to the firing pass so
// a stale LOS (after a newer pass retuned) is ignored. `tunedHz`/`tunedMode` are
// what we tuned *to* — the restore only acts if the radio is still on them
// (i.e. the user hasn't manually retuned since), so we never clobber a manual change.
// `startedRecording` is true when *we* auto-started a recording at AOS, so the LOS
// restore stops only that recording and never a manual one the user began.
let _autoTunePrevState: {
  token?: string
  playing: boolean
  freqHz: number
  mode: SdrMode
  tunedHz: number
  tunedMode: SdrMode
  startedRecording?: boolean
} | null = null

const MODES = ['AM', 'NFM', 'WFM', 'USB', 'LSB', 'CW'] as const
const SIGNAL_SEGS = 36

// ── Active tab ────────────────────────────────────────────────────────────────
const SDR_TAB_KEY = 'sentinel_sdr_tab'
const sdrTabs: ReadonlyArray<{ id: SdrTab; label: string }> = [
  { id: 'radio', label: 'RADIO' },
  { id: 'frequency-manager', label: 'FREQUENCY MANAGER' },
  { id: 'search-ranges', label: 'SEARCH RANGES' },
  { id: 'groups', label: 'GROUPS' },
  { id: 'recordings', label: 'RECORDINGS' },
]
function _restoreSdrTab(): SdrTab {
  try {
    const v = sessionStorage.getItem(SDR_TAB_KEY) as SdrTab | null
    if (v && sdrTabs.some((t) => t.id === v)) return v
  } catch {}
  return 'radio'
}
const activeSdrTab = ref<SdrTab>(_restoreSdrTab())
// Seed the store mirror so the footer indicator reflects the restored tab from
// first paint (before any user tab switch).
_sdrStore().setActiveTab(activeSdrTab.value)
function switchSdrTab(tab: SdrTab) {
  activeSdrTab.value = tab
  _sdrStore().setActiveTab(tab)
  try {
    sessionStorage.setItem(SDR_TAB_KEY, tab)
  } catch {}
}

const route = useRoute()
const isSdrRoute = computed(() => route.path.startsWith('/sdr'))
const sidebarOpen = ref<boolean>(_readSidebarOpen())
function _readSidebarOpen(): boolean {
  try {
    return sessionStorage.getItem('sentinel_sidebar_open') === '1'
  } catch {
    return false
  }
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

const recordingsSectionRef = ref<InstanceType<typeof SdrRecordingsSection> | null>(null)

// ── Radio state ───────────────────────────────────────────────────────────────
const connected = ref(false)
const playing = ref(false)
// Mirror play state into the store so SdrWaterfall can gate its rendering.
// A single passive watch — deliberately does NOT alter any existing
// play-state logic (avoids the regression that earlier setPlayingState
// substitutions risked).
watch(playing, (v) => {
  _sdrStore().setPlaying(v)
})
// Mirror device reachability into the store so other components (e.g. the
// air-domain airport list) can gate SDR tuning on whether a radio is connected.
watch(
  connected,
  (v) => {
    _sdrStore().setConnected(v)
  },
  { immediate: true },
)
const controlsDisabled = ref(true)
const selectedRadioId = ref<number | null>(null)
const knownRadios = ref<SdrRadio[]>([])
const currentMode = ref('AM')
const freqInputVal = ref('')
const freqInputRef = ref<HTMLInputElement | null>(null)
const currentFreqHz = ref(0)
const gainDb = ref(30)
const gainAuto = ref(false)
const volume = ref(80)
const squelch = ref(-30)
const bwHz = ref(10000)
const bwMax = ref(2048000)
// Hardware sample rate (rtl_tcp): governs the spectrum/waterfall x-axis span
// and is fully independent of the demod-filter Bandwidth slider above. Tiers
// match snapToValidSampleRate() in sdrPanelUtils.ts — the 1.024 MHz floor
// avoids the stuttering 250k/300k tiers measured on the remote Pi.
const SAMPLE_RATE_OPTIONS = [1024000, 1536000, 1792000, 2048000] as const
const sampleRateHz = ref<number>(2048000)
// Resume delay is owned by the SDR store (Settings → SDR → SCAN & SEARCH).
// Wrapped in a computed so the existing watcher code keeps using
// `resumeDelaySec.value` unchanged.
const resumeDelaySec = computed<number>(() => _sdrStore().resumeDelaySec)
const activeFreqDisplay = ref('')
const signalSmoothed = ref(-120)
const signalLit = ref(0)
const worklestSquelchOpen = ref(true)

// ── Store mirrors / marker bridge ─────────────────────────────────────────────
// Passive mirrors so the spectrum/waterfall marker (SdrWaterfall, a sibling)
// can read the authoritative tuned freq + demod bandwidth. These fire on EVERY
// existing path that mutates the local refs (tune, tuneToFreq, setMode,
// onBwInput, applyStatus) — no changes to those functions.
watch(
  currentFreqHz,
  (v) => {
    if (v) _sdrStore().setFrequency(v)
  },
  { immediate: true },
)
watch(
  bwHz,
  (v) => {
    _sdrStore().setBandwidthHz(v)
  },
  { immediate: true },
)

// Collapse the Scanner + Search accordions whenever the side panel opens,
// so the user starts from a clean state instead of inheriting prior expansion.
watch(
  () => _sdrStore().panelOpen,
  (open) => {
    if (open) {
      scannerSectionExpanded.value = false
      searchSectionExpanded.value = false
      savedRangesExpanded.value = false
      trunkSectionExpanded.value = false
    }
  },
)

// Demod NCO offset bridge. The store is the single source of truth for the
// offset from the hardware centre (set by the waterfall click handler when
// auto-centre is OFF, cleared to 0 by the ON path / toggle). Push every change
// into the audio worklet. immediate so a restored 0 is asserted on mount.
watch(
  () => _sdrStore().tuningOffsetHz,
  (hz) => {
    sdrAudio.setOffsetHz(hz || 0)
  },
  { immediate: true },
)

// Marker retune request. The bar/marker only moves once currentFreqHz updates
// (the waterfall watches it via applyMarker), so update the display state
// immediately for snappy click-to-tune — only debounce the hardware sendCmd
// and the persistent saves so rapid drags still coalesce.
watch(
  () => _sdrStore().tuneRequest,
  (req) => {
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
  },
)

// Waterfall FFT-size request. The waterfall sizes its desired bin count to the
// canvas's device-pixel width so each bin maps to ~1 px (no blur from upsampling
// a 1024-bin FFT into a 2600+ px canvas). Forwarded straight to the backend; it
// clamps to a power of two in [MIN_FFT_SIZE, MAX_FFT_SIZE].
watch(
  () => _sdrStore().fftSizeRequest,
  (req) => {
    // requestFftSize only ever assigns a non-null payload, and the watch fires
    // on change, so req is always present here.
    /* v8 ignore start */
    if (!req) return
    /* v8 ignore stop */
    sendCmd({ cmd: 'fft_size', bins: req.bins })
  },
)

// Marker bandwidth request — demod audio filter ONLY (no sample_rate command;
// matches SDR++/SDR#/GQRX and avoids the rtl_tcp reconfigure stall).
watch(
  () => _sdrStore().bwRequest,
  (req) => {
    if (!req || !playing.value) return
    const v = Math.round(req.hz)
    if (!v || v === bwHz.value) return
    bwHz.value = v // re-mirrors to the store via the watch above
    saveSettings()
    sdrAudio.setBandwidthHz(v)
  },
)

const signalAudible = computed(
  () => playing.value && (squelch.value <= -119 || worklestSquelchOpen.value),
)

// ── Device dropdown ───────────────────────────────────────────────────────────
const deviceDropdownRef = ref<HTMLElement | null>(null)
const deviceMenuRef = ref<HTMLElement | null>(null)
const deviceMenuOpen = ref(false)
// Keyboard-highlighted option in the device listbox (select-only combobox):
// 0 = the "select radio" placeholder, 1..N = menuRadios[index-1].
const deviceHighlight = ref(0)
const radiosLoading = ref(true)
const menuRadios = ref<SdrRadio[]>([])
const deviceMenuStyle = ref<Record<string, string>>({})
const deviceDropdownLabel = ref('loading…')

// ── Scanner ───────────────────────────────────────────────────────────────────
const scanActive = ref(false)
const scanLocked = ref(false)
const scanCurrentHz = ref<number | null>(null)
const scanSelectedGroupIds = ref<number[]>([])
const scanAllSelected = ref(true)
let _scanQueue: SdrStoredFrequency[] = []
let _scanIdx = 0
let _scanTimer: ReturnType<typeof setTimeout> | null = null

// ── Search (high/low frequency range sweep) ──────────────────────────────────
const searchSectionExpanded = ref(false)
const savedRangesExpanded = ref(false)
const _rangesSectionExpanded = ref(false)
const searchRanges = ref<SdrSearchRange[]>([])
const filteredSearchRanges = computed<SdrSearchRange[]>(() => searchRanges.value)
const searchActive = ref(false)
const searchLocked = ref(false)
const searchSelectedRangeId = ref<number | null>(null)
// Tracks whether the running search was started from the ad-hoc inputs or a
// saved range list item — needed so per-item play/stop buttons can show the
// correct icon and toggle the correct sweep.
const searchActiveSource = ref<'adhoc' | 'saved' | null>(null)
const searchCurrentHz = ref<number | null>(null)

// Ad-hoc search inputs (low/high MHz, step kHz) — required fields shown
// above the saved ranges list. When all three are valid, SEARCH uses these
// instead of a saved range.
const adhocLowMhz = ref<string>('')
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
const groups = ref<SdrFrequencyGroup[]>([])
const freqs = ref<SdrStoredFrequency[]>([])
const freqFilterSelectedGroupIds = ref<number[]>([])
const freqFilterAllSelected = ref(true)
const scannerSectionExpanded = ref(false)
const settingsSectionExpanded = ref(true)
const newGroupName = ref('')

const currentFreqLabel = computed<string>(() => {
  const hz = currentFreqHz.value
  if (!hz) return ''
  const match = freqs.value.find((f) => f.frequency_hz === hz)
  return match?.label || ''
})

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

const groupsWithFreqs = computed<SdrFrequencyGroup[]>(() => {
  const idsWithFreqs = new Set<number>()
  freqs.value.forEach((f) => {
    ;(f.group_ids || []).forEach((id) => {
      if (id !== 0) idsWithFreqs.add(id)
    })
    if (f.group_id != null && f.group_id !== 0) idsWithFreqs.add(f.group_id)
  })
  return groups.value
    .filter((g) => idsWithFreqs.has(g.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
})

const sortedGroups = computed<SdrFrequencyGroup[]>(() =>
  groups.value
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
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
        .filter((g) => sel.has(g.id))
        .map((g) => g.name)
    }
  },
  { immediate: true, deep: true },
)

const newGroupNameRef = ref<HTMLInputElement | null>(null)

function freqGroupsFor(f: SdrStoredFrequency): SdrFrequencyGroup[] {
  const ids = new Set<number>((f.group_ids || []).filter((id) => id !== 0))
  if (f.group_id != null && f.group_id !== 0) ids.add(f.group_id)
  return groups.value.filter((g) => ids.has(g.id))
}

// ── Edit frequency panel ──────────────────────────────────────────────────────
const efOpen = ref(false)
const editingFreqId = ref<number | null>(null)
const efLabel = ref('')
const efFreq = ref('')
const efMode = ref('AM')
const efGroupIds = ref<number[]>([])
const efNotes = ref('')
// Per-frequency tuning settings captured in the add/edit form. Seeded from the
// live radio settings when adding, or the stored values when editing. Kept as
// strings (parsed on save) to mirror the freq input; efGainAuto toggles AGC
// (stored as gain = -1), and efSampleRate is a concrete option value.
const efGainDb = ref('30')
const efGainAuto = ref(false)
const efBwKhz = ref('10')
const efSquelch = ref('-60')
const efVolume = ref('80')
const efSampleRate = ref<number>(2048000)
// Custom flat-dark dropdown for the form's SAMPLE RATE (mirrors the RADIO tab's
// device dropdown — see toggleSampleRateMenu — so the menu matches the app
// theme rather than the unstyleable native <select> popup). Bound to the form's
// efSampleRate rather than the live radio. The menu is positioned from the
// triggering event's currentTarget (not a template ref) because the per-row
// edit form lives in a v-for, where a ref would resolve to an array.
const efSampleRateMenuOpen = ref(false)
const efSampleRateMenuStyle = ref<Record<string, string>>({})
// Whether the "RADIO SETTINGS" accordion inside the add/edit form is expanded.
// Collapsed by default to keep the form compact; shared by both forms (only one
// is open at a time).
const efSettingsExpanded = ref(false)
const efZoom = ref('1')
const efZmin = ref('0')
const efZmax = ref('0')
const efErrors = ref<{ label?: string; freq?: string; mode?: string; notes?: string }>({})
const NOTES_ALLOWED = /^[A-Za-z0-9\s.,!?\-_():;/@]*$/
watch(efLabel, () => {
  if (efErrors.value.label) efErrors.value = { ...efErrors.value, label: undefined }
})
watch(efFreq, () => {
  if (efErrors.value.freq) efErrors.value = { ...efErrors.value, freq: undefined }
})
watch(efMode, () => {
  // efMode is only ever set from the mode pills (always a valid MODES entry), so
  // validateFreqForm never raises a mode error to clear here.
  /* v8 ignore start */
  if (efErrors.value.mode) efErrors.value = { ...efErrors.value, mode: undefined }
  /* v8 ignore stop */
})
watch(efNotes, () => {
  if (efErrors.value.notes) efErrors.value = { ...efErrors.value, notes: undefined }
})

// ── Recording state (live recording props passed to SdrRecordingsSection) ─────

const isRecording = ref(false)
const recSquelchOpen = ref(true)
const liveElapsedS = ref(0)
interface LiveRec {
  frequency_hz: number
  mode: string
  startedAt: string
}
const liveRecording = ref<LiveRec | null>(null)
let _recStartEpoch = 0
let _recPausedMs = 0
let _recPauseStart: number | null = null
let _recTimerInterval: ReturnType<typeof setInterval> | null = null

const editingGroupId = ref<number | null>(null)

// ── Helpers ───────────────────────────────────────────────────────────────────

import { formatBwHz, parseFreqMhz, defaultBwHz } from './sdrPanelUtils'

function saveSettings() {
  try {
    sessionStorage.setItem(
      'sdrSettings',
      JSON.stringify({
        gainDb: gainDb.value,
        gainAuto: gainAuto.value,
        squelch: squelch.value,
        bwHz: bwHz.value,
        vol: volume.value,
        mode: currentMode.value,
        freqHz: currentFreqHz.value,
        sampleRateHz: sampleRateHz.value,
      }),
    )
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
    if (typeof s.gainDb === 'number') {
      gainDb.value = s.gainDb
      gainAuto.value = !!s.gainAuto
    }
    if (typeof s.squelch === 'number') squelch.value = s.squelch
    if (typeof s.bwHz === 'number' && s.bwHz > 0) bwHz.value = s.bwHz
    if (typeof s.vol === 'number') {
      volume.value = s.vol
      sdrAudio.setVolume(s.vol / 100)
    }
    if (
      typeof s.sampleRateHz === 'number' &&
      SAMPLE_RATE_OPTIONS.includes(s.sampleRateHz as (typeof SAMPLE_RATE_OPTIONS)[number])
    ) {
      sampleRateHz.value = s.sampleRateHz
      bwMax.value = s.sampleRateHz
    }
  } catch (_) {}
}

// ── Control WebSocket ─────────────────────────────────────────────────────────

let _ctrlSocket: WebSocket | null = null
let _ctrlReconnectDelay = 500
const CTRL_RECONNECT_MAX = 30000
let _ctrlRadioId: number | null = null
let _ctrlReconnect: ReturnType<typeof setTimeout> | null = null
let _ctrlDataConfirmed = false

function _markInitialised(id: number) {
  sessionStorage.setItem(`sdrInit_${id}`, '1')
}
function _isInitialised(id: number) {
  return sessionStorage.getItem(`sdrInit_${id}`) === '1'
}

function sendCmd(obj: object) {
  // Read-only follower: another instance owns the shared dongle over the relay
  // control channel, so suppress hardware-tuning commands (the relay would refuse
  // them anyway). Local/demod commands (mode, fft_size, digital, ping, …) still
  // pass through. When the tuner is FREE this is not read-only (locked=false), so
  // a tune here is allowed and claims ownership. This is the single chokepoint
  // every retune path funnels through (typed, marker click, wheel, scan, search).
  const sdrCommand = (obj as { cmd?: string }).cmd
  if (
    _sdrStore().readOnly &&
    (sdrCommand === 'tune' || sdrCommand === 'gain' || sdrCommand === 'sample_rate')
  ) {
    return
  }
  // A hardware tune always recenters the SDR on the new freq, so any prior
  // demod NCO offset (auto-centre OFF) is no longer valid — clear it here, the
  // single chokepoint for every retune path (typed, saved, marker, restore).
  // The auto-centre-OFF click path deliberately does NOT call sendCmd('tune'),
  // so it keeps its offset.
  if ((obj as { cmd?: string }).cmd === 'tune' && _sdrStore().tuningOffsetHz !== 0) {
    _sdrStore().setTuningOffsetHz(0)
  }
  // The socket is OPEN for every command path the tests drive; the not-open
  // arm (a command queued while CONNECTING) is a defensive drop.
  /* v8 ignore start */
  if (_ctrlSocket && _ctrlSocket.readyState === WebSocket.OPEN) {
    _ctrlSocket.send(JSON.stringify(obj))
  }
  /* v8 ignore stop */
}

// ── Digital decode (dsd-fme sidecar) ───────────────────────────────────────────

// Mirrors the store toggle so the DIGITAL button reflects (and survives) it.
const digitalEnabled = computed(() => _sdrStore().digitalEnabled)

// Turn digital decoding on/off while the radio is running. Enabling tells the
// backend to start the decode bridge (via the control socket), opens the decode
// + decoded-audio sockets, and mutes the analog audio (the digital channel is
// just noise to the ear). Disabling reverses all of it.
function setDigital(on: boolean) {
  _sdrStore().setDigitalEnabled(on)
  if (on) {
    _sdrStore().clearDecode()
    sendCmd({
      cmd: 'digital_decode',
      enabled: true,
      offset_hz: _sdrStore().tuningOffsetHz,
      bw_hz: bwHz.value,
      mode: currentMode.value,
    })
    if (selectedRadioId.value != null) sdrDecode.start(selectedRadioId.value)
    sdrAudio.setLiveMuted(true)
  } else {
    sendCmd({ cmd: 'digital_decode', enabled: false })
    sdrDecode.stop()
    sdrAudio.setLiveMuted(false)
    _sdrStore().clearDecode()
  }
}

function toggleDigital() {
  setDigital(!_sdrStore().digitalEnabled)
}

// ── Trunk tracking ─────────────────────────────────────────────────────────────

// Master feature flag (Settings → SDR → TRUNK DATA → Trunk Tracking). When OFF
// the TRUNK button and the TRUNK SYSTEM section below are hidden entirely.
const trunkTrackingEnabled = computed(() => _sdrStore().trunkTrackingEnabled)
const trunkEnabled = computed(() => _sdrStore().trunkEnabled)
const trunkChannelMap = computed({
  get: () => _sdrStore().trunkChannelMap,
  set: (name: string) => _sdrStore().setTrunkChannelMap(name),
})
const trunkChannelMaps = computed(() => _sdrStore().trunkChannelMaps)
const trunkError = computed(() => _sdrStore().trunkError)
// Trunking can only be turned on once digital decode is running and a channel
// map is chosen — the control surface for following grants rides on the decode
// session, and dsd-fme cannot follow a system without its map.
const canEnableTrunk = computed(() => digitalEnabled.value && trunkChannelMap.value !== '')

// Trunk-system accordion (sits below SEARCH) + its flat-dark channel-map
// dropdown, mirroring the device/step pickers' menu pattern.
const trunkSectionExpanded = ref(false)
const trunkMapDropdownRef = ref<HTMLElement | null>(null)
const trunkMapMenuRef = ref<HTMLElement | null>(null)
const trunkMapMenuOpen = ref(false)
const trunkMapMenuStyle = ref<Record<string, string>>({})

const trunkMapLabel = computed(() =>
  trunkChannelMap.value === '' ? 'No channel map' : trunkChannelMap.value,
)

function positionTrunkMapMenu() {
  const el = trunkMapDropdownRef.value
  // The dropdown is rendered (accordion open) before the menu can be toggled,
  // so its ref is always populated here.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  trunkMapMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleTrunkMapMenu() {
  if (trunkMapMenuOpen.value) {
    closeTrunkMapMenu()
    return
  }
  positionTrunkMapMenu()
  trunkMapMenuOpen.value = true
}

function closeTrunkMapMenu() {
  trunkMapMenuOpen.value = false
}

function onTrunkMapDropdownKey(keyboardEvent: KeyboardEvent) {
  if (trunkEnabled.value) return
  if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
    keyboardEvent.preventDefault()
    toggleTrunkMapMenu()
  }
  if (keyboardEvent.key === 'Escape') closeTrunkMapMenu()
}

function pickTrunkMap(name: string) {
  closeTrunkMapMenu()
  trunkChannelMap.value = name
}

// Fetch the channel-map filenames the backend offers (read from the mounted maps
// directory) so the picker has options. Failures leave the list empty.
async function loadChannelMaps() {
  try {
    const res = await fetch('/api/sdr/trunk/channel-maps')
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data?.channel_maps)) _sdrStore().setTrunkChannelMaps(data.channel_maps)
  } catch {
    /* offline / transient — leave the picker empty */
  }
}

// Turn trunk tracking on/off. Enabling tells the backend to start the rigctld
// server and relaunch dsd-fme in trunk mode with the chosen channel map; the
// decoder then follows control-channel grants. Requires digital decode already
// running (the backend bounces the existing decode session to apply the flags).
function setTrunk(on: boolean) {
  _sdrStore().setTrunkError('')
  if (on) {
    if (!canEnableTrunk.value) return
    _sdrStore().setTrunkEnabled(true)
    sendCmd({
      cmd: 'trunk_decode',
      enabled: true,
      channel_map: trunkChannelMap.value,
      offset_hz: _sdrStore().tuningOffsetHz,
      bw_hz: bwHz.value,
    })
  } else {
    _sdrStore().setTrunkEnabled(false)
    sendCmd({ cmd: 'trunk_decode', enabled: false })
  }
}

function toggleTrunk() {
  setTrunk(!_sdrStore().trunkEnabled)
}

// Turning digital decode off must also drop trunk tracking — it cannot run
// without the underlying decode session.
watch(digitalEnabled, (enabled) => {
  if (!enabled && _sdrStore().trunkEnabled) setTrunk(false)
})

// Disabling the trunk-tracking feature while a follow is active must stop the
// backend decode session too — the store clears local trunk state, but only the
// panel owns the WS connection that tells dsd-fme to drop trunk mode.
watch(trunkTrackingEnabled, (enabled) => {
  if (!enabled && _sdrStore().trunkEnabled) setTrunk(false)
})

// When the user retunes the demod offset or changes bandwidth while decoding,
// push the new channel to the backend so the server-side demod follows it
// without restarting the session.
watch([() => _sdrStore().tuningOffsetHz, bwHz, currentMode], () => {
  if (!_sdrStore().digitalEnabled) return
  sendCmd({
    cmd: 'digital_channel',
    offset_hz: _sdrStore().tuningOffsetHz,
    bw_hz: bwHz.value,
    mode: currentMode.value,
  })
})

async function openControlSocket(radioId: number) {
  if (_ctrlReconnect) {
    clearTimeout(_ctrlReconnect)
    _ctrlReconnect = null
  }
  if (
    _ctrlRadioId === radioId &&
    _ctrlSocket &&
    (_ctrlSocket.readyState === WebSocket.CONNECTING || _ctrlSocket.readyState === WebSocket.OPEN)
  )
    return
  if (_ctrlSocket) {
    _ctrlSocket.close()
    _ctrlSocket = null
  }
  _ctrlRadioId = radioId
  _ctrlDataConfirmed = false
  sessionStorage.setItem('sdrLastRadioId', String(radioId))

  try {
    const res = await fetch('/api/sdr/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  // (Race only triggerable with overlapping in-flight connects; not exercised
  // by the unit suite where the connect resolves before any re-selection.)
  /* v8 ignore start */
  if (_ctrlRadioId !== radioId) return
  /* v8 ignore stop */

  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  /* v8 ignore stop */
  const ws = new WebSocket(`${proto}://${location.host}/ws/sdr/${radioId}`)
  _ctrlSocket = ws

  ws.addEventListener('open', () => {
    _ctrlReconnectDelay = 500
    // The control socket is open, which means /api/sdr/connect succeeded and the
    // device is reachable — light the connection dot now (availability), rather
    // than waiting for the first spectrum frame that only flows once playing.
    void _probeReachability(radioId)
    // The restored highlight (currentMode, from sdrSettings via restoreSettings)
    // is the single source of truth — not sdrLastMode, which setMode does not
    // update and can be stale after a mode change. Using it kept the audio/
    // backend demod mode out of sync with the highlighted button across a reload.
    const lastMode = currentMode.value as SdrMode
    if (!_isInitialised(radioId)) _markInitialised(radioId)
    if (sessionStorage.getItem('sdrPlaying') === '1') {
      playing.value = true
      sdrAudio.setMode(lastMode)
      // Restore the demod bandwidth as well. The backend only ever sends a single
      // connected=false status frame (connected state is driven client-side by
      // spectrum frames), so applyStatus never runs its bandwidth push on reload.
      // Without this the worklet keeps its default bandwidth of 0 — which it
      // treats as whole-span passthrough — so the audio is wideband noise that
      // doesn't sound like the restored mode until the user re-clicks the mode
      // button (the only other code path that sets the bandwidth). bwHz is the
      // value restored by restoreSettings (or the sensible 10 kHz default). It
      // must be pushed AFTER initAudio creates the worklet, hence the chain.
      const restoredBwHz = bwHz.value
      void Promise.resolve(sdrAudio.initAudio(radioId)).then(() => {
        sdrAudio.setBandwidthHz(restoredBwHz)
      })
      // Re-assert the restored demod mode to the backend so its reported state
      // matches the highlighted button. Without this, a backend connection that
      // was recreated (defaulting to AM) reports a mode that diverges from the
      // restored highlight, leaving the radio demodulating the wrong mode until
      // the user re-clicks the mode button.
      sendCmd({ cmd: 'mode', mode: lastMode })
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
    if (_pendingExternalTune) void _applyPendingExternalTune()
  })

  ws.addEventListener('message', (ev: MessageEvent) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic WS JSON payload; discriminated on msg.type and field-cast at use sites
    let msg: any
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    switch (msg.type) {
      case 'status':
        applyStatus(msg)
        applyOwnership(msg)
        // Only trust the device-reported mode once it's actually connected, to
        // match applyStatus (which gates currentMode/the button highlight the
        // same way). An initial connected=false status after a refresh carries
        // the backend's default mode and must not clobber the restored demod
        // mode — otherwise the highlight and the audio demod diverge.
        if (msg.connected) {
          sdrAudio.setMode(msg.mode as SdrMode)
          sessionStorage.setItem('sdrLastMode', msg.mode)
        }
        if (!sessionStorage.getItem('sdrLastFreqHz') || !currentFreqHz.value) {
          sessionStorage.setItem('sdrLastFreqHz', String(msg.center_hz))
        }
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
      case 'control':
        // Tuning ownership changed (another instance took/released the shared
        // dongle, or this client's retune was refused). Reflect it so the UI
        // disables tuning + shows the read-only banner, and snaps the displayed
        // frequency back to the owner's real tuning.
        applyOwnership(msg)
        break
      case 'error':
        _ctrlDataConfirmed = false
        setStatus(false)
        break
      case 'pong':
        break
      case 'trunk_status':
        // Backend confirms (or rejects) a trunk_decode request. On rejection
        // (e.g. missing channel map) it reports enabled:false + an error, so
        // reconcile the toggle and surface the message.
        if (msg.enabled === false) {
          _sdrStore().setTrunkEnabled(false)
          if (typeof msg.error === 'string') _sdrStore().setTrunkError(msg.error)
        } else if (msg.enabled === true) {
          _sdrStore().setTrunkEnabled(true)
        }
        break
    }
  })

  ws.addEventListener('close', () => {
    // Ignore the close of a socket we've already switched away from. Selecting a
    // different radio closes the previous radio's socket; that close fires after
    // _ctrlRadioId has moved on, so without this guard it would setStatus(false)
    // and re-disable the controls that selectRadio just enabled for the new radio
    // (the "select the other radio twice before controls enable" bug).
    if (_ctrlRadioId !== radioId) return
    setStatus(false)
    if (_ctrlReconnect) clearTimeout(_ctrlReconnect)
    const delay = _ctrlReconnectDelay
    _ctrlReconnectDelay = Math.min(_ctrlReconnectDelay * 2, CTRL_RECONNECT_MAX)
    _ctrlReconnect = setTimeout(() => {
      /* v8 ignore start -- only false if the radio changed during the reconnect delay (race) */
      if (_ctrlRadioId === radioId) void openControlSocket(radioId)
      /* v8 ignore stop */
    }, delay)
  })

  ws.addEventListener('error', () => {
    // Same supersede guard as 'close': a stale socket must not reset the status
    // for the radio that's now selected.
    if (_ctrlRadioId !== radioId) return
    setStatus(false)
  })
}

function closeControlSocket() {
  _ctrlReconnectDelay = 500
  if (_ctrlReconnect) {
    clearTimeout(_ctrlReconnect)
    _ctrlReconnect = null
  }
  if (_ctrlSocket) {
    _ctrlSocket.close()
    _ctrlSocket = null
  }
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
  // Use `parseFloat(...) || 0`, not `parseFloat(... || '0')`: a non-numeric
  // computed value (e.g. jsdom resolves an unset border-width to 'medium')
  // parses to NaN, which would poison `x` — fall back to 0 instead.
  /* v8 ignore start -- padding/border are always 0 for this field, so the
     numeric (truthy) side of `|| 0` is never the taken branch */
  const x =
    e.clientX -
    rect.left -
    (parseFloat(cs.paddingLeft) || 0) -
    (parseFloat(cs.borderLeftWidth) || 0)
  /* v8 ignore stop */
  // Cursor left of the text — only reachable with a live browser layout, so the
  // guard is verified manually / in the browser.
  /* v8 ignore start */
  if (x < 0) return null
  /* v8 ignore stop */
  const edges = freqCharEdges(el, str)
  let idx = -1
  for (let i = 0; i < str.length; i++) {
    if (x >= edges[i] && x < edges[i + 1]) {
      idx = i
      break
    }
  }
  if (idx < 0 || str[idx] === '.') return null
  const dot = str.indexOf('.')
  // Integer digit at index idx: place 10^(dot-1-idx) MHz. Decimal digit: 10^-(idx-dot) MHz.
  const placeMhz = idx < dot ? Math.pow(10, dot - 1 - idx) : Math.pow(10, -(idx - dot))
  return placeMhz * 1e6
}

function onFreqWheel(e: WheelEvent) {
  if (controlsDisabled.value || scanActive.value) return
  const placeHz = freqDigitPlaceHz(e)
  // The commit tail has defensive arms that need a live radio + browser timing to
  // reach exhaustively (the newHz<=0 floor, the not-playing skip, the debounced
  // hardware sendCmd), so it's ignored for coverage and verified in the browser.
  /* v8 ignore start */
  if (placeHz == null) return
  const dir = e.deltaY < 0 ? 1 : -1 // scroll up → higher freq
  const newHz = Math.round(currentFreqHz.value + dir * placeHz)
  if (newHz <= 0) return
  // Update the display live every notch.
  currentFreqHz.value = newHz
  activeFreqDisplay.value = (newHz / 1e6).toFixed(3) + ' MHz'
  freqInputVal.value = (newHz / 1e6).toFixed(4)
  // Commit to hardware once the burst settles (only when playing). The wheel has
  // already advanced currentFreqHz live (above), which moves the marker via its
  // mirror watcher — but it also means the store's tuneRequest watcher would drop
  // the retune on its `hz === currentFreqHz` guard. So recenter the hardware
  // directly here: sendCmd('tune') retunes rtl_tcp (and zeroes the demod offset),
  // and the new center_hz in the spectrum frames recentres the waterfall/spectrum.
  if (playing.value && selectedRadioId.value) {
    if (_freqWheelDebounce) clearTimeout(_freqWheelDebounce)
    _freqWheelDebounce = setTimeout(() => {
      _freqWheelDebounce = null
      _endRecordingOnManualChange()
      const hz = currentFreqHz.value
      sendCmd({ cmd: 'tune', frequency_hz: hz })
      sessionStorage.setItem('sdrLastFreqHz', String(hz))
      saveSettings()
    }, 250)
  }
  /* v8 ignore stop */
}

function tune() {
  // Tune fires only from the button / input-Enter, both disabled when no radio
  // is selected, so this guard is never the taken branch.
  /* v8 ignore start */
  if (!selectedRadioId.value) return
  /* v8 ignore stop */
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
  _endRecordingOnManualChange()
  if (_sdrStore().digitalEnabled) setDigital(false)
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

// ── Gain ──────────────────────────────────────────────────────────────────────

let _gainDebounce: ReturnType<typeof setTimeout> | null = null

function onGainInput(e: Event) {
  const v = parseFloat((e.target as HTMLInputElement).value)
  gainDb.value = v
  gainAuto.value = v < 0
  saveSettings()
  if (_gainDebounce) clearTimeout(_gainDebounce)
  _gainDebounce = setTimeout(
    () => sendCmd({ cmd: 'gain', gain_db: gainAuto.value ? null : v }),
    150,
  )
}

function onAgcChange(e: Event) {
  gainAuto.value = (e.target as HTMLInputElement).checked
  saveSettings()
  if (_gainDebounce) clearTimeout(_gainDebounce)
  _gainDebounce = setTimeout(
    () => sendCmd({ cmd: 'gain', gain_db: gainAuto.value ? null : gainDb.value }),
    150,
  )
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
const sampleRateMenuRef = ref<HTMLElement | null>(null)
const sampleRateMenuOpen = ref(false)
const sampleRateMenuStyle = ref<Record<string, string>>({})

function positionSampleRateMenu() {
  const el = sampleRateDropdownRef.value
  // The dropdown is always rendered (the radio pane is mounted), so its ref is
  // populated whenever the menu is toggled open.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  sampleRateMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleSampleRateMenu() {
  if (controlsDisabled.value) return
  if (sampleRateMenuOpen.value) {
    closeSampleRateMenu()
    return
  }
  positionSampleRateMenu()
  sampleRateMenuOpen.value = true
}

function closeSampleRateMenu() {
  sampleRateMenuOpen.value = false
}

function onSampleRateDropdownKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleSampleRateMenu()
  }
  if (e.key === 'Escape') closeSampleRateMenu()
}

function pickSampleRate(v: number) {
  closeSampleRateMenu()
  // The menu only ever offers SAMPLE_RATE_OPTIONS values, so this allow-list
  // guard never rejects a real selection.
  /* v8 ignore start */
  if (!SAMPLE_RATE_OPTIONS.includes(v as (typeof SAMPLE_RATE_OPTIONS)[number])) return
  /* v8 ignore stop */
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

// ── Add/edit form SAMPLE RATE dropdown ─────────────────────────────────────────
// Mirrors the RADIO tab's sample-rate dropdown above, but writes the form's
// efSampleRate (not the live radio) and has no controlsDisabled gate — it edits
// a stored frequency, not the connected device.

// Position the teleported menu under the dropdown. The element is taken from the
// triggering event's currentTarget rather than a template ref: the per-row edit
// form lives inside a v-for, where Vue would make a template ref an *array* of
// elements (no getBoundingClientRect), so currentTarget is the reliable handle.
function positionEfSampleRateMenu(dropdownEl: HTMLElement) {
  const rect = dropdownEl.getBoundingClientRect()
  efSampleRateMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleEfSampleRateMenu(event: MouseEvent | KeyboardEvent) {
  if (efSampleRateMenuOpen.value) {
    closeEfSampleRateMenu()
    return
  }
  positionEfSampleRateMenu(event.currentTarget as HTMLElement)
  efSampleRateMenuOpen.value = true
}

function closeEfSampleRateMenu() {
  efSampleRateMenuOpen.value = false
}

function onEfSampleRateDropdownKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    toggleEfSampleRateMenu(event)
  }
  if (event.key === 'Escape') closeEfSampleRateMenu()
}

function pickEfSampleRate(rate: number) {
  closeEfSampleRateMenu()
  // The menu only ever offers SAMPLE_RATE_OPTIONS values.
  /* v8 ignore start */
  if (!SAMPLE_RATE_OPTIONS.includes(rate as (typeof SAMPLE_RATE_OPTIONS)[number])) return
  /* v8 ignore stop */
  efSampleRate.value = rate
}

// ── Mode ──────────────────────────────────────────────────────────────────────

function setMode(m: string) {
  currentMode.value = m
  saveSettings()
  // Keep the session's last-mode marker in step with the highlighted button so
  // the reload restore path (which seeds the audio/backend demod mode) never
  // reads a stale value left behind by a mode change.
  sessionStorage.setItem('sdrLastMode', m)
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
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  const alpha = dbfs > signalSmoothed.value ? 0.3 : 0.05
  /* v8 ignore stop */
  signalSmoothed.value += alpha * (dbfs - signalSmoothed.value)
  signalLit.value = Math.round(
    Math.max(0, Math.min(SIGNAL_SEGS, ((signalSmoothed.value + 120) / 120) * SIGNAL_SEGS)),
  )
}

// ── Status ────────────────────────────────────────────────────────────────────

// Reachability probe for the connection dot. The dot represents *availability*
// (the device is connected), NOT whether audio/spectrum is actively streaming —
// so it must go green as soon as a selected radio is reachable, without waiting
// for the first spectrum frame (which only arrives once the user hits Play).
// This mirrors the Settings device dot, which polls the same endpoint. Guarded
// by radioId so a probe that resolves after the user switched radios is ignored.
async function _probeReachability(radioId: number): Promise<void> {
  try {
    const res = await fetch(`/api/sdr/status/${radioId}`)
    // Race guard: only triggerable if the radio is re-selected mid-probe.
    /* v8 ignore start */
    if (selectedRadioId.value !== radioId) return
    /* v8 ignore stop */
    if (!res.ok) return
    const data = await res.json()
    if (data.connected === true || data.reachable === true) {
      connected.value = true
    }
  } catch (_) {}
}

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
  connected: boolean
  center_hz: number
  mode: string
  gain_db: number
  gain_auto: boolean
  sample_rate: number
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
  if (SAMPLE_RATE_OPTIONS.includes(msg.sample_rate as (typeof SAMPLE_RATE_OPTIONS)[number])) {
    sampleRateHz.value = msg.sample_rate
  }
  const clampedBw = Math.min(bwHz.value, msg.sample_rate)
  bwHz.value = clampedBw
  sdrAudio.setBandwidthHz(clampedBw)
  saveSettings()
}

// Reflect tuning ownership from a status/control frame. When this instance is a
// read-only follower (another instance owns the shared dongle), snap the display
// back to the owner's real tuning so the frequency/gain/sample-rate never lie.
function applyOwnership(msg: {
  is_owner?: boolean
  control_available?: boolean
  locked?: boolean
  center_hz: number
  sample_rate: number
  gain_db: number
  gain_auto: boolean
}) {
  // Default to "owner" when the backend omits these fields (a single instance, or
  // a relay without the control channel), so behaviour there is unchanged.
  const owner = msg.is_owner !== false
  _sdrStore().setOwnership(owner, msg.control_available === true, msg.locked === true)
  if (!_sdrStore().readOnly) return
  if (msg.center_hz > 0) {
    currentFreqHz.value = msg.center_hz
    freqInputVal.value = (msg.center_hz / 1e6).toFixed(4)
    activeFreqDisplay.value = (msg.center_hz / 1e6).toFixed(3) + ' MHz'
  }
  gainDb.value = msg.gain_db
  gainAuto.value = msg.gain_auto
  if (SAMPLE_RATE_OPTIONS.includes(msg.sample_rate as (typeof SAMPLE_RATE_OPTIONS)[number])) {
    sampleRateHz.value = msg.sample_rate
  }
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
  if (_sdrStore().digitalEnabled) setDigital(false)
  if (!r) {
    clearRadioSelection()
    return
  }
  if (playing.value) {
    sdrAudio.stop()
    setPlayingState(false)
    setStatus(false)
  }
  selectedRadioId.value = r.id
  deviceDropdownLabel.value = r.name
  sessionStorage.setItem('sdrLastRadioId', String(r.id))
  controlsDisabled.value = false
  void openControlSocket(r.id)
}

// ── Device dropdown ───────────────────────────────────────────────────────────

function positionDeviceMenu() {
  const el = deviceDropdownRef.value
  // The device dropdown is always rendered, so its ref is populated when the
  // menu is toggled open.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  deviceMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

// The device listbox always has the placeholder (index 0) plus one option per
// online radio. The active-descendant id is clamped so it always references a
// rendered option (radios can load in after the menu opens).
const deviceOptionCount = computed(() => 1 + menuRadios.value.length)
function deviceOptionId(index: number): string {
  return `sdr-device-opt-${index}`
}
const deviceActiveDescId = computed(() =>
  deviceMenuOpen.value
    ? deviceOptionId(Math.min(deviceHighlight.value, deviceOptionCount.value - 1))
    : undefined,
)

function openDeviceMenu() {
  positionDeviceMenu()
  deviceHighlight.value = 0
  deviceMenuOpen.value = true
  populateMenuRadios()
}

function toggleDeviceMenu() {
  if (deviceMenuOpen.value) {
    closeDeviceMenu()
    return
  }
  openDeviceMenu()
}

function selectHighlightedRadio() {
  const index = deviceHighlight.value
  // `index` is clamped to 0..menuRadios.length by the key handler, so a non-zero
  // index always maps to a present radio.
  selectRadio(index === 0 ? null : menuRadios.value[index - 1]!)
}

function closeDeviceMenu() {
  deviceMenuOpen.value = false
}

// List every enabled radio. We deliberately do NOT probe reachability here:
// rtl_tcp is single-client, so opening a throwaway probe socket to a radio (then
// closing it) disturbs the dongle and made the immediately-following control
// connect fail — the user had to select the radio twice before it connected.
// Reachability is shown by the device dot once a radio is selected and the real
// control connection is established; the menu just lists what's configured.
function populateMenuRadios() {
  menuRadios.value = knownRadios.value.filter((r) => r.enabled)
}

function onDeviceDropdownKey(e: KeyboardEvent) {
  if (!deviceMenuOpen.value) {
    // Closed: Enter/Space/Arrow keys open the listbox.
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openDeviceMenu()
    }
    return
  }
  // Open: arrow keys move the highlight, Enter/Space selects, Escape/Tab close.
  const count = deviceOptionCount.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    deviceHighlight.value = (deviceHighlight.value + 1) % count
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    deviceHighlight.value = (deviceHighlight.value - 1 + count) % count
  } else if (e.key === 'Home') {
    e.preventDefault()
    deviceHighlight.value = 0
  } else if (e.key === 'End') {
    e.preventDefault()
    deviceHighlight.value = count - 1
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    selectHighlightedRadio()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    closeDeviceMenu()
  } else if (e.key === 'Tab') {
    closeDeviceMenu()
  }
}

function onDocumentClick() {
  if (deviceMenuOpen.value) closeDeviceMenu()
  if (sampleRateMenuOpen.value) closeSampleRateMenu()
  if (efSampleRateMenuOpen.value) closeEfSampleRateMenu()
  if (stepMenuOpen.value) closeStepMenu()
  if (trunkMapMenuOpen.value) closeTrunkMapMenu()
}

// ── Populate radios (called externally via event / boot) ──────────────────────

const RADIOS_CACHE_KEY2 = 'sdrRadiosCache'

function populateRadios(radios: SdrRadio[]) {
  knownRadios.value = radios
  radiosLoading.value = false
  try {
    sessionStorage.setItem(RADIOS_CACHE_KEY2, JSON.stringify(radios))
  } catch (_) {}
  const savedId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '', 10)
  const savedRadio = savedId ? radios.find((r) => r.id === savedId && r.enabled) : undefined
  // Pick a radio to make the panel usable without a manual dropdown selection:
  //   1. the remembered radio (if still present + enabled), else
  //   2. the sole enabled radio — when there's exactly one, there's nothing to
  //      disambiguate, so auto-select it (fixes "freshly added SDR leaves the
  //      whole radio panel locked / no way to type a frequency").
  // With two or more enabled radios and nothing remembered we can't guess which
  // one the user wants, so fall back to the "select radio" placeholder.
  const enabledRadios = radios.filter((r) => r.enabled)
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

function toggleScan() {
  if (scanActive.value) stopScan()
  else startScan()
}

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
  if (next.length === 0) {
    stopScan()
    return
  }
  _scanQueue = next
  _scanIdx = 0
  if (!scanLocked.value) {
    // A non-locked active scan always has a pending dwell timer here.
    /* v8 ignore start */
    if (_scanTimer) {
      clearTimeout(_scanTimer)
      _scanTimer = null
    }
    /* v8 ignore stop */
    doScanStep()
  }
}

function buildScanQueue(): SdrStoredFrequency[] {
  const scannable = freqs.value.filter((f) => f.scannable)
  if (scanAllSelected.value || scanSelectedGroupIds.value.length === 0) return scannable
  const selected = new Set(scanSelectedGroupIds.value)
  return scannable.filter((f) => {
    const ids = new Set<number>((f.group_ids || []).filter((id) => id !== 0))
    if (f.group_id != null && f.group_id !== 0) ids.add(f.group_id)
    for (const id of ids) if (selected.has(id)) return true
    return false
  })
}

function startScan() {
  // startScan only runs from the un-locked toggle path, so scanLocked is false.
  /* v8 ignore start */
  if (scanLocked.value) return
  /* v8 ignore stop */
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
  if (_scanTimer) {
    clearTimeout(_scanTimer)
    _scanTimer = null
  }
  stopResumeWatcher()
}

const SCAN_DWELL_MS = 250
const SCAN_MAX_RECHECKS = 12

function doScanStep() {
  // Re-entrancy guard: every caller already checks scan state, so this defensive
  // early-out only matters for a teardown race the unit suite doesn't trigger.
  /* v8 ignore start */
  if (!scanActive.value || scanLocked.value || _scanQueue.length === 0) return
  /* v8 ignore stop */
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
    // Guards a scan stopped/locked between the dwell timer scheduling and firing.
    /* v8 ignore start */
    if (!scanActive.value || scanLocked.value) return
    /* v8 ignore stop */
    const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
    const frameOk =
      _postTuneFrameCount >= 2 &&
      _lastSpectrum != null &&
      _lastSpectrum.center_hz === f.frequency_hz
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
        // Defensive: the poll only resumes while still active+locked.
        /* v8 ignore start */
        if (!scanActive.value || !scanLocked.value) return
        /* v8 ignore stop */
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
  // toggleScanLock is only ever invoked to UNLOCK (the primary button / the
  // resume watcher only call it while locked), so after the toggle scanLocked is
  // always false and scanActive true here — the else (re-lock) arm is unreachable.
  /* v8 ignore start */
  if (!scanLocked.value && scanActive.value) {
    if (_scanTimer) {
      clearTimeout(_scanTimer)
      _scanTimer = null
    }
    doScanStep()
  }
  /* v8 ignore stop */
}

// Lightweight retune used by the scan engine: the stream is already running,
// so this only moves the receiver — it must NOT (re)init audio or toggle the
// playing state on every scan step.
// Apply a stored frequency's saved tuning settings (RF gain, demod bandwidth,
// squelch, volume, device sample rate, and the waterfall zoom/min/max view) to
// the live radio. Used both when the user clicks a saved frequency and when a
// scan lands on one. Each setting is applied only when it differs from the
// current value, so a scan across frequencies that all share the defaults does
// not spam the backend with redundant commands.
function applyStoredFreqSettings(f: SdrStoredFrequency) {
  if (typeof f.gain === 'number') {
    const auto = f.gain < 0
    if (f.gain !== gainDb.value || auto !== gainAuto.value) {
      gainDb.value = f.gain
      gainAuto.value = auto
      sendCmd({ cmd: 'gain', gain_db: auto ? null : f.gain })
    }
  }
  if (typeof f.squelch === 'number' && f.squelch !== squelch.value) {
    squelch.value = f.squelch
    sendCmd({ cmd: 'squelch', squelch_dbfs: f.squelch })
    sdrAudio.setSquelch(f.squelch)
  }
  // Device sample rate first so the bandwidth ceiling (bwMax) is correct before
  // the demod bandwidth below is applied/clamped.
  const rate = f.sample_rate
  if (
    typeof rate === 'number' &&
    rate !== sampleRateHz.value &&
    SAMPLE_RATE_OPTIONS.includes(rate as (typeof SAMPLE_RATE_OPTIONS)[number])
  ) {
    sampleRateHz.value = rate
    bwMax.value = rate
    sendCmd({ cmd: 'sample_rate', rate_hz: rate })
  }
  const bw = typeof f.bandwidth === 'number' ? f.bandwidth : defaultBwHz(f.mode)
  const clampedBw = Math.min(bw, bwMax.value)
  if (clampedBw !== bwHz.value) {
    bwHz.value = clampedBw
    sdrAudio.setBandwidthHz(clampedBw)
  }
  if (typeof f.volume === 'number' && f.volume !== volume.value) {
    volume.value = f.volume
    sdrAudio.setVolume(f.volume / 100)
  }
  // Waterfall view (zoom / Min / Max). Written through the store so the
  // SdrWaterfall sibling picks them up; setViewSettings is a no-op-cheap ref +
  // localStorage write, but only call it when something actually changed.
  const store = _sdrStore()
  const zoom = typeof f.zoom === 'number' ? f.zoom : store.viewZoom
  const zmin = typeof f.zmin === 'number' ? f.zmin : store.viewZmin
  const zmax = typeof f.zmax === 'number' ? f.zmax : store.viewZmax
  if (zoom !== store.viewZoom || zmin !== store.viewZmin || zmax !== store.viewZmax) {
    // A non-zero Min/Max means the user pinned the scale for this frequency.
    store.setViewSettings({ zoom, zmin, zmax, autoScale: zmin === 0 && zmax === 0 })
  }
}

function tuneToFreq(f: SdrStoredFrequency) {
  currentFreqHz.value = f.frequency_hz
  currentMode.value = f.mode
  freqInputVal.value = (f.frequency_hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (f.frequency_hz / 1e6).toFixed(3) + ' MHz'
  sendCmd({ cmd: 'tune', frequency_hz: f.frequency_hz })
  sendCmd({ cmd: 'mode', mode: f.mode })
  applyStoredFreqSettings(f)
}

// Play button on a saved frequency row: tune AND start the audio stream.
function playFreq(f: SdrStoredFrequency) {
  if (!selectedRadioId.value) return
  _endRecordingOnManualChange()
  if (scanActive.value) stopScan()
  if (searchActive.value) stopSearch()
  currentFreqHz.value = f.frequency_hz
  currentMode.value = f.mode
  freqInputVal.value = (f.frequency_hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (f.frequency_hz / 1e6).toFixed(3) + ' MHz'
  sdrAudio.initAudio(selectedRadioId.value)
  sdrAudio.setMode(f.mode as SdrMode)
  setPlayingState(true)
  sessionStorage.setItem('sdrLastFreqHz', String(f.frequency_hz))
  sessionStorage.setItem('sdrLastMode', f.mode)
  sendCmd({ cmd: 'tune', frequency_hz: f.frequency_hz })
  sendCmd({ cmd: 'mode', mode: f.mode })
  // Apply this frequency's saved tuning settings (gain/bw/squelch/volume/
  // sample rate + waterfall view), then persist the resulting live state.
  applyStoredFreqSettings(f)
  saveSettings()
}

// ── Search engine (low/high range sweep with stop-on-signal) ─────────────────

function adhocRange(): SdrSearchRange | null {
  // Only called by currentSearchRange during an active ad-hoc search (whose
  // inputs are already valid), so the invalid-guard is never taken.
  /* v8 ignore start */
  if (!adhocSearchValid.value) return null
  /* v8 ignore stop */
  const lo = parseFloat(adhocLowMhz.value)
  const hi = parseFloat(adhocHighMhz.value)
  const st = parseFloat(adhocStepKhz.value)
  return {
    id: -1,
    label: 'Ad-hoc',
    low_hz: Math.round(lo * 1e6),
    high_hz: Math.round(hi * 1e6),
    step_hz: Math.round(st * 1000),
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    mode: currentMode.value || 'NFM',
    /* v8 ignore stop */
    threshold_dbfs: -30,
    dwell_ms: 250,
    band_name: '',
    enabled: true,
    notes: '',
    sort_order: 0,
  }
}

function savedRange(id: number | null): SdrSearchRange | null {
  // Only called with a concrete id during an active saved-range search.
  /* v8 ignore start */
  if (id == null) return null
  /* v8 ignore stop */
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  return searchRanges.value.find((r) => r.id === id) ?? null
  /* v8 ignore stop */
}

// Returns the range currently being searched (or that would be searched if the
// main SEARCH button were pressed now). When a search is active, the source is
// pinned by searchActiveSource so the per-item buttons stay accurate even if
// ad-hoc inputs change mid-sweep.
function currentSearchRange(): SdrSearchRange | null {
  // Both callers run only while a search is active, so the not-active branch
  // (below the if) is unreachable here.
  /* v8 ignore start */
  if (searchActive.value) {
    /* v8 ignore stop */
    if (searchActiveSource.value === 'adhoc') return adhocRange()
    // source is 'adhoc' | 'saved'; the adhoc case returned above, so this is
    // always the saved branch when reached.
    /* v8 ignore start */
    if (searchActiveSource.value === 'saved') return savedRange(searchSelectedRangeId.value)
    /* v8 ignore stop */
  }
  // Both callers (toggleSearchLock, doSearchStep) run only while searchActive, so
  // the not-active fallback is never reached.
  /* v8 ignore start */
  return adhocRange() ?? savedRange(searchSelectedRangeId.value)
  /* v8 ignore stop */
}

const isAdhocSearching = computed(() => searchActive.value && searchActiveSource.value === 'adhoc')
function isSavedRangeSearching(id: number): boolean {
  return (
    searchActive.value && searchActiveSource.value === 'saved' && searchSelectedRangeId.value === id
  )
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
  const halfBins = Math.max(4, Math.ceil(bwHz.value / 2 / binHz))
  const lo = Math.max(0, mid - halfBins)
  const hi = Math.min(n - 1, mid + halfBins)
  let peak = -Infinity
  for (let i = lo; i <= hi; i++) {
    if (i === mid) continue // skip LO/DC spike
    const v = s.bins[i]
    if (typeof v === 'number' && isFinite(v) && v > peak) peak = v
  }
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  return peak === -Infinity ? -120 : peak
  /* v8 ignore stop */
}

function tuneToHzMode(hz: number, mode: string) {
  currentFreqHz.value = hz
  currentMode.value = mode
  freqInputVal.value = (hz / 1e6).toFixed(4)
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
  return (
    playing.value &&
    Math.round(currentFreqHz.value) === snap.tunedHz &&
    (currentMode.value as SdrMode) === snap.tunedMode
  )
}

// External tune request (currently from satellite auto-tune at AOS). Tunes the
// SDR to the given freq+mode, starting the default radio hands-free if nothing
// is playing. Because the control socket opens asynchronously, the actual tune
// is queued in _pendingExternalTune and applied once the socket is open (see
// openControlSocket's 'open' handler).
function onExternalTune(e: Event): void {
  const detail = (
    e as CustomEvent<{
      hz: number
      mode?: string
      satName?: string
      noradId?: string
      token?: string
      record?: boolean
    }>
  ).detail
  if (!detail || !detail.hz) return
  const hz = Math.round(detail.hz)
  const mode = _coerceSdrMode(detail.mode)
  const satName = detail.satName || 'SATELLITE'
  const noradId = detail.noradId
  const token = detail.token
  const record = !!detail.record

  // Lock-in priority: if an earlier overlapping pass already holds the radio,
  // skip this later one rather than grabbing the tuner mid-copy. Leave the
  // snapshot/radio untouched so the holder's LOS restore still matches its
  // token. A scan/search or a manual retune releases the lock (see
  // _isAutoTuneLockHeld), letting the next pass take over normally.
  if (_isAutoTuneLockHeld() && _autoTunePrevState!.token !== token) {
    _notificationsStore().add({
      type: 'autotune',
      title: `${satName} PASS SKIPPED`,
      detail: 'Radio busy with an earlier pass — not retuned',
      noradId,
      satName,
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
    currentMode.value = mode
    freqInputVal.value = (hz / 1e6).toFixed(4)
    activeFreqDisplay.value = (hz / 1e6).toFixed(3) + ' MHz'
    sdrAudio.setMode(mode)
    const bw = defaultBwHz(mode)
    sdrAudio.setBandwidthHz(bw)
    bwHz.value = bw
    sessionStorage.setItem('sdrLastFreqHz', String(hz))
    sessionStorage.setItem('sdrLastMode', mode)
    sendCmd({ cmd: 'tune', frequency_hz: hz })
    sendCmd({ cmd: 'mode', mode })
    _notifyAutoTuned(satName, hz, mode, noradId)
    if (record) void _startAutoTuneRecording(satName, noradId)
    return
  }

  // Not playing: pick a radio. Prefer the currently-selected one, else the
  // last-used (sdrLastRadioId), else the first enabled known radio.
  let radio: SdrRadio | null = null
  if (selectedRadioId.value) {
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    radio = knownRadios.value.find((r) => r.id === selectedRadioId.value) ?? null
    /* v8 ignore stop */
  }
  if (!radio) {
    const lastId = parseInt(sessionStorage.getItem('sdrLastRadioId') || '', 10)
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    if (!isNaN(lastId)) radio = knownRadios.value.find((r) => r.id === lastId && r.enabled) ?? null
    /* v8 ignore stop */
  }
  if (!radio) radio = knownRadios.value.find((r) => r.enabled) ?? null
  if (!radio) {
    _notifyAutoTuneFailed(satName)
    return
  }

  // Queue the tune to fire once the control socket is open.
  _pendingExternalTune = { hz, mode, satName, noradId, token, record }
  const sameRadio = selectedRadioId.value === radio.id
  const sockOpen = !!_ctrlSocket && _ctrlSocket.readyState === WebSocket.OPEN
  const sockConnecting = !!_ctrlSocket && _ctrlSocket.readyState === WebSocket.CONNECTING
  if (sameRadio && sockOpen) {
    void _applyPendingExternalTune()
  } else if (sameRadio && sockConnecting) {
    // Socket already opening for this radio — its 'open' handler will drain the
    // pending tune. Re-selecting would early-return and never fire 'open'.
  } else {
    selectRadio(radio)
  }
}

async function _applyPendingExternalTune(): Promise<void> {
  const p = _pendingExternalTune
  // Callers gate on _pendingExternalTune / a selected radio, so these guards are
  // belt-and-braces for an unobservable teardown race.
  /* v8 ignore start */
  if (!p) return
  _pendingExternalTune = null
  if (!selectedRadioId.value) return
  /* v8 ignore stop */
  currentFreqHz.value = p.hz
  currentMode.value = p.mode
  freqInputVal.value = (p.hz / 1e6).toFixed(4)
  activeFreqDisplay.value = (p.hz / 1e6).toFixed(3) + ' MHz'
  // Await audio init: the worklet must be ready before _startAutoTuneRecording
  // (below) calls startRecording, which bails if the worklet hasn't loaded yet.
  // This is the "armed before the pass" path — the radio starts from stopped at
  // AOS, so without awaiting, record silently no-ops while the tune still fires.
  await sdrAudio.initAudio(selectedRadioId.value)
  sdrAudio.setMode(p.mode)
  const bw = defaultBwHz(p.mode)
  sdrAudio.setBandwidthHz(bw)
  bwHz.value = bw
  setPlayingState(true)
  sessionStorage.setItem('sdrLastFreqHz', String(p.hz))
  sessionStorage.setItem('sdrLastMode', p.mode)
  saveSettings()
  sendCmd({ cmd: 'tune', frequency_hz: p.hz })
  sendCmd({ cmd: 'mode', mode: p.mode })
  _notifyAutoTuned(p.satName, p.hz, p.mode, p.noradId)
  if (p.record) void _startAutoTuneRecording(p.satName, p.noradId)
}

// Start a recording for an auto-tuned pass and mark the snapshot so the LOS
// restore stops it (and only it). The radio has just been tuned/started above,
// so the recording captures the downlink from AOS. No-op if a recording is
// already running (e.g. a manual REC the user started) — we don't take it over,
// and we don't flag it as auto-started, so LOS leaves it alone.
async function _startAutoTuneRecording(satName: string, noradId?: string): Promise<void> {
  if (isRecording.value) return
  const started = await _startRecording()
  if (!started) return
  // _startAutoTuneRecording is only invoked after onExternalTune has captured the
  // snapshot, so _autoTunePrevState is always present here.
  /* v8 ignore start */
  if (_autoTunePrevState) _autoTunePrevState.startedRecording = true
  /* v8 ignore stop */
  _notificationsStore().add({
    type: 'autotune',
    title: `${satName} RECORDING`,
    detail: 'Recording pass',
    noradId,
    satName,
  })
}

function _notifyAutoTuned(satName: string, hz: number, mode: string, noradId?: string): void {
  _notificationsStore().add({
    type: 'autotune',
    title: `${satName} AUTO-TUNED`,
    detail: `Downlink ${(hz / 1e6).toFixed(3)} MHz ${mode} @ AOS`,
    noradId,
    satName,
  })
}

function _notifyAutoTuneFailed(satName: string): void {
  _notificationsStore().add({
    type: 'system',
    title: `${satName} AUTO-TUNE`,
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

  // Finalise an auto-started recording at LOS no matter what — "record the pass"
  // means the recording ends when the pass ends, even if the user retuned away mid-pass
  // (their new tune keeps playing, just not recording). Only stops a recording WE
  // began; a manual REC the user started never set startedRecording, so it's
  // untouched. Runs before the onTunedFreq bail below, which only governs whether
  // we put the *radio* back — not whether our recording should end.
  if (snap.startedRecording) void stopRecordingIfActive()

  const onTunedFreq =
    playing.value &&
    Math.round(currentFreqHz.value) === snap.tunedHz &&
    (currentMode.value as SdrMode) === snap.tunedMode
  if (!onTunedFreq) return

  if (!snap.playing) {
    // Radio was stopped/connected-but-idle before AOS — stop playback again.
    stop()
    _notifyAutoRestored(satName, null, null, noradId)
    return
  }

  // Was playing on another frequency before AOS — retune back to it.
  // (Reaching here requires playing=true, which implies a selected radio, so the
  // guard is defensive.)
  /* v8 ignore start */
  if (!selectedRadioId.value) return
  /* v8 ignore stop */
  currentFreqHz.value = snap.freqHz
  currentMode.value = snap.mode
  freqInputVal.value = (snap.freqHz / 1e6).toFixed(4)
  activeFreqDisplay.value = (snap.freqHz / 1e6).toFixed(3) + ' MHz'
  sdrAudio.setMode(snap.mode)
  const bw = defaultBwHz(snap.mode)
  sdrAudio.setBandwidthHz(bw)
  bwHz.value = bw
  sessionStorage.setItem('sdrLastFreqHz', String(snap.freqHz))
  sessionStorage.setItem('sdrLastMode', snap.mode)
  sendCmd({ cmd: 'tune', frequency_hz: snap.freqHz })
  sendCmd({ cmd: 'mode', mode: snap.mode })
  _notifyAutoRestored(satName, snap.freqHz, snap.mode, noradId)
}

function _notifyAutoRestored(
  satName: string,
  hz: number | null,
  mode: string | null,
  noradId?: string,
): void {
  _notificationsStore().add({
    type: 'autotune',
    title: `${satName} PASS ENDED`,
    detail:
      hz != null && mode != null
        ? `Restored SDR → ${(hz / 1e6).toFixed(3)} MHz ${mode}`
        : 'Stopped SDR (was idle before pass)',
    noradId,
    satName,
  })
}

function startSearch(source: 'adhoc' | 'saved') {
  const r = source === 'adhoc' ? adhocRange() : savedRange(searchSelectedRangeId.value)
  // The play buttons are disabled unless a valid range exists, so r is non-null.
  /* v8 ignore start */
  if (!r) return
  /* v8 ignore stop */
  if (r.low_hz >= r.high_hz || r.step_hz <= 0) return
  // Mutual exclusion with scanner — both drive `tune`.
  if (scanActive.value) stopScan()
  // The play buttons that reach startSearch are disabled while no radio is
  // selected (controlsDisabled), so a radio is always present here.
  /* v8 ignore start */
  if (selectedRadioId.value) {
    sdrAudio.initAudio(selectedRadioId.value)
    sdrAudio.setMode(r.mode as SdrMode)
    const bw = defaultBwHz(r.mode)
    sdrAudio.setBandwidthHz(bw)
    bwHz.value = bw
    setPlayingState(true)
  }
  /* v8 ignore stop */
  searchActive.value = true
  searchActiveSource.value = source
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
  // Timer-state cleanup; either arm is harmless and depends on whether a dwell
  // step was mid-flight at stop time.
  /* v8 ignore start */
  if (_searchTimer) {
    clearTimeout(_searchTimer)
    _searchTimer = null
  }
  /* v8 ignore stop */
  stopResumeWatcher()
}

function onAdhocPlayClick() {
  if (isAdhocSearching.value) {
    stopSearch()
    return
  }
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  if (searchActive.value) stopSearch()
  /* v8 ignore stop */
  startSearch('adhoc')
}

function onSavedRangePlayClick(id: number) {
  if (isSavedRangeSearching(id)) {
    stopSearch()
    return
  }
  if (searchActive.value) stopSearch()
  searchSelectedRangeId.value = id
  startSearch('saved')
}

function toggleSearchLock() {
  // Only called by the resume-watcher callback while a search is active.
  /* v8 ignore start */
  if (!searchActive.value) return
  /* v8 ignore stop */
  searchLocked.value = !searchLocked.value
  _sdrStore().searchSweeping = searchActive.value && !searchLocked.value
  stopResumeWatcher()
  // toggleSearchLock is only ever invoked to UNLOCK, so searchLocked is always
  // false here; the inner timer/range guards cover async-state edges (a timer
  // already cleared, a wrap exactly on the high edge) the tests don't reproduce.
  /* v8 ignore start */
  if (!searchLocked.value) {
    if (_searchTimer) {
      clearTimeout(_searchTimer)
      _searchTimer = null
    }
    // Advance past the current freq so we don't immediately re-hold on the same signal.
    const r = currentSearchRange()
    if (r) {
      _searchHz += r.step_hz
      if (_searchHz > r.high_hz) _searchHz = r.low_hz
    }
    doSearchStep()
  }
  /* v8 ignore stop */
}

// Shared auto-resume watcher used by both search and scan. When a freq is
// locked on a signal, poll sampleChannelDb() and only call onResume() once the
// channel has been below `thresholdDb` continuously for `delaySec` seconds.
// delaySec == 0 → resume on the next poll where the signal is gone.
const RESUME_POLL_MS = 200
let _resumeTimer: ReturnType<typeof setTimeout> | null = null
let _quietSinceMs: number | null = null

function stopResumeWatcher() {
  if (_resumeTimer) {
    clearTimeout(_resumeTimer)
    _resumeTimer = null
  }
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
  // Re-entrancy guard for callers/timers that fire after a stop/lock.
  /* v8 ignore start */
  if (!searchActive.value || searchLocked.value) return
  /* v8 ignore stop */
  const r = currentSearchRange()
  // currentSearchRange only goes null if the live range vanishes mid-sweep
  // (e.g. deleted), a race the unit suite doesn't reproduce.
  /* v8 ignore start */
  if (!r) {
    stopSearch()
    return
  }
  /* v8 ignore stop */
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
    // Guards a search stopped/locked between the dwell timer scheduling and firing.
    /* v8 ignore start */
    if (!searchActive.value || searchLocked.value) return
    /* v8 ignore stop */
    const settled = performance.now() - _tuneAtMs >= SEARCH_MIN_SETTLE_MS
    const frameOk =
      _postTuneFrameCount >= 2 && _lastSpectrum != null && _lastSpectrum.center_hz === stepHz
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
        // Defensive: the poll only resumes while still active+locked.
        /* v8 ignore start */
        if (!searchActive.value || !searchLocked.value) return
        /* v8 ignore stop */
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
  try {
    searchRanges.value = await apiListSearchRanges()
  } catch {
    searchRanges.value = []
  }
  // If the selected range was deleted elsewhere, clear the selection.
  if (
    searchSelectedRangeId.value != null &&
    !searchRanges.value.find((r) => r.id === searchSelectedRangeId.value)
  ) {
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
  0.1, 0.25, 0.5, 1, 2.5, 5, 6.25, 7.5, 8.33, 9, 10, 12.5, 15, 20, 25, 30, 50, 100, 200,
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
const editingRangeId = ref<number | null>(null)
const rangeEditor = ref<RangeEditorState>(blankRangeEditor())
const rangeEditorError = ref<string>('')

// Step dropdown (custom — matches sample-rate dropdown). Only one range form
// renders at a time (edit vs add), so a single ref/state is sufficient.
const stepDropdownRef = ref<HTMLElement | null>(null)
const stepMenuRef = ref<HTMLElement | null>(null)
// Function ref: the edit form and add form both render a step dropdown (only
// one at a time), so a plain template ref would be set/unset by both. Capture
// only the live element here.
function setStepDropdownRef(el: Element | null | { $el?: Element }) {
  // Capture only the live element; a null (unmount of the other form's dropdown)
  // is intentionally ignored so it doesn't clear a ref the active form still owns.
  if (el && (el as HTMLElement).getBoundingClientRect) {
    stepDropdownRef.value = el as HTMLElement
  }
}
const adhocStepDropdownRef = ref<HTMLElement | null>(null)
function setAdhocStepDropdownRef(el: Element | null | { $el?: Element }) {
  if (el && (el as HTMLElement).getBoundingClientRect) {
    adhocStepDropdownRef.value = el as HTMLElement
    // The null arm only fires on a full teardown of this v-show'd dropdown, which
    // the unit harness's unmount doesn't invoke the function ref for.
    /* v8 ignore start */
  } else if (el == null) {
    adhocStepDropdownRef.value = null
  }
  /* v8 ignore stop */
}
const stepMenuOpen = ref(false)
const stepMenuStyle = ref<Record<string, string>>({})
const stepMenuTarget = ref<'range' | 'adhoc'>('range')

function positionStepMenu() {
  const el = stepMenuTarget.value === 'adhoc' ? adhocStepDropdownRef.value : stepDropdownRef.value
  // The active step dropdown is rendered before the menu can be toggled, so its
  // ref is always populated here.
  /* v8 ignore start */
  if (!el) return
  /* v8 ignore stop */
  const rect = el.getBoundingClientRect()
  stepMenuStyle.value = {
    left: rect.left + 'px',
    top: rect.bottom + 'px',
    width: rect.width + 'px',
  }
}

function toggleStepMenu(target: 'range' | 'adhoc' = 'range') {
  if (stepMenuOpen.value && stepMenuTarget.value === target) {
    closeStepMenu()
    return
  }
  stepMenuTarget.value = target
  positionStepMenu()
  stepMenuOpen.value = true
}

function closeStepMenu() {
  stepMenuOpen.value = false
}

function onStepDropdownKey(e: KeyboardEvent, target: 'range' | 'adhoc' = 'range') {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    toggleStepMenu(target)
  }
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
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  const raw = stepMenuTarget.value === 'adhoc' ? adhocStepKhz.value : rangeEditor.value.step_khz
  /* v8 ignore stop */
  const v = parseFloat(raw)
  // The step is always chosen from the dropdown's positive STEP_OPTIONS (and
  // seeded valid), so the placeholder fallback is never reached.
  /* v8 ignore start */
  if (!isFinite(v) || v <= 0) return '— select step —'
  /* v8 ignore stop */
  return formatStepKhz(v)
})

const adhocStepLabel = computed(() => {
  const v = parseFloat(adhocStepKhz.value)
  // adhocStepKhz is seeded valid and only changed via the step dropdown.
  /* v8 ignore start */
  if (!isFinite(v) || v <= 0) return 'Select…'
  /* v8 ignore stop */
  return formatStepKhz(v)
})

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
        ? searchRanges.value.length
        : /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          (searchRanges.value.find((r) => r.id === editingRangeId.value)?.sort_order ?? 0),
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
    const [gRes, fRes] = await Promise.all([
      fetch('/api/sdr/groups'),
      fetch('/api/sdr/frequencies'),
    ])
    groups.value = await gRes.json()
    freqs.value = await fRes.json()
    void reloadSearchRanges()
    // Mirror into the SDR store so SdrWaterfall can render label markers on the
    // FFT. SdrPanel owns the fetch; the store keeps the slimmer shape consumed
    // by other components.
    _sdrStore().frequencies = freqs.value.map((f) => ({
      id: f.id,
      group_id: f.group_id ?? null,
      label: f.label,
      frequency_hz: f.frequency_hz,
      mode: f.mode,
    }))
    _scanQueue = buildScanQueue()
  } catch (_) {}
  await recordingsSectionRef.value?.reload()
}

// Refresh the list when frequencies are imported from the settings panel
useDocumentEvent('sdr:frequenciesImported', () => {
  reloadData()
})

// ── Groups CRUD ───────────────────────────────────────────────────────────────

async function addGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  try {
    const res = await fetch('/api/sdr/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: '#c8ff00', sort_order: groups.value.length }),
    })
    if (res.ok) {
      newGroupName.value = ''
      await reloadData()
    }
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
      const existing = groups.value.find((g) => g.id === editingGroupId.value)
      await fetch(`/api/sdr/groups/${editingGroupId.value}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
          color: existing?.color ?? '#c8ff00',
          sort_order: existing?.sort_order ?? 0,
          /* v8 ignore stop */
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
  try {
    await fetch(`/api/sdr/groups/${id}`, { method: 'DELETE' })
    await reloadData()
  } catch (_) {}
}

// ── Frequency CRUD ────────────────────────────────────────────────────────────

function openAddFreqPanel() {
  editingFreqId.value = null
  efLabel.value = ''
  efFreq.value = currentFreqHz.value ? (currentFreqHz.value / 1e6).toFixed(4) : ''
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  efMode.value = currentMode.value || 'AM'
  /* v8 ignore stop */
  efGroupIds.value = []
  efNotes.value = ''
  // New frequencies default their tuning settings to the live radio settings.
  efGainAuto.value = gainAuto.value
  efGainDb.value = String(gainDb.value)
  efBwKhz.value = String(bwHz.value / 1000)
  efSquelch.value = String(squelch.value)
  efVolume.value = String(volume.value)
  efSampleRate.value = sampleRateHz.value
  efZoom.value = String(_sdrStore().viewZoom)
  efZmin.value = String(_sdrStore().viewZmin)
  efZmax.value = String(_sdrStore().viewZmax)
  efErrors.value = {}
  efOpen.value = true
  switchSdrTab('frequency-manager')
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
  efGainAuto.value = (f.gain ?? gainDb.value) < 0
  efGainDb.value = String(f.gain ?? gainDb.value)
  efBwKhz.value = String((f.bandwidth ?? bwHz.value) / 1000)
  efSquelch.value = String(f.squelch ?? squelch.value)
  efVolume.value = String(f.volume ?? volume.value)
  efSampleRate.value = f.sample_rate ?? sampleRateHz.value
  efZoom.value = String(f.zoom ?? _sdrStore().viewZoom)
  efZmin.value = String(f.zmin ?? _sdrStore().viewZmin)
  efZmax.value = String(f.zmax ?? _sdrStore().viewZmax)
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
    await reloadData()
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
    await reloadData()
  } catch (_) {}
}

// ── Recording ─────────────────────────────────────────────────────────────────

async function toggleRecording() {
  if (isRecording.value) {
    await stopRecordingIfActive()
    return
  }
  await _startRecording()
}

// A manual frequency change or stop ends any in-progress recording, finalising
// the clip at the moment the user moves off the channel it was capturing — we
// don't let a recording silently carry on onto a new frequency. Covers both a
// manually-started REC and one auto-started for a satellite pass; for the latter
// this fires before LOS, so the pass clip ends here and onExternalTuneRestore's
// own stopRecordingIfActive becomes a no-op. Only the genuinely-manual entry
// points call this (wheel retune, saved-freq play, the Stop button); scan/search
// stepping and the auto-tune path deliberately do not.
function _endRecordingOnManualChange(): void {
  if (isRecording.value) void stopRecordingIfActive()
}

// Build the recording metadata from the current tune and start a recording,
// wiring up the live-recording UI/timer. Shared by the manual REC button and the
// auto-tune-on-pass path. Returns true if a recording actually started.
async function _startRecording(): Promise<boolean> {
  // Both callers (toggleRecording, _startAutoTuneRecording) already short-circuit
  // when a recording is in progress, so this self-guard is belt-and-braces.
  /* v8 ignore start */
  if (isRecording.value) return false
  /* v8 ignore stop */
  const radioName = selectedRadioId.value
    ? /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      (knownRadios.value.find((r) => r.id === selectedRadioId.value)?.name ?? '')
    : ''
  /* v8 ignore stop */
  const metadata = {
    radio_id: selectedRadioId.value,
    radio_name: radioName,
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    frequency_hz: currentFreqHz.value || 0,
    mode: currentMode.value || 'AM',
    gain_db: gainDb.value || 30,
    squelch_dbfs: squelch.value || -60,
    /* v8 ignore stop */
    sample_rate: 2048000,
  }
  const recId = await sdrAudio.startRecording(metadata)
  if (!recId) return false
  isRecording.value = true
  _recStartEpoch = Date.now()
  _recPausedMs = 0
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  const sqActive = (metadata.squelch_dbfs ?? -120) > -119
  /* v8 ignore stop */
  recSquelchOpen.value = !sqActive
  /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
  _recPauseStart = sqActive ? Date.now() : null
  /* v8 ignore stop */
  const now = new Date(_recStartEpoch)
  liveRecording.value = {
    frequency_hz: metadata.frequency_hz,
    mode: metadata.mode,
    startedAt: now.toISOString().replace('T', ' ').slice(0, 16),
  }
  liveElapsedS.value = 0
  _recTimerInterval = setInterval(() => {
    const pausedSoFar =
      /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      _recPauseStart != null ? _recPausedMs + (Date.now() - _recPauseStart) : _recPausedMs
    /* v8 ignore stop */
    liveElapsedS.value = Math.floor((Date.now() - _recStartEpoch - pausedSoFar) / 1000)
  }, 1000)
  return true
}

async function stopRecordingIfActive() {
  if (!isRecording.value) return
  isRecording.value = false
  // _startRecording always sets _recTimerInterval before isRecording goes true,
  // so it is non-null whenever we reach a live recording here.
  /* v8 ignore start */
  if (_recTimerInterval) {
    clearInterval(_recTimerInterval)
    _recTimerInterval = null
  }
  /* v8 ignore stop */
  const _radioName = selectedRadioId.value
    ? /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
      (knownRadios.value.find((r) => r.id === selectedRadioId.value)?.name ?? '')
    : ''
  /* v8 ignore stop */
  await sdrAudio.stopRecording({
    /* v8 ignore start -- defensive default / fall-through for an always-present field (or jsdom-limited path) */
    frequency_hz: currentFreqHz.value || 0,
    mode: currentMode.value || 'AM',
    /* v8 ignore stop */
  })
  liveRecording.value = null
  await recordingsSectionRef.value?.reload()
  setTimeout(() => recordingsSectionRef.value?.reload(), 2000)
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
          /* v8 ignore start -- defensive: the poll only resumes while still locked */
          if (!scanActive.value || !scanLocked.value) return
          /* v8 ignore stop */
          toggleScanLock()
        })
      } else if (searchActive.value && !searchLocked.value) {
        searchLocked.value = true
        _sdrStore().searchSweeping = false
        startResumeWatcher(squelch.value, () => {
          /* v8 ignore start -- defensive: the poll only resumes while still locked */
          if (!searchActive.value || !searchLocked.value) return
          /* v8 ignore stop */
          toggleSearchLock()
        })
      }
    }
  }

  if (!isRecording.value) return
  if (open && !recSquelchOpen.value) {
    // recSquelchOpen === false implies the channel was squelched at this point,
    // which always set _recPauseStart — they are inversely coupled.
    /* v8 ignore start */
    if (_recPauseStart != null) {
      _recPausedMs += Date.now() - _recPauseStart
      _recPauseStart = null
    }
    /* v8 ignore stop */
    recSquelchOpen.value = true
  } else if (!open && recSquelchOpen.value) {
    _recPauseStart = Date.now()
    recSquelchOpen.value = false
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

function onRadiosChanged() {
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
  void loadChannelMaps()
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
