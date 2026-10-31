<template>
  <div class="sdr-devices-wrap sdr-devices-card">
    <!-- SENTINEL HOSTS: computers sharing their SDRs through SDR Manager,
         this one included. Only with sdr-manager-remote (it supplies the host
         rows) or sdr-manager-local (this machine's SDRs) deployed. -->
    <section
      v-if="hostEditor || thisMachine || unlistedHostRadios.length > 0"
      class="sdr-devices-subcategory"
      aria-labelledby="sdr-devices-sentinel-hosts-heading"
    >
      <h3 id="sdr-devices-sentinel-hosts-heading" class="sdr-devices-subcategory-heading">
        Sentinel Hosts
      </h3>
      <div class="sdr-devices-list">
        <div
          v-if="sdrManagerHosts.length === 0 && unlistedHostRadios.length === 0 && !thisMachine"
          class="sdr-devices-empty"
        >
          No Sentinel hosts yet.
        </div>
        <!-- This machine's SDRs before sdr-manager-remote has linked this
             machine as a host (or without it): listed, with nothing to add
             them from yet. -->
        <template v-if="thisMachine && !hasLocalHost">
          <div class="sdr-this-machine-title">This machine</div>
          <component
            :is="thisMachine.DevicesPanel"
            @stage="(apply: () => Promise<void>) => onStage(THIS_MACHINE_STAGE_KEY, apply)"
          />
        </template>
        <!-- One accordion per SDR host: the host's own title row (status,
           name, address, SDR count, edit/remove — sdr-manager-remote's,
           through the capability) opens and folds its SDRs below. -->
        <template v-for="group in sdrManagerGroups" :key="'host-' + group.host.id">
          <component
            :is="hostEditor.HostHeader"
            v-if="hostEditor"
            :host="group.host"
            :expanded="isHostExpanded(group.host.id)"
            :sdr-count="group.snapshot?.status ? group.devices.length : null"
            :controls-id="hostSdrListId(group.host.id)"
            @toggle="toggleHost(group.host.id)"
            @stage="(apply: () => Promise<void>) => onStage(`host-${group.host.id}`, apply)"
          />
          <div
            v-show="isHostExpanded(group.host.id)"
            :id="hostSdrListId(group.host.id)"
            class="sdr-host-sdrs"
          >
            <!-- An unreachable host says why in its title row; only an answering
               host with nothing plugged in needs saying here. -->
            <div
              v-if="
                group.snapshot?.reachable !== false &&
                group.snapshot?.status &&
                group.devices.length === 0 &&
                group.orphanedRadios.length === 0 &&
                group.addressRadios.length === 0 &&
                !showsThisMachinePanel(group)
              "
              class="sdr-devices-empty"
            >
              No SDRs plugged in.
            </div>
            <!-- This machine: one row per SDR, sdr-manager-local's (state,
                 stream switch, settings), ending in its radio's ADD / ADDED. -->
            <component
              :is="thisMachine.DevicesPanel"
              v-if="thisMachine && showsThisMachinePanel(group)"
              @stage="(apply: () => Promise<void>) => onStage(THIS_MACHINE_STAGE_KEY, apply)"
            >
              <template #device-actions="{ deviceId }: { deviceId: string }">
                <!-- By host id, not the group: the rows keep this slot and
                     don't redraw when the groups do, so it must read them now. -->
                <SdrDeviceRadioAction
                  :device="hostDeviceEntry(group.host.id, deviceId)?.device"
                  :radio="hostDeviceEntry(group.host.id, deviceId)?.radio ?? null"
                  :adding="addingDeviceKey === group.host.id + ':' + deviceId"
                  :confirming="confirmingRadioOf(group.host.id, deviceId)"
                  @add="addHostDevice(group.host.id, deviceId)"
                  @start-delete="startDeleteRadioOf(group.host.id, deviceId)"
                  @confirm-delete="confirmDeleteRadioOf(group.host.id, deviceId)"
                  @cancel-delete="confirmId = null"
                />
              </template>
            </component>
            <template
              v-for="entry in showsThisMachinePanel(group) ? [] : group.devices"
              :key="group.host.id + ':' + entry.device.device_id"
            >
              <SdrRadioRow
                v-if="entry.radio"
                :radio="entry.radio"
                :connected="entry.device.present"
                :open="openId === entry.radio.id"
                :confirming="confirmId === entry.radio.id"
                :sdr-manager-device-status="entry.device"
                @toggle-edit="toggleEdit(entry.radio.id)"
                @start-delete="startDelete(entry.radio.id)"
                @confirm-delete="confirmDelete(entry.radio.id)"
                @cancel-delete="confirmId = null"
                @save="onSave"
                @cancel-edit="openId = null"
              />
              <SdrHostDeviceRow
                v-else
                :device="entry.device"
                :adding="addingDeviceKey === group.host.id + ':' + entry.device.device_id"
                @add="addDeviceAsRadio(group.host, entry.device)"
              />
            </template>
            <!-- Radios whose device this host no longer lists — usually a dongle
               replugged into another socket, which changes its identity. Rendered
               so they can be seen and removed; without this they are invisible
               here yet still fail whenever something connects to them. -->
            <SdrRadioRow
              v-for="radio in group.orphanedRadios"
              :key="'orphan-' + radio.id"
              :radio="radio"
              :connected="false"
              :open="openId === radio.id"
              :confirming="confirmId === radio.id"
              @toggle-edit="toggleEdit(radio.id)"
              @start-delete="startDelete(radio.id)"
              @confirm-delete="confirmDelete(radio.id)"
              @cancel-delete="confirmId = null"
              @save="onSave"
              @cancel-edit="openId = null"
            />
            <!-- Radios added by IP and port at this host's own address: the
                 host's SDRs, reached without SDR Manager — often added before
                 the host was. A second entry for an SDR already added from the
                 host is pointed out, so the operator can delete one. -->
            <template v-for="entry in group.addressRadios" :key="'address-' + entry.radio.id">
              <SdrRadioRow
                :radio="entry.radio"
                :connected="manualStatusMap[entry.radio.id] ?? null"
                :open="openId === entry.radio.id"
                :confirming="confirmId === entry.radio.id"
                @toggle-edit="toggleEdit(entry.radio.id)"
                @start-delete="startDelete(entry.radio.id)"
                @confirm-delete="confirmDelete(entry.radio.id)"
                @cancel-delete="confirmId = null"
                @save="onSave"
                @cancel-edit="openId = null"
              />
              <p v-if="entry.duplicateOf" class="sdr-host-duplicate-note">
                Added by IP and port, and also listed above as {{ entry.duplicateOf }}. Delete one
                so this SDR is listed once.
              </p>
            </template>
          </div>
        </template>

        <!-- Radios that name an SDR host the hosts list doesn't have — the host was
           removed, or its table was emptied (the move to sdr-manager-remote did
           that). No host group exists to hang them off, so without this group
           they could not be seen, edited or deleted. -->
        <template v-if="unlistedHostRadios.length > 0">
          <div class="sdr-host-group-header">UNLISTED SENTINEL HOST</div>
          <div class="sdr-devices-empty">{{ unlistedHostNotice }}</div>
          <SdrRadioRow
            v-for="radio in unlistedHostRadios"
            :key="'unlisted-' + radio.id"
            :radio="radio"
            :connected="manualStatusMap[radio.id] ?? null"
            :open="openId === radio.id"
            :confirming="confirmId === radio.id"
            :edit-as-manual="hostListKnown"
            @toggle-edit="toggleEdit(radio.id)"
            @start-delete="startDelete(radio.id)"
            @confirm-delete="confirmDelete(radio.id)"
            @cancel-delete="confirmId = null"
            @save="onSave"
            @cancel-edit="openId = null"
          />
        </template>

        <component
          :is="hostEditor.NewHostForm"
          v-if="hostEditor && addingHost"
          @done="addingHost = false"
        />
      </div>
      <div v-if="hostEditor" class="sdr-devices-add-actions">
        <BaseButton
          variant="ghost"
          class="sdr-devices-add-btn"
          :aria-expanded="addingHost"
          @click="toggleNewHost"
          >+ ADD A NEW SENTINEL HOST</BaseButton
        >
      </div>
    </section>

    <!-- NON-SENTINEL SDR DEVICES: SDRs shared some other way (a plain
         rtl_tcp), each added by its IP and port. -->
    <section class="sdr-devices-subcategory" aria-labelledby="sdr-devices-remote-sdrs-heading">
      <h3 id="sdr-devices-remote-sdrs-heading" class="sdr-devices-subcategory-heading">
        Non-Sentinel SDR Devices
      </h3>
      <div class="sdr-devices-list">
        <div v-if="remoteSdrRadios.length === 0 && openId !== 'new'" class="sdr-devices-empty">
          No remote SDR devices yet.
        </div>
        <SdrRadioRow
          v-for="radio in remoteSdrRadios"
          :key="radio.id"
          :radio="radio"
          :connected="manualStatusMap[radio.id] ?? null"
          :open="openId === radio.id"
          :confirming="confirmId === radio.id"
          @toggle-edit="toggleEdit(radio.id)"
          @start-delete="startDelete(radio.id)"
          @confirm-delete="confirmDelete(radio.id)"
          @cancel-delete="confirmId = null"
          @save="onSave"
          @cancel-edit="openId = null"
        />
        <div
          v-if="openId === 'new'"
          class="sdr-device-item sdr-device-item--open sdr-device-item--new"
        >
          <SdrDeviceForm :radio="null" @save="onSave" @cancel="openId = null" />
        </div>
      </div>
      <div class="sdr-devices-add-actions">
        <BaseButton
          variant="ghost"
          class="sdr-devices-add-btn"
          :aria-expanded="openId === 'new'"
          @click="toggleNew"
          >+ ADD A REMOTE SDR DEVICE</BaseButton
        >
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * `SdrDevicesControl` — the Settings → SDR → Radios card: every SDR Sentinel
 * can listen with, grouped by where it comes from (ADR-0009, ADR 0007):
 * - One group per SDR host — a computer sharing its SDRs through SDR Manager,
 *   this machine's own included — titled by the host's own row
 *   (`hostEditor.HostHeader`: status, name, address, edit/remove, its last
 *   error), listing every device the host currently reports (`SdrHostDeviceRow` for one not yet mirrored
 *   into Sentinel's own radio list, `SdrRadioRow` once it has been). The
 *   hosts, their title rows and the "+ ADD A NEW SENTINEL HOST" form come through the
 *   `radioSites` capability sdr-manager-remote provides; while it is not
 *   deployed there are no host groups, only single SDRs added by IP/port. A
 *   host's edits are staged for APPLY CHANGES through this card's `stage`.
 * - An "UNLISTED SENTINEL HOST" group for radios that name a host the hosts list
 *   doesn't have (removed, or SDR Manager isn't deployed). Editing one saves
 *   it as a manual radio, detaching it from the missing host.
 * - A trailing "SINGLE SDRS BY IP/PORT" group for radios entered directly in
 *   Sentinel (`sdr_manager_host_id === null`), unchanged from before this
 *   feature existed.
 *
 * A single 3s poll tick (guarded by `pollInFlight` so a slow tick can never
 * stack) refreshes both a manual radio's TCP reachability and every SDR host
 * host's cached device snapshot, and diffs each host's device-id set against
 * the previous tick to announce arrivals/departures through the
 * notifications store — the live plug/unplug behaviour this component adds
 * on top of the original per-radio-only poll. `sdr:radios-changed` keeps
 * firing on every local mutation (add/edit/delete/mirror), matching the
 * contract other components (e.g. `SdrDeviceSelector`, the SDR panel) already
 * listen for.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import BaseButton from '@sentinel/ui/base/BaseButton.vue'
import SdrDeviceForm from './SdrDeviceForm.vue'
import SdrRadioRow from './SdrRadioRow.vue'
import SdrHostDeviceRow from './SdrHostDeviceRow.vue'
import SdrDeviceRadioAction from './SdrDeviceRadioAction.vue'
import { getCapability } from '@sentinel/shell-api/shell/capabilities'
import { useNotificationsStore } from '@sentinel/shell-api/stores/notifications'
import {
  listRadios,
  createRadio,
  deleteRadio,
  getRadioStatus,
  type SdrRadioRecord,
  type SdrRadioInput,
} from '../services/sdrRadiosApi'
import type {
  SdrManagerDeviceSnapshot,
  SdrManagerDeviceStatus,
  SdrManagerHost,
} from '@sentinel/shell-api/types/sdrManager'
import { findSdrManagerHosts } from '../services/sdrManagerHosts'
import { RADIOS_CHANGED_EVENT } from '../composables/sdrDeviceEvents'

const emit = defineEmits<{ stage: [apply: () => Promise<void>] }>()

const notificationsStore = useNotificationsStore()

// Host groups need sdr-manager-remote; without it only radios added by address exist.
const sdrManagerDeployed = findSdrManagerHosts() !== undefined
/** sdr-manager-remote's host title row and add form, or undefined while it is not deployed. */
const hostEditor = findSdrManagerHosts()?.hostEditor

/**
 * This machine's SDR list (sdr-manager-local's, through its capability), or
 * undefined while sdr-manager-local is not deployed: then This machine's
 * group lists its SDRs as any host's are, from the host's device list.
 */
const thisMachine = computed(() => getCapability('thisMachineSdrs'))

/** Whether sdr-manager-remote lists this machine as a host yet. */
const hasLocalHost = computed(() => sdrManagerHosts.value.some((host) => host.is_local))

/** Whether this host group lists its SDRs through this machine's own list. */
function showsThisMachinePanel(group: SdrManagerHostGroup): boolean {
  return group.host.is_local && thisMachine.value !== undefined
}

/**
 * One SDR of a host, by ids, or undefined while the host hasn't reported it.
 * Reads the current groups: this machine's rows (sdr-manager-local's) keep the
 * slot they were first given, so a group captured then would go stale.
 */
function hostDeviceEntry(hostId: number, deviceId: string): SdrManagerDeviceRowModel | undefined {
  return sdrManagerGroups.value
    .find((group) => group.host.id === hostId)
    ?.devices.find((entry) => entry.device.device_id === deviceId)
}

/** Adds a host's SDR as a radio, by ids (this machine's rows name their SDR by id). */
function addHostDevice(hostId: number, deviceId: string): void {
  const host = sdrManagerHosts.value.find((candidate) => candidate.id === hostId)
  const entry = hostDeviceEntry(hostId, deviceId)
  if (host && entry) void addDeviceAsRadio(host, entry.device)
}

/** The id of the radio mirroring a host's SDR, or null while it isn't one. */
function radioIdOf(hostId: number, deviceId: string): number | null {
  return hostDeviceEntry(hostId, deviceId)?.radio?.id ?? null
}

function confirmingRadioOf(hostId: number, deviceId: string): boolean {
  const radioId = radioIdOf(hostId, deviceId)
  return radioId !== null && confirmId.value === radioId
}

function startDeleteRadioOf(hostId: number, deviceId: string): void {
  const radioId = radioIdOf(hostId, deviceId)
  if (radioId !== null) startDelete(radioId)
}

function confirmDeleteRadioOf(hostId: number, deviceId: string): void {
  const radioId = radioIdOf(hostId, deviceId)
  if (radioId !== null) void confirmDelete(radioId)
}
const addingHost = ref(false)

const radios = ref<SdrRadioRecord[]>([])
const sdrManagerHosts = ref<SdrManagerHost[]>([])
const deviceSnapshots = ref<Record<number, SdrManagerDeviceSnapshot>>({})
const openId = ref<number | 'new' | null>(null)
const confirmId = ref<number | null>(null)
const manualStatusMap = ref<Record<number, boolean | null>>({})
const addingDeviceKey = ref<string | null>(null)
// Whether the hosts list has been read: false while the first fetch is in
// flight and while every fetch so far has failed. Until then a host radio's
// group can't be told apart from a missing one.
const hostsLoaded = ref(false)
const hostsLoadFailed = ref(false)

// The present device-id set last seen per host, used only to diff against
// the newest poll and detect arrivals/departures — not rendered. Paired with
// the last-known name per device id so a departure notification can name the
// device instead of showing its raw id.
const previousDeviceIdsByHost = new Map<number, Set<string>>()
const lastKnownDeviceNames = new Map<string, string>()

const manualRadios = computed(() =>
  radios.value.filter((radio) => radio.sdr_manager_host_id == null),
)

/** An address as compared between a radio and a host: case and spacing don't count. */
function normalisedAddress(address: string): string {
  return address.trim().toLowerCase()
}

/**
 * The listed host a radio added by IP and port is on, by its address: an SDR
 * reached at a Sentinel host's own address is that host's, whatever way it
 * was added. Undefined for an SDR shared some other way.
 */
function hostAtAddress(radio: SdrRadioRecord): SdrManagerHost | undefined {
  const radioAddress = normalisedAddress(radio.host)
  return sdrManagerHosts.value.find((host) => normalisedAddress(host.address) === radioAddress)
}

/** Radios added by IP and port that no Sentinel host lists: NON-SENTINEL SDR DEVICES. */
const remoteSdrRadios = computed(() =>
  manualRadios.value.filter((radio) => hostAtAddress(radio) === undefined),
)

/**
 * True when it is certain which hosts exist: the list loaded, or there is no
 * SDR Manager to list any. Only then may a radio be called unlisted and
 * edited as a manual radio — after a failed fetch its host may well exist.
 */
const hostListKnown = computed(() => hostsLoaded.value || !sdrManagerDeployed)

/** Radios naming a host that isn't in the hosts list, shown once the first load attempt has finished. */
const unlistedHostRadios = computed(() => {
  if (!hostListKnown.value && !hostsLoadFailed.value) return []
  const listedHostIds = new Set(sdrManagerHosts.value.map((host) => host.id))
  return radios.value.filter(
    (radio) => radio.sdr_manager_host_id != null && !listedHostIds.has(radio.sdr_manager_host_id),
  )
})

const unlistedHostNotice = computed(() => {
  if (!hostListKnown.value) {
    return 'The Sentinel host list could not be loaded, so these radios cannot be matched to a host yet.'
  }
  const reason = sdrManagerDeployed
    ? 'Their Sentinel host is no longer listed.'
    : 'Their Sentinel host needs SDR Manager, which is not deployed.'
  return `${reason} Edit one to keep it as a remote SDR device, or delete it.`
})

/** One row model per device on a host: the live SDR host status, plus the
 * mirrored Sentinel radio if one has already been created for it (null =
 * not yet added — rendered as `SdrSdrManagerDeviceRow`'s ADD row instead). */
interface SdrManagerDeviceRowModel {
  device: SdrManagerDeviceStatus
  radio: SdrRadioRecord | null
}

interface SdrManagerHostGroup {
  host: SdrManagerHost
  snapshot: SdrManagerDeviceSnapshot | undefined
  devices: SdrManagerDeviceRowModel[]
  /**
   * Radios belonging to this host whose device is no longer in its device list.
   *
   * The list above is built by walking the host's *devices* and finding each
   * one's radio, so a radio whose device has gone has nothing to hang off and
   * would never be rendered at all. That is not a cosmetic gap: it happens
   * whenever a topology-keyed dongle is replugged into a different USB socket —
   * the identity changes, the old one vanishes, and the operator is left with a
   * radio they cannot see, cannot fix and cannot delete, which still fails when
   * something tries to connect to it.
   */
  orphanedRadios: SdrRadioRecord[]
  /** Radios added by IP and port at this host's address (see `hostAtAddress`). */
  addressRadios: SdrManagerAddressRadio[]
}

/** A radio added by IP and port on a Sentinel host. */
interface SdrManagerAddressRadio {
  radio: SdrRadioRecord
  /**
   * The name of the radio already added from the host for the same SDR (its
   * IQ port is this radio's port), or null when this is the only entry.
   */
  duplicateOf: string | null
}

// This machine first, as SDR Manager lists it, then the hosts in the order they were added.
const orderedHosts = computed(() => [
  ...sdrManagerHosts.value.filter((host) => host.is_local),
  ...sdrManagerHosts.value.filter((host) => !host.is_local),
])

const sdrManagerGroups = computed<SdrManagerHostGroup[]>(() =>
  orderedHosts.value.map((host) => {
    const snapshot = deviceSnapshots.value[host.id]
    const devices = snapshot?.status?.sdrs ?? []
    return {
      host,
      snapshot,
      devices: devices.map((device) => ({
        device,
        radio:
          radios.value.find(
            (radio) =>
              radio.sdr_manager_host_id === host.id &&
              radio.sdr_manager_device_id === device.device_id,
          ) ?? null,
      })),
      // Only meaningful once the host has actually answered: with no snapshot
      // every radio would look orphaned, which is the opposite of the truth
      // while a Pi is simply still booting.
      orphanedRadios: snapshot?.status
        ? radios.value.filter(
            (radio) =>
              radio.sdr_manager_host_id === host.id &&
              !devices.some((device) => device.device_id === radio.sdr_manager_device_id),
          )
        : [],
      addressRadios: manualRadios.value
        .filter((radio) => hostAtAddress(radio)?.id === host.id)
        .map((radio) => {
          const sameDevice = devices.find((device) => device.output?.iq_port === radio.port)
          const hostRadio = sameDevice
            ? radios.value.find(
                (candidate) =>
                  candidate.sdr_manager_host_id === host.id &&
                  candidate.sdr_manager_device_id === sameDevice.device_id,
              )
            : undefined
          return { radio, duplicateOf: hostRadio?.name ?? null }
        }),
    }
  }),
)

// Guards the 3s poll: a tick fans out one status probe per manual radio plus
// one device-snapshot fetch per SDR host, each of which waits on a
// backend round trip. Skip a tick while a previous sweep is still in flight
// rather than stacking overlapping requests (same guard as before this
// feature existed, now covering the combined manual+SDR host sweep).
let pollInFlight = false

async function pollManualRadioStatuses(): Promise<void> {
  // Unlisted-host radios have no host snapshot to read presence from, so they
  // get the same TCP probe as manual radios.
  await Promise.all(
    [...manualRadios.value, ...unlistedHostRadios.value].map(async (radio) => {
      const status = await getRadioStatus(radio.id)
      manualStatusMap.value[radio.id] = status?.connected === true
    }),
  )
}

/**
 * Announce devices that plugged in/unplugged on `host` since the previous
 * tick. Tracks only the *present* device-id set — a serial-identified device
 * SDR host keeps configured while unplugged still appears in every snapshot
 * with `present: false`, so membership in the full device list is not itself
 * a plug/unplug signal; only a `present` transition is.
 */
function announceDeviceChanges(
  host: SdrManagerHost,
  currentDevices: SdrManagerDeviceStatus[],
): void {
  const currentPresentIds = new Set(
    currentDevices.filter((device) => device.present).map((device) => device.device_id),
  )
  const previousPresentIds = previousDeviceIdsByHost.get(host.id)
  // Undefined only on the very first snapshot for this host — nothing to
  // diff against yet, so every currently-present device would otherwise look
  // like a fresh arrival.
  if (previousPresentIds) {
    for (const device of currentDevices) {
      if (device.present && !previousPresentIds.has(device.device_id)) {
        notificationsStore.add({
          type: 'system',
          title: 'SDR device connected',
          detail: `${device.name || device.device_id} on ${hostLabel(host)}`,
        })
      }
    }
    for (const previousId of previousPresentIds) {
      if (!currentPresentIds.has(previousId)) {
        const previousName = lastKnownDeviceNames.get(previousId) || previousId
        notificationsStore.add({
          type: 'system',
          title: 'SDR device disconnected',
          detail: `${previousName} on ${hostLabel(host)}`,
        })
      }
    }
  }
  for (const device of currentDevices) lastKnownDeviceNames.set(device.device_id, device.name)
  previousDeviceIdsByHost.set(host.id, currentPresentIds)
}

async function pollSdrManagerHostDevices(): Promise<void> {
  const hostsCapability = findSdrManagerHosts()
  if (!hostsCapability) return
  await Promise.all(
    sdrManagerHosts.value.map(async (host) => {
      const snapshot = await hostsCapability.getHostDevices(host.id)
      deviceSnapshots.value = { ...deviceSnapshots.value, [host.id]: snapshot }
      announceDeviceChanges(host, snapshot.status?.sdrs ?? [])
    }),
  )
}

async function pollAll(): Promise<void> {
  if (pollInFlight) return
  pollInFlight = true
  try {
    // The hosts too: their title rows show each one's reachability and last error.
    await loadSdrManagerHosts()
    await Promise.all([pollManualRadioStatuses(), pollSdrManagerHostDevices()])
  } finally {
    pollInFlight = false
  }
}

async function loadRadios(): Promise<void> {
  radios.value = await listRadios()
}

async function loadSdrManagerHosts(): Promise<void> {
  const hostsCapability = findSdrManagerHosts()
  if (!hostsCapability) return
  try {
    sdrManagerHosts.value = await hostsCapability.listHosts()
    hostsLoaded.value = true
  } catch {
    /* offline / transient — keep the previous list */
    hostsLoadFailed.value = true
  }
}

async function load(): Promise<void> {
  await Promise.all([loadRadios(), loadSdrManagerHosts()])
  await pollAll()
}

function toggleEdit(id: number): void {
  openId.value = openId.value === id ? null : id
  confirmId.value = null
}

function toggleNew(): void {
  openId.value = openId.value === 'new' ? null : 'new'
  confirmId.value = null
}

/**
 * Hosts whose SDRs are folded away. Every host starts open, so its SDRs are
 * in view on first visit; folding one is kept until the card unmounts.
 */
const foldedHostIds = ref(new Set<number>())

function isHostExpanded(hostId: number): boolean {
  return !foldedHostIds.value.has(hostId)
}

function toggleHost(hostId: number): void {
  const folded = new Set(foldedHostIds.value)
  if (folded.has(hostId)) folded.delete(hostId)
  else folded.add(hostId)
  foldedHostIds.value = folded
}

function hostSdrListId(hostId: number): string {
  return `sdr-host-${hostId}-sdrs`
}

function toggleNewHost(): void {
  addingHost.value = !addingHost.value
}

/**
 * Each host title row, and this machine's SDR list, hands over the closure
 * that saves its own staged edits; APPLY CHANGES runs every one. All are kept (one with nothing staged saves
 * nothing), so a retry after a refused edit still reaches it.
 */
const stagedAppliers = new Map<string, () => Promise<void>>()

/** The staging key of this machine's SDR edits; a host's is `host-<id>`. */
const THIS_MACHINE_STAGE_KEY = 'this-machine'

function onStage(key: string, apply: () => Promise<void>): void {
  stagedAppliers.set(key, apply)
  emit('stage', applyStagedEdits)
}

/** Saves every staged edit (hosts, this machine's SDRs); throws the first refusal once all have run. */
async function applyStagedEdits(): Promise<void> {
  let firstFailure: unknown = null
  for (const apply of [...stagedAppliers.values()]) {
    try {
      await apply()
    } catch (error) {
      firstFailure ??= error
    }
  }
  if (firstFailure !== null) throw firstFailure
}

function startDelete(id: number): void {
  confirmId.value = id
  openId.value = null
}

async function confirmDelete(id: number): Promise<void> {
  const deleted = await deleteRadio(id)
  if (!deleted) return
  confirmId.value = null
  await loadRadios()
  document.dispatchEvent(new CustomEvent(RADIOS_CHANGED_EVENT))
}

async function onSave(): Promise<void> {
  openId.value = null
  await loadRadios()
  document.dispatchEvent(new CustomEvent(RADIOS_CHANGED_EVENT))
}

async function addDeviceAsRadio(
  host: SdrManagerHost,
  device: SdrManagerDeviceStatus,
): Promise<void> {
  if (!device.output) return
  const key = `${host.id}:${device.device_id}`
  addingDeviceKey.value = key
  try {
    const body: SdrRadioInput = {
      name: device.name || device.device_id,
      host: host.address,
      port: device.output.iq_port,
      description: '',
      enabled: device.enabled,
      bandwidth: null,
      rf_gain: null,
      agc: null,
      sdr_manager_host_id: host.id,
      sdr_manager_device_id: device.device_id,
      notes: device.notes,
      antenna: device.antenna,
      visibility: device.visibility,
    }
    const created = await createRadio(body)
    if (created) {
      await loadRadios()
      document.dispatchEvent(new CustomEvent(RADIOS_CHANGED_EVENT))
    }
  } finally {
    if (addingDeviceKey.value === key) addingDeviceKey.value = null
  }
}

/** This machine's row reads "This machine" unless the operator labelled it, as in SDR HOSTS. */
function hostLabel(host: SdrManagerHost): string {
  return host.name || (host.is_local ? 'This machine' : host.address)
}

let pollTimer: ReturnType<typeof setInterval> | null = null

function onRadiosChanged(): void {
  void loadRadios()
}

// Stops the hosts-changed subscription; null while sdr-manager-remote is absent.
let stopHostsChanged: (() => void) | null = null

onMounted(() => {
  void load()
  pollTimer = setInterval(() => void pollAll(), 3000)
  document.addEventListener(RADIOS_CHANGED_EVENT, onRadiosChanged)
  stopHostsChanged = findSdrManagerHosts()?.onHostsChanged(() => void loadSdrManagerHosts()) ?? null
})

onBeforeUnmount(() => {
  /* v8 ignore start -- defensive: pollTimer is always assigned in onMounted
     before this teardown runs, so the null guard is never false here */
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  /* v8 ignore stop */
  document.removeEventListener(RADIOS_CHANGED_EVENT, onRadiosChanged)
  stopHostsChanged?.()
  stopHostsChanged = null
})
</script>

<style scoped>
/* Set exactly like the card's own title (.settings-item-label, RADIOS) and
   aligned with it, so the host titles / SINGLE SDRS BY IP/PORT read as the same kind
   of title. */
.sdr-host-group-header {
  padding: 10px 0 4px;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
}
.sdr-host-sdrs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* A gap after a host's SDRs sets the next host's title apart from them; the
   last host's needs none, so the add button sits the subcategory's 12px below
   it, as it does below the remote SDR devices. */
.sdr-host-sdrs:not(:last-child) {
  margin-bottom: 8px;
}
/* The card has no title of its own, so the settings grid pulls it up under
   DEVICES (.settings-group-label + .settings-item--headless, -40px). Its
   subcategory headings stand in for card titles, so put back the distance a
   card title keeps from its group label. */
.sdr-devices-card {
  margin-top: 40px;
}
/* This machine's SDR list (sdr-manager-local's) brings the list spacing of a
   card of its own; inside a host it sits like any host's SDRs. */
.sdr-host-sdrs :deep(.sdr-devices-list) {
  margin-bottom: 0;
}
/* Spaced like the cards around them: 12px from a title to its content (the
   card's own gap) and 48px between subcategories (the settings grid's gap). */
.sdr-devices-subcategory {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.sdr-devices-subcategory + .sdr-devices-subcategory {
  margin-top: 48px;
}
.sdr-devices-subcategory .sdr-devices-list {
  margin-bottom: 0;
}
/* A subcategory of DEVICES, set exactly like the card titles
   (.settings-item-label) and aligned with them. */
.sdr-devices-subcategory-heading {
  margin: 0;
  padding: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-title);
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink);
}
.sdr-host-duplicate-note {
  margin: 0;
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-small);
  color: var(--ink-secondary);
}
/* This machine's name when it isn't (yet) a listed host: as a host's name. */
.sdr-this-machine-title {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: var(--settings-text-body);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink);
}
.sdr-devices-add-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
