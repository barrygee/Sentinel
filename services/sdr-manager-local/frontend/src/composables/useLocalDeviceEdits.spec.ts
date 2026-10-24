import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { makeConstraints, makeDevice } from '../testing/factories'
import { useLocalSdrStore } from '../stores/localSdrStore'
import {
  provideLocalDeviceEdits,
  useLocalDeviceEdits,
  type LocalDeviceDraft,
  type LocalDeviceEdits,
} from './useLocalDeviceEdits'

const api = vi.hoisted(() => ({
  patchDevice: vi.fn(),
  listDevices: vi.fn(),
  getStatus: vi.fn(),
}))
vi.mock('../api/sdrManagerLocalApi', () => api)

/** What the host component hands the Settings panel: the closure APPLY CHANGES runs. */
const stage = vi.fn<(apply: () => Promise<void>) => void>()

interface Mounted {
  provided: LocalDeviceEdits
  injected: LocalDeviceEdits
}

/** Mount a DEVICES-card stand-in that provides the edits and a child that injects them. */
function mountEdits(): Mounted {
  const pinia = createPinia()
  setActivePinia(pinia)
  let provided!: LocalDeviceEdits
  let injected!: LocalDeviceEdits
  const Child = defineComponent({
    setup() {
      injected = useLocalDeviceEdits()
      return () => h('span')
    },
  })
  const Host = defineComponent({
    setup() {
      provided = provideLocalDeviceEdits(stage)
      return () => h(Child)
    },
  })
  mount(Host, { global: { plugins: [pinia] } })
  return { provided, injected }
}

/** Run APPLY CHANGES: the most recently staged closure. */
function applyChanges(): Promise<void> {
  return stage.mock.calls.at(-1)![0]()
}

function draftOf(overrides: Partial<LocalDeviceDraft> = {}): LocalDeviceDraft {
  return {
    enabled: false,
    name: 'Roof',
    port: 1234,
    antenna: '',
    notes: '',
    visibility: 'public',
    ...overrides,
  }
}

function refusal(code: string, message = 'API words') {
  return new SdrManagerApiError(409, code, message)
}

describe('useLocalDeviceEdits', () => {
  let store: ReturnType<typeof useLocalSdrStore>
  let edits: LocalDeviceEdits
  let injected: LocalDeviceEdits

  beforeEach(() => {
    stage.mockReset()
    api.patchDevice.mockReset()
    api.patchDevice.mockResolvedValue({})
    api.getStatus.mockReset()
    api.getStatus.mockRejectedValue(new Error('status not stubbed by this test'))
    api.listDevices.mockReset()
    api.listDevices.mockResolvedValue({
      devices: [],
      port_suggestion: 1500,
      constraints: makeConstraints(),
    })
    const mountedEdits = mountEdits()
    edits = mountedEdits.provided
    injected = mountedEdits.injected
    store = useLocalSdrStore()
    store.constraints = makeConstraints()
    store.portSuggestion = 1500
    store.applyDeviceChanged(makeDevice({ device_id: 'a', name: 'Roof' }))
  })

  it('hands the same edits to a descendant that injects them', () => {
    expect(injected).toBe(edits)
  })

  describe('draftFor', () => {
    it('starts from the saved values, with the port from the device’s output', () => {
      const device = makeDevice({
        enabled: true,
        name: 'Roof',
        antenna: 'Whip',
        notes: 'n',
        visibility: 'private',
      })

      expect(edits.draftFor(device)).toEqual({
        enabled: true,
        name: 'Roof',
        port: 1234,
        antenna: 'Whip',
        notes: 'n',
        visibility: 'private',
      })
    })

    it('suggests the API’s free port for a device with no output yet', () => {
      expect(edits.draftFor(makeDevice({ output: null })).port).toBe(1500)
    })

    it('has a null port when there is neither an output nor a suggestion', () => {
      store.portSuggestion = null

      expect(edits.draftFor(makeDevice({ output: null })).port).toBeNull()
    })

    it('prefers the staged draft over the saved values', () => {
      const device = store.devicesById['a']!
      edits.updateDraft(device, draftOf({ name: 'Edited' }))

      expect(edits.draftFor(device).name).toBe('Edited')
    })
  })

  describe('updateDraft', () => {
    it('stages a copy of a changed draft and tells APPLY CHANGES', () => {
      const device = store.devicesById['a']!
      const draft = draftOf({ name: 'Edited' })

      edits.updateDraft(device, draft)

      expect(edits.edits.drafts.get('a')).toEqual(draft)
      expect(edits.edits.drafts.get('a')).not.toBe(draft)
      expect(stage).toHaveBeenCalledOnce()
    })

    it('drops the staged draft when it is edited back to the saved values', () => {
      const device = store.devicesById['a']!
      edits.updateDraft(device, draftOf({ name: 'Edited' }))
      stage.mockClear()

      edits.updateDraft(device, draftOf())

      expect(edits.edits.drafts.has('a')).toBe(false)
      expect(stage).not.toHaveBeenCalled()
    })

    it.each([
      ['enabled', { enabled: true }],
      ['port', { port: 1300 }],
      ['antenna', { antenna: 'Whip' }],
      ['notes', { notes: 'text' }],
      ['visibility', { visibility: 'private' as const }],
    ])('treats a different %s as a change', (_field, override) => {
      edits.updateDraft(store.devicesById['a']!, draftOf(override))

      expect(edits.edits.drafts.has('a')).toBe(true)
    })
  })

  describe('applying', () => {
    it('sends only the changed fields and announces "Saved <name>."', async () => {
      const device = store.devicesById['a']!
      edits.updateDraft(device, draftOf({ antenna: 'Whip', notes: 'n', visibility: 'private' }))

      await applyChanges()
      await flushPromises()

      expect(api.patchDevice).toHaveBeenCalledWith('a', {
        antenna: 'Whip',
        notes: 'n',
        visibility: 'private',
      })
      expect(store.announcement).toBe('Saved Roof.')
      expect(edits.edits.drafts.size).toBe(0)
      expect(edits.openDeviceId.value).toBeNull()
    })

    it('trims the name and uses the new name in the announcement', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: '  Attic  ' }))

      await applyChanges()
      await flushPromises()

      expect(api.patchDevice).toHaveBeenCalledWith('a', { name: 'Attic' })
      expect(store.announcement).toBe('Saved Attic.')
    })

    it('sends output_port and re-reads port rules when the port changed', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ port: 1300 }))

      await applyChanges()

      expect(api.patchDevice).toHaveBeenCalledWith('a', { output_port: 1300 })
      expect(api.listDevices).toHaveBeenCalledOnce()
    })

    it.each([
      [true, 'Roof enabled.'],
      [false, 'Roof disabled.'],
    ])(
      'says what the stream switch did when only it moved (enabled=%s)',
      async (enabled, sentence) => {
        store.applyDeviceChanged(makeDevice({ device_id: 'a', name: 'Roof', enabled: !enabled }))
        edits.updateDraft(store.devicesById['a']!, draftOf({ enabled }))

        await applyChanges()
        await flushPromises()

        expect(api.patchDevice).toHaveBeenCalledWith('a', { enabled })
        expect(store.announcement).toBe(sentence)
      },
    )

    it('says "Saved" when the switch moved together with another field', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ enabled: true, notes: 'n' }))

      await applyChanges()
      await flushPromises()

      expect(api.patchDevice).toHaveBeenCalledWith('a', { enabled: true, notes: 'n' })
      expect(store.announcement).toBe('Saved Roof.')
    })

    it('sends name and port together for a device never configured, even unchanged', async () => {
      store.applyDeviceChanged(
        makeDevice({ device_id: 'new', record_id: null, name: 'Detected', output: null }),
      )
      const device = store.devicesById['new']!
      edits.updateDraft(device, { ...edits.draftFor(device), enabled: true })

      await applyChanges()

      expect(api.patchDevice).toHaveBeenCalledWith('new', {
        name: 'Detected',
        output_port: 1500,
        enabled: true,
      })
    })

    it('sends the port of a configured device that has no output yet', async () => {
      store.applyDeviceChanged(makeDevice({ device_id: 'a', name: 'Roof', output: null }))
      const device = store.devicesById['a']!
      edits.updateDraft(device, { ...edits.draftFor(device), notes: 'x' })

      await applyChanges()

      expect(api.patchDevice).toHaveBeenCalledWith('a', { output_port: 1500, notes: 'x' })
    })

    it('re-reads the devices after a successful APPLY, so rows show what was saved', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ enabled: true }))
      api.getStatus.mockResolvedValue({
        generated_at: 1,
        location: null,
        sdrs: [makeDevice({ device_id: 'a', name: 'Roof', enabled: true })],
      })

      await applyChanges()

      expect(api.getStatus).toHaveBeenCalledTimes(1)
      expect(store.devicesById['a']!.enabled).toBe(true)
    })

    it('does not re-read the devices when APPLY was refused', async () => {
      api.patchDevice.mockRejectedValue(refusal('busy'))
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'x' }))

      await expect(applyChanges()).rejects.toThrow()

      expect(api.getStatus).not.toHaveBeenCalled()
    })

    it('sends nothing for a draft the device already matches, and saves cleanly', async () => {
      // Staged against a stale value: the switch was flipped on while the
      // device read off, and the live stream has since reported it on.
      edits.updateDraft(store.devicesById['a']!, draftOf({ enabled: true }))
      store.applyDeviceChanged(makeDevice({ device_id: 'a', name: 'Roof', enabled: true }))

      await expect(applyChanges()).resolves.toBeUndefined()

      expect(api.patchDevice).not.toHaveBeenCalled()
      expect(edits.edits.drafts.size).toBe(0)
      expect(Object.keys(edits.errors)).toEqual([])
    })

    it('does nothing when no draft is staged', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'x' }))
      edits.edits.discard('a')

      await applyChanges()

      expect(api.patchDevice).not.toHaveBeenCalled()
    })

    it('drops the draft of a device that disappeared before APPLY, without calling the API', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'x' }))
      store.applyDeviceRemoved('a')

      await applyChanges()

      expect(api.patchDevice).not.toHaveBeenCalled()
      expect(edits.edits.drafts.size).toBe(0)
      expect(Object.keys(edits.errors)).toEqual([])
    })
  })

  describe('client-side refusals', () => {
    it('refuses an invalid name before any request and opens the form with a focus request', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))

      await expect(applyChanges()).rejects.toThrow()

      expect(api.patchDevice).not.toHaveBeenCalled()
      expect(edits.errors['a']).toEqual({
        name: 'Use letters, numbers, spaces and _ . - ( ) / only.',
        port: null,
        form: null,
      })
      expect(edits.openDeviceId.value).toBe('a')
      expect(edits.focusRequest.value).toBe(1)
      expect(edits.edits.drafts.has('a')).toBe(true)
    })

    it('refuses an empty port', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ port: null }))

      await expect(applyChanges()).rejects.toThrow()

      expect(edits.errors['a']).toEqual({ name: null, port: 'Enter an output port.', form: null })
      expect(api.patchDevice).not.toHaveBeenCalled()
    })

    it('reports both the name and the port when both are wrong', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: '', port: 80 }))

      await expect(applyChanges()).rejects.toThrow()

      expect(edits.errors['a']!.name).toBe('Enter a name.')
      expect(edits.errors['a']!.port).toBe('Use a port from 1024 to 65000.')
    })

    it('lets a device keep ports it already holds', async () => {
      store.constraints = makeConstraints({ in_use: [1234, 1236] })
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'x' }))

      await applyChanges()

      expect(api.patchDevice).toHaveBeenCalledOnce()
    })

    it('refuses a port another device holds', async () => {
      store.constraints = makeConstraints({ in_use: [1234, 1236, 2000, 2002] })
      edits.updateDraft(store.devicesById['a']!, draftOf({ port: 2000 }))

      await expect(applyChanges()).rejects.toThrow()

      expect(edits.errors['a']!.port).toContain('already assigned to another device')
    })
  })

  describe('API refusals', () => {
    async function applyRefused(error: unknown) {
      api.patchDevice.mockRejectedValue(error)
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'x' }))
      await expect(applyChanges()).rejects.toThrow()
    }

    it.each([
      'port_conflict',
      'port_in_use',
      'port_out_of_range',
      'port_reserved_http',
      'port_reserved_internal',
      'port_reserved_operator',
    ])('puts %s under the port field', async (code) => {
      await applyRefused(refusal(code))

      expect(edits.errors['a']!.port).not.toBeNull()
      expect(edits.errors['a']!.name).toBeNull()
      expect(edits.errors['a']!.form).toBeNull()
    })

    it('puts name_conflict under the name field with the translated sentence', async () => {
      await applyRefused(refusal('name_conflict'))

      expect(edits.errors['a']).toEqual({
        name: 'That name is already used by another device.',
        port: null,
        form: null,
      })
    })

    it('puts any other API refusal under the form', async () => {
      await applyRefused(refusal('device_present', 'x'))

      expect(edits.errors['a']).toEqual({
        name: null,
        port: null,
        form: 'This device was plugged back in, so it can no longer be forgotten.',
      })
    })

    it('puts an unknown code’s own message under the form', async () => {
      await applyRefused(refusal('brand_new', 'Specific words'))

      expect(edits.errors['a']!.form).toBe('Specific words')
    })

    it('puts a non-API failure under the form with the generic sentence', async () => {
      await applyRefused(new Error('boom'))

      expect(edits.errors['a']!.form).toBe('The device could not be updated.')
    })

    it('keeps a refused draft staged and does not announce a save', async () => {
      await applyRefused(refusal('name_conflict'))
      await flushPromises()

      expect(edits.edits.drafts.has('a')).toBe(true)
      expect(store.announcement).not.toBe('Saved Roof.')
      expect(edits.openDeviceId.value).toBe('a')
    })

    it('clears a device’s earlier messages once it saves', async () => {
      await applyRefused(refusal('name_conflict'))
      api.patchDevice.mockResolvedValue({})

      await applyChanges()

      expect(edits.errors['a']).toBeUndefined()
      expect(edits.openDeviceId.value).toBeNull()
      expect(edits.edits.drafts.size).toBe(0)
    })
  })

  describe('several devices', () => {
    beforeEach(() => {
      store.applyDeviceChanged(
        makeDevice({
          device_id: 'b',
          name: 'Attic',
          output: { iq_port: 2000, control_port: 2002, host: '0.0.0.0' },
          usb: { manufacturer: null, product: null, serial: '2', topology_path: '1-2' },
        }),
      )
      store.constraints = makeConstraints({ in_use: [1234, 1236, 2000, 2002] })
    })

    it('saves the good one, opens the first refused, and keeps only the failure staged', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'ok' }))
      edits.updateDraft(store.devicesById['b']!, {
        ...draftOf({ name: 'Attic', port: 2000 }),
        notes: '',
        name: 'Bad!',
      })

      await expect(applyChanges()).rejects.toThrow()

      expect(api.patchDevice).toHaveBeenCalledOnce()
      expect(api.patchDevice).toHaveBeenCalledWith('a', { notes: 'ok' })
      expect(edits.openDeviceId.value).toBe('b')
      expect([...edits.edits.drafts.keys()]).toEqual(['b'])
      expect(edits.focusRequest.value).toBe(1)
    })

    it('opens the first of several refused devices', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))
      edits.updateDraft(store.devicesById['b']!, draftOf({ name: 'Worse!', port: 2000 }))

      await expect(applyChanges()).rejects.toThrow()

      expect(edits.openDeviceId.value).toBe('a')
      expect(Object.keys(edits.errors)).toEqual(['a', 'b'])
    })

    it('bumps the focus request on every refused APPLY', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))

      await expect(applyChanges()).rejects.toThrow()
      await expect(applyChanges()).rejects.toThrow()

      expect(edits.focusRequest.value).toBe(2)
    })
  })

  describe('a refused device whose messages were cleared mid-APPLY', () => {
    it('still fails the APPLY, opening no form, when the panel reopened while another device saved', async () => {
      const settings = useSettingsStore()
      store.applyDeviceChanged(
        makeDevice({
          device_id: 'b',
          name: 'Attic',
          output: { iq_port: 2000, control_port: 2002, host: '0.0.0.0' },
          usb: { manufacturer: null, product: null, serial: '2', topology_path: '1-2' },
        }),
      )
      store.constraints = makeConstraints({ in_use: [1234, 1236, 2000, 2002] })
      let finishSecondSave: (value: unknown) => void = () => undefined
      api.patchDevice.mockReturnValue(new Promise((resolve) => (finishSecondSave = resolve)))
      // 'a' is refused by validation at once; 'b' is then in flight.
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))
      edits.updateDraft(store.devicesById['b']!, draftOf({ name: 'Attic', port: 2000, notes: 'x' }))

      const applying = applyChanges()
      const outcome = expect(applying).rejects.toThrow()
      await flushPromises()
      settings.open = true
      await nextTick()
      finishSecondSave({})
      await outcome

      expect(Object.keys(edits.errors)).toEqual([])
      expect(edits.openDeviceId.value).toBeNull()
      expect(edits.focusRequest.value).toBe(1)
    })
  })

  describe('cancel', () => {
    it('drops the draft and messages and closes that device’s form', async () => {
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))
      await expect(applyChanges()).rejects.toThrow()

      edits.cancel('a')

      expect(edits.edits.drafts.has('a')).toBe(false)
      expect(edits.errors['a']).toBeUndefined()
      expect(edits.openDeviceId.value).toBeNull()
    })

    it('leaves another device’s open form alone', () => {
      edits.openDeviceId.value = 'b'
      edits.updateDraft(store.devicesById['a']!, draftOf({ notes: 'x' }))

      edits.cancel('a')

      expect(edits.openDeviceId.value).toBe('b')
      expect(edits.edits.drafts.has('a')).toBe(false)
    })
  })

  describe('reopening the Settings panel', () => {
    it('closes forms and clears messages when the panel opens', async () => {
      const settings = useSettingsStore()
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))
      await expect(applyChanges()).rejects.toThrow()
      expect(edits.openDeviceId.value).toBe('a')

      settings.open = true
      await nextTick()

      expect(edits.openDeviceId.value).toBeNull()
      expect(Object.keys(edits.errors)).toEqual([])
      // useStagedEdits drops the unapplied drafts at the same moment.
      expect(edits.edits.drafts.size).toBe(0)
    })

    it('leaves everything alone when the panel closes', async () => {
      const settings = useSettingsStore()
      settings.open = true
      await nextTick()
      edits.updateDraft(store.devicesById['a']!, draftOf({ name: 'Bad!' }))
      await expect(applyChanges()).rejects.toThrow()

      settings.open = false
      await nextTick()

      expect(edits.openDeviceId.value).toBe('a')
      expect(edits.errors['a']).toBeDefined()
    })
  })
})
