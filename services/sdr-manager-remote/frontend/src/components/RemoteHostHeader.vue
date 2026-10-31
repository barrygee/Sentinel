<template>
  <div ref="rootElement" class="remote-host-header">
    <div class="remote-host-header-row">
      <button
        type="button"
        class="remote-host-header-toggle"
        :class="{ 'remote-host-header-toggle--dim': confirming }"
        :aria-expanded="expanded"
        :aria-controls="controlsId"
        @click="emit('toggle')"
      >
        <span class="remote-host-header-name">{{ hostLabel }}</span>
        <span v-if="!host.is_local" class="remote-host-header-address"
          >{{ host.address }}:{{ host.port }}</span
        >
        <span v-else-if="!host.enabled" class="remote-host-header-address">not running</span>
        <span class="remote-host-header-address">{{ sdrCountText }}</span>
        <!-- Placed at the row's right end (after edit/remove) but inside the
             button, so clicking it still opens and folds the host. -->
        <span
          class="remote-host-header-chevron"
          :class="{ 'remote-host-header-chevron--open': expanded }"
        >
          <ChevronIcon />
        </span>
      </button>
      <template v-if="!confirming">
        <button
          class="sdr-device-btn"
          :class="{ 'sdr-device-btn--active': open }"
          title="Edit"
          :aria-label="`Edit ${hostLabel}`"
          :aria-expanded="open"
          @click="toggleEdit"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path
              d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        <!-- This machine is linked, not added: sdr-manager-remote keeps its
             row while sdr-manager-local is deployed, so it has no remove. -->
        <button
          v-if="!host.is_local"
          class="sdr-device-btn sdr-device-btn--danger"
          title="Remove"
          :aria-label="`Remove ${hostLabel}`"
          @click="startRemove"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <line
              x1="2.5"
              y1="2.5"
              x2="10.5"
              y2="10.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
            <line
              x1="10.5"
              y1="2.5"
              x2="2.5"
              y2="10.5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </template>
      <div v-else class="sdr-device-confirm" style="display: flex">
        <span class="sdr-device-confirm-label">REMOVE?</span>
        <button class="sdr-device-confirm-btn sdr-device-confirm-btn--yes" @click="confirmRemove">
          YES
        </button>
        <button class="sdr-device-confirm-btn" @click="confirming = false">NO</button>
      </div>
    </div>
    <p v-if="host.last_error" class="remote-host-header-error">{{ host.last_error }}</p>
    <p v-if="hostEdits.drafts.has(host.id)" class="remote-host-header-staged">
      EDITED — APPLY TO SAVE
    </p>
    <div v-if="open" class="sdr-device-item sdr-device-item--open">
      <RemoteHostForm
        :host="host"
        :staged-draft="hostEdits.drafts.get(host.id) ?? null"
        :apply-error="applyError"
        @draft="onDraft"
        @cancel="cancelEdit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostHeader` — one SDR host as an accordion title in Settings › SDR's
 * radios list, above that host's SDRs: its name and address
 * (or "This machine") and how many SDRs it has, as the button that opens and
 * folds them (the list itself is the radios card's, `controlsId`, opened and
 * folded through `toggle`); then its last error, and edit/remove. Edit opens `RemoteHostForm`
 * below the title; its edits are staged for APPLY CHANGES (`stage`), removing
 * acts at once. This machine's own host (`is_local`) can't be removed.
 *
 * The SDR section renders it through the `radioSites` capability's
 * `hostEditor` (it may not import this package), and announces nothing
 * itself: every change here goes out through `announceHostsChanged`, which
 * the section listens to.
 *
 * A host marker's MORE on a map opens Settings › SDR on its host
 * (`openSdrManagerHost`): the header for that host opens its form, scrolls
 * itself into view and clears the request.
 */
import { computed, nextTick, ref, watch } from 'vue'
import ChevronIcon from '@sentinel/ui/icons/ChevronIcon.vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useStagedEdits } from '@sentinel/shell-api/settings/useStagedEdits'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import RemoteHostForm from './RemoteHostForm.vue'
import { deleteHost } from '../api/sdrManagerRemoteApi'
import { announceHostsChanged } from '../hostsChanged'
import { saveRemoteHostDraft, type RemoteHostDraft } from '../remoteHostEdits'

const props = defineProps<{
  host: SdrManagerHost
  /** Whether the host's SDRs are showing. */
  expanded: boolean
  /** How many SDRs the host has, or null until it has answered. */
  sdrCount: number | null
  /** The id of the list of this host's SDRs, which the title opens and folds. */
  controlsId: string
}>()
const emit = defineEmits<{
  stage: [apply: () => Promise<void>]
  /** Open or fold the host's SDRs. */
  toggle: []
}>()

const sdrCountText = computed(() => {
  if (props.sdrCount === null) return ''
  return props.sdrCount === 1 ? '1 SDR' : `${props.sdrCount} SDRs`
})

const settingsStore = useSettingsStore()
const rootElement = ref<HTMLElement | null>(null)
const open = ref(false)
const confirming = ref(false)
/** Why APPLY CHANGES could not save this host's edit. */
const applyError = ref<string | null>(null)

/** This machine's host reads "This machine" unless the operator labelled it. */
const hostLabel = computed(
  () => props.host.name || (props.host.is_local ? 'This machine' : props.host.address),
)

function toggleEdit(): void {
  open.value = !open.value
}

function startRemove(): void {
  confirming.value = true
  open.value = false
}

async function confirmRemove(): Promise<void> {
  try {
    await deleteHost(props.host.id)
    confirming.value = false
    announceHostsChanged()
  } catch {
    /* leave the confirm row up — the operator can retry or cancel */
  }
}

async function saveHostEdit(_hostId: number, draft: RemoteHostDraft): Promise<void> {
  try {
    await saveRemoteHostDraft(props.host, draft)
    applyError.value = null
  } catch (error) {
    applyError.value = (error as Error).message
    throw error
  }
}

const hostEdits = useStagedEdits<number, RemoteHostDraft>({
  save: saveHostEdit,
  stage: (applyAll) =>
    emit('stage', async () => {
      try {
        await applyAll()
        open.value = false
      } catch (error) {
        // Keep the refused edit's form open, showing why.
        open.value = true
        throw error
      } finally {
        announceHostsChanged()
      }
    }),
})

function onDraft(draft: RemoteHostDraft | null): void {
  if (draft) hostEdits.set(props.host.id, draft)
  else hostEdits.discard(props.host.id)
}

function cancelEdit(): void {
  hostEdits.discard(props.host.id)
  applyError.value = null
  open.value = false
}

// Reopening the panel drops unapplied edits (useStagedEdits): close the form
// and clear an old refusal. A map marker opening the panel on this host
// reopens the form straight after, through the focus watch below.
watch(
  () => settingsStore.open,
  (panelOpen) => {
    if (!panelOpen) return
    open.value = false
    applyError.value = null
  },
  { flush: 'sync' },
)

watch(
  () => settingsStore.focusSdrManagerHostId,
  async (focusHostId) => {
    if (focusHostId !== props.host.id) return
    open.value = true
    confirming.value = false
    settingsStore.clearSdrManagerHostFocus()
    await nextTick()
    rootElement.value?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true },
)
</script>

<style scoped>
.remote-host-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* Room on the right for the chevron, which sits past edit/remove. */
.remote-host-header-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 32px;
  padding-right: 26px;
}
.remote-host-header-toggle {
  display: inline-flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 32px;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
}
.remote-host-header-toggle:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 4px;
}
.remote-host-header-toggle--dim {
  opacity: 0.4;
}
/* The app's accordion chevron (the SDR panel's section headers): pointing
   right and faint while folded, down in the accent colour while open, and lit
   on hover to preview that. */
.remote-host-header-chevron {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  padding: 0 6px;
  color: rgba(var(--ink-rgb), 0.25);
  transform: rotate(-90deg);
  transition:
    transform 0.2s ease,
    color 0.15s;
  pointer-events: none;
}
.remote-host-header-toggle:hover .remote-host-header-chevron,
.remote-host-header-chevron--open {
  color: var(--accent-text);
}
.remote-host-header-chevron--open {
  transform: rotate(0deg);
}
@media (prefers-reduced-motion: reduce) {
  .remote-host-header-chevron {
    transition: none;
  }
}
/* A step below the SENTINEL HOSTS heading it sits under: body size, and the
   host's name as the operator typed it (no uppercasing). */
.remote-host-header-name {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.remote-host-header-address {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  letter-spacing: 0.04em;
  color: var(--ink-secondary);
}
.remote-host-header-error,
.remote-host-header-staged {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
}
/* --danger-strong, not --danger: body text on the light settings canvas
   needs AA contrast (about 5.9:1 here, against --danger's 4:1). */
.remote-host-header-error {
  color: var(--danger-strong);
}
.remote-host-header-staged {
  font-size: var(--settings-text-caption);
  color: var(--ink-secondary);
}
</style>
