<template>
  <div class="sdr-devices-wrap">
    <LocalNotEnabledNotice v-if="hostsLoaded && !localRunning" />
    <div class="sdr-devices-list">
      <div v-if="hosts.length === 0" class="sdr-devices-empty">
        No SDR hosts registered. Add one below.
      </div>
      <div
        v-for="host in orderedHosts"
        :key="host.id"
        :ref="(el) => registerRow(host.id, el as HTMLElement | null)"
        class="sdr-device-item"
        :class="{ 'sdr-device-item--open': openId === host.id }"
      >
        <div class="sdr-device-row">
          <span class="sdr-device-info" :style="confirmId === host.id ? 'opacity:0.4' : ''">
            <SdrSourceStatusDot :connected="host.reachable" />
            <template v-if="host.is_local">
              {{ hostLabel(host) }}
              <span v-if="!host.enabled" class="remote-host-local-off">— not running</span>
            </template>
            <template v-else>
              {{ hostLabel(host) }}&nbsp;&nbsp;{{ host.address }}:{{ host.port }}
            </template>
            <span v-if="host.last_error" class="remote-host-error"> — {{ host.last_error }} </span>
            <span v-if="hostEdits.drafts.has(host.id)" class="remote-host-staged">
              EDITED — APPLY TO SAVE
            </span>
          </span>
          <button
            v-if="confirmId !== host.id"
            class="sdr-device-btn"
            :class="{ 'sdr-device-btn--active': openId === host.id }"
            title="Edit"
            :aria-label="`Edit ${hostLabel(host)}`"
            @click="toggleEdit(host.id)"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path
                d="M9.5 1.5L11.5 3.5L4.5 10.5H2.5V8.5L9.5 1.5Z"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          <!-- This machine is linked, not added: sdr-manager-remote keeps its
               row while sdr-manager-local is deployed, so it has no delete. -->
          <button
            v-if="confirmId !== host.id && !host.is_local"
            class="sdr-device-btn sdr-device-btn--danger"
            title="Delete"
            :aria-label="`Delete ${hostLabel(host)}`"
            @click="startDelete(host.id)"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
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
          <div v-if="confirmId === host.id" class="sdr-device-confirm" style="display: flex">
            <span class="sdr-device-confirm-label">DELETE?</span>
            <button
              class="sdr-device-confirm-btn sdr-device-confirm-btn--yes"
              @click="confirmDelete(host.id)"
            >
              YES
            </button>
            <button class="sdr-device-confirm-btn" @click="confirmId = null">NO</button>
          </div>
        </div>
        <RemoteHostForm
          v-if="openId === host.id"
          :host="host"
          :staged-draft="hostEdits.drafts.get(host.id) ?? null"
          :apply-error="applyErrors[host.id] ?? null"
          @draft="(draft) => onDraft(host.id, draft)"
          @cancel="cancelEdit(host.id)"
        />
      </div>

      <div
        v-if="openId === 'new'"
        class="sdr-device-item sdr-device-item--open sdr-device-item--new"
      >
        <RemoteHostForm :host="null" @save="onSave" @cancel="openId = null" />
      </div>
    </div>
    <BaseButton variant="ghost" class="sdr-devices-add-btn" @click="toggleNew"
      >+ ADD SDR HOST</BaseButton
    >
  </div>
</template>

<script setup lang="ts">
/**
 * `RemoteHostsControl` — the REMOTE SDR HOSTS group of Settings › SDR Manager
 * (ADR 0007): every SDR host sdr-manager-remote manages, each with a
 * reachability dot, an inline edit/delete affordance, and an "+ ADD SDR HOST"
 * action that opens `RemoteHostForm`. Same list/edit/delete/confirm shape and
 * `.sdr-devices-*`/`.sdr-device-*` chrome (SettingsPanel.css) as the SDR
 * section's DEVICES list.
 *
 * This machine's own sdr-manager-local (`is_local`), which sdr-manager-remote
 * links from core's registry, is listed first as "This machine" (unless the
 * operator labelled it) with no delete: the link keeps that row, and the API
 * refuses to delete it.
 *
 * Expanding a row shows `RemoteHostForm`, which carries both the editable
 * fields and (in its own `MORE` disclosure) everything else known
 * about that host. Edits to a host are staged for APPLY CHANGES
 * (`useStagedEdits`, the card's `stage` event); adding and deleting a host act
 * at once.
 *
 * Announces every add/edit/delete (`announceHostsChanged`), so the SDR
 * section's DEVICES list, which groups radios by host and subscribes through
 * the `radioSites` capability, picks up the change without polling this
 * control's own state.
 */
import { computed, reactive, ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useStagedEdits } from '@sentinel/shell-api/settings/useStagedEdits'
import SdrSourceStatusDot from '@sentinel/ui/sdr/SdrSourceStatusDot.vue'
import LocalNotEnabledNotice from './LocalNotEnabledNotice.vue'
import RemoteHostForm from './RemoteHostForm.vue'
import { listHosts, deleteHost } from '../api/sdrManagerRemoteApi'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import { announceHostsChanged } from '../hostsChanged'
import { saveRemoteHostDraft, type RemoteHostDraft } from '../remoteHostEdits'

const emit = defineEmits<{ stage: [apply: () => Promise<void>] }>()

const settingsStore = useSettingsStore()

const hosts = ref<SdrManagerHost[]>([])
// Until the first list arrives nothing is known, so the not-enabled notice waits.
const hostsLoaded = ref(false)
/**
 * Whether this machine's sdr-manager-local is running. sdr-manager-remote
 * links it as the enabled `is_local` row and disables (never deletes) that
 * row while it is absent, so its row says whether it runs.
 */
const localRunning = computed(() => hosts.value.some((host) => host.is_local && host.enabled))
const openId = ref<number | 'new' | null>(null)
const confirmId = ref<number | null>(null)

// Row elements by host id, so a host arrived at from a map marker can be
// scrolled into view inside the settings panel's own scroller.
const rowElements = new Map<number, HTMLElement>()

function registerRow(hostId: number, element: HTMLElement | null): void {
  if (element) rowElements.set(hostId, element)
  else rowElements.delete(hostId)
}

// Guards the periodic reachability refresh the same way SdrDevicesControl
// guards its status poll — a slow tick must never stack on top of another.
let refreshInFlight = false

async function load(): Promise<void> {
  if (refreshInFlight) return
  refreshInFlight = true
  try {
    hosts.value = await listHosts()
    hostsLoaded.value = true
  } catch {
    /* offline / transient — keep the previous list rather than blanking it */
  } finally {
    refreshInFlight = false
  }
}

function toggleEdit(id: number): void {
  openId.value = openId.value === id ? null : id
  confirmId.value = null
}

function toggleNew(): void {
  openId.value = openId.value === 'new' ? null : 'new'
  confirmId.value = null
}

function startDelete(id: number): void {
  confirmId.value = id
  openId.value = null
}

/** This machine's row reads "This machine" unless the operator labelled it. */
function hostLabel(host: SdrManagerHost): string {
  return host.name || (host.is_local ? 'This machine' : host.address)
}

// This machine first, then the hosts in the order they were added.
const orderedHosts = computed(() => [
  ...hosts.value.filter((host) => host.is_local),
  ...hosts.value.filter((host) => !host.is_local),
])

async function confirmDelete(id: number): Promise<void> {
  try {
    await deleteHost(id)
    confirmId.value = null
    await load()
    announceHostsChanged()
  } catch {
    /* leave the confirm row up — the operator can retry or cancel */
  }
}

async function onSave(): Promise<void> {
  openId.value = null
  await load()
  announceHostsChanged()
}

/** Why APPLY CHANGES could not save each host's edit. */
const applyErrors = reactive<Record<number, string>>({})

async function saveHostEdit(hostId: number, draft: RemoteHostDraft): Promise<void> {
  const host = hosts.value.find((candidate) => candidate.id === hostId)
  // Deleted since it was edited: nothing left to save.
  if (!host) return
  try {
    await saveRemoteHostDraft(host, draft)
    delete applyErrors[hostId]
  } catch (error) {
    applyErrors[hostId] = (error as Error).message
    throw error
  }
}

const hostEdits = useStagedEdits<number, RemoteHostDraft>({
  save: saveHostEdit,
  stage: (applyAll) =>
    emit('stage', async () => {
      try {
        await applyAll()
        openId.value = null
      } catch (error) {
        // Show the first host that was refused; the others keep their drafts too.
        const [firstRefused] = Object.keys(applyErrors)
        if (firstRefused !== undefined) openId.value = Number(firstRefused)
        throw error
      } finally {
        await load()
        announceHostsChanged()
      }
    }),
})

function onDraft(hostId: number, draft: RemoteHostDraft | null): void {
  if (draft) hostEdits.set(hostId, draft)
  else hostEdits.discard(hostId)
}

function cancelEdit(hostId: number): void {
  hostEdits.discard(hostId)
  delete applyErrors[hostId]
  openId.value = null
}

// Reopening the panel drops unapplied edits (useStagedEdits): close the form
// showing one and clear old refusals. A map marker's MORE opens the panel on
// a host (`openSdrManagerHost`, which names the host before opening): `sync`
// runs this while that request is still pending, before the focus watcher
// below opens the host and clears it, so the form it opens stays open.
watch(
  () => settingsStore.open,
  (open) => {
    if (!open) return
    if (settingsStore.focusSdrManagerHostId === null) openId.value = null
    for (const hostId of Object.keys(applyErrors)) delete applyErrors[Number(hostId)]
  },
  { flush: 'sync' },
)

let pollTimer: ReturnType<typeof setInterval> | null = null

/**
 * Expand the host the operator asked for from a host marker on a map, once
 * the list holding it has loaded, and clear the request so a later manual visit
 * opens as usual.
 *
 * Waits for the host to actually be in `hosts`: the control mounts with an
 * empty list and fills it asynchronously, so acting on the id immediately would
 * expand a row that does not exist yet.
 */
watch(
  [() => settingsStore.focusSdrManagerHostId, hosts],
  async ([focusHostId]) => {
    if (focusHostId === null) return
    if (!hosts.value.some((host) => host.id === focusHostId)) return
    openId.value = focusHostId
    confirmId.value = null
    settingsStore.clearSdrManagerHostFocus()
    await nextTick()
    rowElements.get(focusHostId)?.scrollIntoView({ block: 'nearest' })
  },
  { immediate: true },
)

onMounted(() => {
  void load()
  pollTimer = setInterval(() => void load(), 5000)
})

onBeforeUnmount(() => {
  /* v8 ignore start -- defensive: pollTimer is always assigned in onMounted
     before this teardown runs, so the null guard is never false here */
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  /* v8 ignore stop */
})
</script>

<style scoped>
.remote-host-local-off {
  color: rgba(16, 19, 29, 0.55);
}
.remote-host-staged {
  font-size: var(--settings-text-caption);
  color: var(--ink-secondary);
}
.remote-host-error {
  color: #d94436;
}
</style>
