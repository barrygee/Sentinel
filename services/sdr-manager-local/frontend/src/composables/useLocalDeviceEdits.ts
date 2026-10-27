import { inject, provide, reactive, ref, watch, type InjectionKey, type Ref } from 'vue'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useStagedEdits, type StagedEdits } from '@sentinel/shell-api/settings/useStagedEdits'
import type { LocalDevicePatch, LocalDeviceStatus } from '../api/types'
import { deviceLabel, useLocalSdrStore } from '../stores/localSdrStore'
import { deviceErrorMessage } from '../utils/errorMessages'
import { validateDeviceName, validateOutputPort } from '../utils/validation'

/**
 * What a device's form and its row's stream switch edit, as typed (the port is
 * null while its field is empty).
 */
export interface LocalDeviceDraft {
  /** Whether it streams: the row's switch. */
  enabled: boolean
  name: string
  port: number | null
  antenna: string
  notes: string
  visibility: 'public' | 'private'
}

/** The messages a device's form shows: under a field, or under the whole form. */
export interface LocalDeviceFormErrors {
  name: string | null
  port: string | null
  form: string | null
}

export interface LocalDeviceEdits {
  edits: StagedEdits<string, LocalDeviceDraft>
  /** The one device whose form is open, or null. */
  openDeviceId: Ref<string | null>
  /** Each device's messages from the last APPLY CHANGES that refused it. */
  errors: Record<string, LocalDeviceFormErrors>
  /** Bumped after a refused APPLY, so the open form moves focus to its first error. */
  focusRequest: Ref<number>
  /** The draft a device's form starts from: its staged edit, else its saved values. */
  draftFor: (device: LocalDeviceStatus) => LocalDeviceDraft
  /** Stage a draft, or drop it when it matches what is saved. */
  updateDraft: (device: LocalDeviceStatus, draft: LocalDeviceDraft) => void
  /** Drop a device's draft and its messages and close its form. */
  cancel: (deviceId: string) => void
}

const LOCAL_DEVICE_EDITS: InjectionKey<LocalDeviceEdits> = Symbol('localDeviceEdits')

/** API codes that are about the port field rather than the whole form. */
const PORT_ERROR_CODES = new Set([
  'port_conflict',
  'port_in_use',
  'port_out_of_range',
  'port_reserved_http',
  'port_reserved_internal',
  'port_reserved_operator',
])

function savedDraft(device: LocalDeviceStatus, portSuggestion: number | null): LocalDeviceDraft {
  return {
    enabled: device.enabled,
    name: device.name,
    port: device.output?.iq_port ?? portSuggestion,
    antenna: device.antenna,
    notes: device.notes,
    visibility: device.visibility,
  }
}

/**
 * The patch a draft makes. A device seen for the first time has no saved
 * configuration: the API needs its name and port together, so both are sent
 * then even unchanged. Afterwards only the fields that changed are sent.
 */
function buildPatch(device: LocalDeviceStatus, draft: LocalDeviceDraft): LocalDevicePatch {
  const isNewDevice = device.record_id === null
  const name = draft.name.trim()
  const patch: LocalDevicePatch = {}
  if (isNewDevice || name !== device.name) patch.name = name
  if (isNewDevice || draft.port !== (device.output?.iq_port ?? null)) {
    patch.output_port = draft.port as number
  }
  if (draft.antenna !== device.antenna) patch.antenna = draft.antenna
  if (draft.notes !== device.notes) patch.notes = draft.notes
  if (draft.visibility !== device.visibility) patch.visibility = draft.visibility
  if (draft.enabled !== device.enabled) patch.enabled = draft.enabled
  return patch
}

function sameDraft(first: LocalDeviceDraft, second: LocalDeviceDraft): boolean {
  return (
    first.enabled === second.enabled &&
    first.name === second.name &&
    first.port === second.port &&
    first.antenna === second.antenna &&
    first.notes === second.notes &&
    first.visibility === second.visibility
  )
}

/**
 * `provideLocalDeviceEdits` — called by the DEVICES card: device edits (the
 * form's fields and the row's stream switch) are staged for APPLY CHANGES (`stage`, the card's panel event) rather than saved
 * by each form. On APPLY each draft is checked, then saved; a refusal goes
 * under the field it names (a port or name conflict) or under the form, that
 * device's form opens, and APPLY CHANGES reports ERROR.
 */
export function provideLocalDeviceEdits(
  stage: (apply: () => Promise<void>) => void,
): LocalDeviceEdits {
  const store = useLocalSdrStore()
  const settingsStore = useSettingsStore()
  const openDeviceId = ref<string | null>(null)
  const errors = reactive<Record<string, LocalDeviceFormErrors>>({})
  const focusRequest = ref(0)

  function refuse(deviceId: string, deviceErrors: Partial<LocalDeviceFormErrors>): never {
    errors[deviceId] = { name: null, port: null, form: null, ...deviceErrors }
    throw new Error(`device ${deviceId} was not saved`)
  }

  async function save(deviceId: string, draft: LocalDeviceDraft): Promise<void> {
    const device = store.devicesById[deviceId]
    // Unplugged and forgotten since it was edited: nothing left to save.
    if (!device) return
    const ownPorts = device.output ? [device.output.iq_port, device.output.control_port] : []
    const nameError = validateDeviceName(draft.name)
    const portError = validateOutputPort(draft.port, store.constraints, ownPorts)
    if (nameError || portError) refuse(deviceId, { name: nameError, port: portError })
    const patch = buildPatch(device, draft)
    // The device already matches the draft (it was edited against a value the
    // live stream had not caught up with yet): nothing to send, and the API
    // refuses an empty patch.
    if (Object.keys(patch).length === 0) {
      delete errors[deviceId]
      return
    }
    const label = patch.name ?? deviceLabel(device)
    // Only the stream switch moved: say what it did rather than "Saved".
    const summary =
      Object.keys(patch).length === 1 && patch.enabled !== undefined
        ? `${label} ${patch.enabled ? 'enabled' : 'disabled'}.`
        : `Saved ${label}.`
    try {
      await store.patchDevice(deviceId, patch, summary)
      delete errors[deviceId]
    } catch (error) {
      const message = deviceErrorMessage(error)
      const code = error instanceof SdrManagerApiError ? error.code : ''
      if (PORT_ERROR_CODES.has(code)) refuse(deviceId, { port: message })
      if (code === 'name_conflict') refuse(deviceId, { name: message })
      refuse(deviceId, { form: message })
    }
  }

  const edits = useStagedEdits<string, LocalDeviceDraft>({
    save,
    stage: (applyAll) =>
      stage(async () => {
        try {
          await applyAll()
          openDeviceId.value = null
          // Show what was saved now, rather than when each device's change
          // event arrives: a row edited again before then would be edited
          // against its old values.
          await store.refreshStatus()
        } catch (error) {
          // Show the first device that was refused; the others keep their drafts too.
          const [firstRefused] = Object.keys(errors)
          if (firstRefused !== undefined) openDeviceId.value = firstRefused
          focusRequest.value += 1
          throw error
        }
      }),
  })

  // Reopening the panel drops unapplied edits (useStagedEdits), so the forms
  // showing them close and their old messages go.
  watch(
    () => settingsStore.open,
    (open) => {
      if (!open) return
      openDeviceId.value = null
      for (const deviceId of Object.keys(errors)) delete errors[deviceId]
    },
  )

  const deviceEdits: LocalDeviceEdits = {
    edits,
    openDeviceId,
    errors,
    focusRequest,
    draftFor: (device) =>
      edits.drafts.get(device.device_id) ?? savedDraft(device, store.portSuggestion),
    updateDraft(device, draft) {
      if (sameDraft(draft, savedDraft(device, store.portSuggestion))) {
        edits.discard(device.device_id)
      } else edits.set(device.device_id, { ...draft })
    },
    cancel(deviceId) {
      edits.discard(deviceId)
      delete errors[deviceId]
      if (openDeviceId.value === deviceId) openDeviceId.value = null
    },
  }
  provide(LOCAL_DEVICE_EDITS, deviceEdits)
  return deviceEdits
}

/** The DEVICES card's staged device edits, for the list and the forms inside it. */
export function useLocalDeviceEdits(): LocalDeviceEdits {
  const deviceEdits = inject(LOCAL_DEVICE_EDITS)
  /* v8 ignore start -- defensive: every caller renders inside LocalDevicesControl */
  if (!deviceEdits) throw new Error('useLocalDeviceEdits needs LocalDevicesControl')
  /* v8 ignore stop */
  return deviceEdits
}
