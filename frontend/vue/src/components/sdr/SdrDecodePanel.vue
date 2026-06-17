<template>
  <section class="sdr-decode-panel" aria-labelledby="sdr-decode-heading">
    <div class="sdr-decode-header">
      <h3 id="sdr-decode-heading" class="sdr-field-label">DECODED</h3>
      <button class="sdr-decode-clear" type="button" :disabled="events.length === 0" @click="clear">
        Clear
      </button>
    </div>

    <!-- Live status. aria-live announces sync / decoder-reachability changes to
         screen readers without re-reading the whole table on every new row. -->
    <p class="sdr-decode-status" aria-live="polite">
      <span class="sdr-decode-dot" :class="statusClass" aria-hidden="true"></span>
      {{ statusText }}
    </p>

    <!-- The data-table equivalent of the live event stream. A real <table> with
         a caption + header row keeps the decode output operable by assistive
         tech (the canvas waterfall is opaque to it). -->
    <table class="sdr-decode-table">
      <caption class="sdr-sr-only">
        Decoded digital calls, newest first
      </caption>
      <thead>
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
          <td class="sdr-decode-empty" colspan="6">No decoded events yet.</td>
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
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useSdrStore } from '@/stores/sdr'
import type { DecodeEvent } from '@/stores/sdr'

const store = useSdrStore()

const events = computed<DecodeEvent[]>(() => store.decodeEvents)

// Human-readable live status, derived from reachability first then sync. Stated
// as text (not colour alone) so it is meaningful without seeing the dot.
const statusText = computed(() => {
  if (!store.decoderReachable) return 'Decoder offline'
  return store.decodeSync ? 'Synced — decoding' : 'No sync'
})
const statusClass = computed(() => {
  if (!store.decoderReachable) return 'sdr-decode-dot--offline'
  return store.decodeSync ? 'sdr-decode-dot--synced' : 'sdr-decode-dot--idle'
})

function formatTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], { hour12: false })
}

function syncLabel(event: DecodeEvent): string {
  if (event.sync === true) return 'Yes'
  if (event.sync === false) return 'No'
  return '—'
}

function clear() {
  store.clearDecodeEvents()
}
</script>

<style scoped>
.sdr-decode-panel {
  margin-top: 0.75rem;
}

.sdr-decode-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.4rem;
}

.sdr-decode-clear {
  background: transparent;
  border: 1px solid rgba(100, 200, 255, 0.4);
  color: #64c8ff;
  border-radius: 3px;
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}

.sdr-decode-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.sdr-decode-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.4rem;
  font-size: 0.75rem;
  color: #cfd6dd;
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

.sdr-decode-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.72rem;
  color: #cfd6dd;
}

.sdr-decode-table th,
.sdr-decode-table td {
  text-align: left;
  padding: 0.2rem 0.35rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.sdr-decode-table th {
  color: #8b95a1;
  font-weight: 600;
}

.sdr-decode-empty {
  color: #8b95a1;
  font-style: italic;
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
