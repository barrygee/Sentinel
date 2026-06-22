<template>
  <section
    class="sdr-decode-dock"
    :class="{ 'panel-closed': !panelOpen }"
    aria-label="Decoder output"
  >
    <!-- Both panels are shown side by side so decoded calls and raw logs are
         visible at once; each column is an independent region with its own
         header and Clear button. -->
    <div class="sdr-decode-dock-columns">
      <!-- ── Column: decoded messages (structured call rows) ────────────────── -->
      <section class="sdr-decode-dock-column" aria-label="Decoded messages">
        <!-- Empty header keeps this column's body aligned with the logs column,
             whose header carries the sync/trunk status. -->
        <div class="sdr-decode-dock-column-header"></div>

        <div ref="messagesBody" class="sdr-decode-dock-body">
          <table class="sdr-decode-table">
            <caption class="sdr-sr-only">
              Decoded digital calls, newest last
            </caption>
            <!-- Headings are hidden while empty so the placeholder text aligns
                 with the logs column's "No logs to display." -->
            <thead v-if="events.length > 0">
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Mode</th>
                <th scope="col">Talkgroup</th>
                <th scope="col">Source ID</th>
                <th scope="col">CC</th>
                <th scope="col">Sync</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="events.length === 0">
                <td class="sdr-decode-empty" colspan="6">No messages to display.</td>
              </tr>
              <tr v-for="(event, index) in events" :key="`${event.ts}-${index}`">
                <td>{{ formatTime(event.ts) }}</td>
                <td>{{ event.mode ?? '—' }}</td>
                <td>{{ event.talkgroup ?? '—' }}</td>
                <td>{{ event.source ?? '—' }}</td>
                <td>{{ event.color_code ?? '—' }}</td>
                <td>{{ syncLabel(event) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="sdr-decode-dock-column-footer">
          <button
            v-if="events.length > 0"
            class="sdr-decode-clear"
            type="button"
            @click="store.clearDecodeEvents()"
          >
            Clear
          </button>
        </div>
      </section>

      <!-- ── Column: raw decoder logs (verbatim dsd-fme output) ──────────────── -->
      <section class="sdr-decode-dock-column" aria-label="Decoder logs">
        <div class="sdr-decode-dock-column-header">
          <!-- Trunk-tracking indicator: which channel the decoder is currently
               following. aria-live announces grant/return transitions. -->
          <p v-if="trunkEnabled" class="sdr-decode-trunk" aria-live="polite">
            <span class="sdr-decode-dot" :class="trunkDotClass" aria-hidden="true"></span>
            {{ trunkText }}
          </p>

          <!-- aria-live announces sync / decoder-reachability changes without
               re-reading the whole log on every new line. -->
          <p class="sdr-decode-status" aria-live="polite">
            <span class="sdr-decode-dot" :class="statusClass" aria-hidden="true"></span>
            {{ statusText }}
          </p>
        </div>

        <div ref="logsBody" class="sdr-decode-dock-body">
          <!-- aria-live off: the control channel emits many lines per second, so
               announcing each would flood a screen reader — read on demand instead. -->
          <div
            class="sdr-decode-logs"
            role="log"
            aria-live="off"
            aria-label="Raw decoder log, newest last"
          >
            <p v-if="logRows.length === 0" class="sdr-decode-empty">No logs to display.</p>
            <ol v-else class="sdr-decode-log-list">
              <li
                v-for="(row, index) in logRows"
                :key="index"
                class="sdr-decode-log-line"
                :class="{ 'sdr-decode-log-line--error': row.isError }"
              >
                <span v-if="row.isError" class="sdr-sr-only">Error: </span>{{ row.line }}
              </li>
            </ol>
          </div>
        </div>

        <div class="sdr-decode-dock-column-footer">
          <button
            v-if="logRows.length > 0"
            class="sdr-decode-clear"
            type="button"
            @click="store.clearDecodeLogs()"
          >
            Clear
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useSdrStore } from '@/stores/sdr'
import type { DecodeEvent } from '@/stores/sdr'

const store = useSdrStore()

// The store buffers newest-first (so the cap drops the oldest); the UI shows
// newest LAST, so reverse a copy for display and keep the latest row pinned at
// the bottom (see the scroll-to-bottom watchers).
const events = computed<DecodeEvent[]>(() => [...store.decodeEvents].reverse())

// dsd-fme flags decode problems with these tokens (e.g. "DCH (CRC ERR)",
// "Sync: no sync"). Lines matching any are rendered red. Word-boundaried so
// "err" only matches as a standalone token, not inside unrelated words.
const ERROR_LOG_PATTERN =
  /\b(?:err|error|errors|fail|failed|failure|no sync|sync lost|invalid|timeout|unable|cannot)\b/i
const logRows = computed(() =>
  store.decodeLogs.map((line) => ({ line, isError: ERROR_LOG_PATTERN.test(line) })).reverse(),
)

// Scrollable bodies for each column; after new rows arrive we pin both to the
// bottom so the most recent entry is always visible (newest-last ordering).
const messagesBody = ref<HTMLElement | null>(null)
const logsBody = ref<HTMLElement | null>(null)
function scrollToBottom(element: HTMLElement | null): void {
  /* v8 ignore start -- template refs are always bound when this runs; the null
     guard is purely defensive */
  if (!element) return
  /* v8 ignore stop */
  element.scrollTop = element.scrollHeight
}
watch(events, () => nextTick(() => scrollToBottom(messagesBody.value)))
watch(logRows, () => nextTick(() => scrollToBottom(logsBody.value)))

// Live status, derived from reachability first then sync. Stated as text (not
// colour alone) so it is meaningful without seeing the dot.
const statusText = computed(() => {
  if (!store.decoderReachable) return 'Decoder offline'
  return store.decodeSync ? 'Synced — decoding' : 'No sync'
})
const statusClass = computed(() => {
  if (!store.decoderReachable) return 'sdr-decode-dot--offline'
  return store.decodeSync ? 'sdr-decode-dot--synced' : 'sdr-decode-dot--idle'
})

// Trunk-tracking indicator. While following a system, show whether the decoder
// is parked on the control channel or has followed a grant to a voice channel,
// and the frequency in MHz.
const trunkEnabled = computed(() => store.trunkEnabled)
function formatMhz(frequencyHz: number): string {
  return `${(frequencyHz / 1e6).toFixed(4)} MHz`
}
const trunkText = computed(() => {
  if (store.trunkFollowedHz === null) return 'Trunking — waiting for control channel'
  if (store.trunkOnControlChannel) return `Control channel — ${formatMhz(store.trunkFollowedHz)}`
  return `Following call — ${formatMhz(store.trunkFollowedHz)}`
})
const trunkDotClass = computed(() =>
  store.trunkFollowedHz !== null && !store.trunkOnControlChannel
    ? 'sdr-decode-dot--synced'
    : 'sdr-decode-dot--idle',
)

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], { hour12: false })
}
function syncLabel(event: DecodeEvent): string {
  if (event.sync === true) return 'Yes'
  if (event.sync === false) return 'No'
  return '—'
}

// Track the SDR side panel open/closed state so the dock's left edge lines up
// with the waterfall (mirrors SdrWaterfall's own tracking).
function readSidebarOpen(): boolean {
  try {
    return sessionStorage.getItem('sentinel_sidebar_open') === '1'
  } catch {
    /* v8 ignore next -- sessionStorage only throws in locked-down privacy modes */
    return false
  }
}
const panelOpen = ref<boolean>(readSidebarOpen())
function onSidebarState(domEvent: Event) {
  panelOpen.value = !!(domEvent as CustomEvent<{ open: boolean }>).detail?.open
}
onMounted(() => {
  document.addEventListener('sentinel:sidebar-state', onSidebarState)
  // Start pinned to the most recent entry in each column.
  scrollToBottom(messagesBody.value)
  scrollToBottom(logsBody.value)
})
onUnmounted(() => document.removeEventListener('sentinel:sidebar-state', onSidebarState))
</script>

<style scoped>
/* Fixed strip docked at the bottom of the SDR page, below the waterfall. Its
   height (--sdr-dock-height, defined on #sdr-page) is ~1/3 of the waterfall's
   height; the waterfall raises its own bottom by the same amount when open. The
   left edge follows the side panel (430px open / 44px tab-rail closed).

   The boxes are inset to line up with the waterfall DISPLAY (the sigplot data
   box), not the waterfall element. The insets are published live by
   #sdr-waterfall (syncBandInset → :root CSS vars); fallbacks are the default
   sigplot margins:
   - left: the spectrum's dB-axis gutter (sigplot _Mx.l, ~56px).
   - right: the freq-label gutter (sigplot, ~12px) plus the 44px slider-control
     column (#sdr-waterfall padding-right). */
.sdr-decode-dock {
  position: fixed;
  left: 430px;
  right: 0;
  bottom: var(--footer-height);
  height: var(--sdr-dock-height);
  transition: left 0.2s ease;
  display: flex;
  flex-direction: column;
  background: #0a0d14;
  padding-left: var(--sdr-wf-inset-left, 56px);
  padding-right: calc(44px + var(--sdr-wf-inset-right, 12px));
  box-sizing: border-box;
  z-index: 2;
}

.sdr-decode-dock.panel-closed {
  left: 44px;
}

/* The two panels sit side by side, each filling half the dock width and
   scrolling independently. */
.sdr-decode-dock-columns {
  flex: 1;
  min-height: 0;
  display: flex;
}

.sdr-decode-dock-column {
  flex: 1 1 50%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Header carries the logs column's sync/trunk status; the messages column's is
   empty but kept (with a matching min-height) so both bodies start at the same
   y. No borders — the boxes are free of horizontal/vertical rules. */
.sdr-decode-dock-column-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 1.6rem;
  padding: 0.3rem 0.45rem;
  flex: none;
}

/* Footer sits below the scrolling list and holds that column's Clear button.
   No top border — boxes are kept free of horizontal rules. */
.sdr-decode-dock-column-footer {
  display: flex;
  justify-content: flex-end;
  padding: 0.3rem 0.45rem;
  flex: none;
}

/* Status text ("No sync" / "Synced — decoding") matches the case and font of the
   column-heading labels: 9px Barlow, weight 400, 0.18em tracking, uppercase. */
.sdr-decode-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  margin-left: auto;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #cfd6dd;
}

/* Trunk indicator sits just left of the sync status (which keeps margin-left
   auto, pushing both to the right edge of the header). Same label styling. */
.sdr-decode-trunk {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0 auto;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #cfd6dd;
}

.sdr-decode-trunk + .sdr-decode-status {
  margin-left: 0.75rem;
}

.sdr-decode-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  flex: none;
}

.sdr-decode-dot--offline {
  background: #6b7480;
}
.sdr-decode-dot--idle {
  background: #e0a23c;
}
.sdr-decode-dot--synced {
  background: #5ad17a;
}

/* Flat-dark action button, matching .sdr-mode-pill used across the panel. */
.sdr-decode-clear {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  height: 24px;
  padding: 0 0.7rem;
  margin: 0.25rem;
  cursor: pointer;
  flex: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.sdr-decode-clear:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* Each tab panel fills the remaining dock height and scrolls internally
   (vertically through rows, horizontally for long single-line log entries). */
.sdr-decode-dock-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.sdr-decode-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 0.72rem;
  color: #cfd6dd;
}

/* No horizontal separators between rows — the row padding alone provides the
   spacing (per design). */
.sdr-decode-table th,
.sdr-decode-table td {
  text-align: left;
  padding: 0.55rem 0.45rem;
}

/* Column headings match the side-panel field labels (SAMPLE RATE / BANDWIDTH):
   9px Barlow, weight 400, 0.18em tracking, uppercase, white. */
.sdr-decode-table thead th {
  position: sticky;
  top: 0;
  background: #0a0d14;
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 9px;
  font-weight: 400;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #fff;
  /* Extra space below the heading row so it is not crowded against the first
     decoded message. */
  padding-bottom: 1rem;
}

/* Empty-state text matches the side-panel "No alerts" label (#msb-alerts-empty):
   10px Barlow, weight 400, 0.14em tracking, uppercase. */
.sdr-decode-empty {
  font-family: var(--font-primary, 'Barlow', sans-serif);
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8b95a1;
  padding: 0.4rem 0.45rem;
}

.sdr-decode-logs {
  height: 100%;
}

.sdr-decode-log-list {
  list-style: none;
  margin: 0;
  padding: 0.2rem 0.45rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  /* Size to the widest line (but never narrower than the panel) so each line
     stays on one row and the body scrolls horizontally instead of wrapping. */
  width: max-content;
  min-width: 100%;
}

.sdr-decode-log-line {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.68rem;
  line-height: 1.4;
  color: #b6c2cf;
  /* One line per entry: preserve dsd-fme's leading spaces/brackets and never
     wrap; overflow scrolls horizontally on the body. */
  white-space: pre;
  padding: 0.05rem 0.1rem;
}

/* Error lines (CRC errors, lost sync, …): red, plus a left accent bar and an
   sr-only "Error:" prefix so it is not colour-alone. #ff6b6b clears AA. */
.sdr-decode-log-line--error {
  color: #ff6b6b;
  border-left: 2px solid #ff6b6b;
  padding-left: 0.3rem;
}

/* Scrollbars are hidden in both boxes — the bodies still scroll (and stay
   pinned to the newest row), the bar itself is just not drawn. */
.sdr-decode-dock-body {
  scrollbar-width: none;
}
.sdr-decode-dock-body::-webkit-scrollbar {
  display: none;
}

/* Visually-hidden but available to assistive tech. */
.sdr-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
