import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useSdrStore, type SdrStoredFrequency } from './stores/sdr'
import * as sdrRadiosApi from './services/sdrRadiosApi'
import {
  attachRadioEngine,
  createSdrRadioCapability,
  resetRadioEngineForTests,
  type RadioEngine,
} from './radioCapability'

function recordingEngine(log: string[], name = 'engine'): RadioEngine {
  return {
    tune: (request) => void log.push(`${name}.tune ${request.hz}`),
    restore: (request) => void log.push(`${name}.restore ${request.token}`),
  }
}

function radioRecord(
  overrides: Partial<sdrRadiosApi.SdrRadioRecord> = {},
): sdrRadiosApi.SdrRadioRecord {
  return {
    id: 1,
    name: 'Attic',
    host: '10.0.0.5',
    port: 1234,
    description: '',
    enabled: true,
    bandwidth: null,
    rf_gain: null,
    agc: null,
    sentry_host_id: null,
    sentry_device_id: null,
    notes: '',
    antenna: '',
    visibility: 'public',
    device_available: true,
    unavailable_reason: '',
    ...overrides,
  }
}

function stored(frequencyHz: number): SdrStoredFrequency {
  return { id: 1, group_id: null, label: 'X', frequency_hz: frequencyHz, mode: 'NFM' }
}

beforeEach(() => {
  setActivePinia(createPinia())
  resetRadioEngineForTests()
})

describe('sdr radio capability — tuning', () => {
  it('forwards tune and restore to the attached engine', () => {
    const log: string[] = []
    attachRadioEngine(recordingEngine(log))
    const radio = createSdrRadioCapability()

    radio.tune({ hz: 145_800_000 })
    radio.restore({ token: 'p1' })

    expect(log).toEqual(['engine.tune 145800000', 'engine.restore p1'])
  })

  it('queues calls made before the engine attaches and delivers them in order on attach', () => {
    const log: string[] = []
    const radio = createSdrRadioCapability()

    radio.tune({ hz: 1 })
    radio.restore({ token: 'a' })
    radio.tune({ hz: 2 })
    expect(log).toEqual([])

    attachRadioEngine(recordingEngine(log))

    expect(log).toEqual(['engine.tune 1', 'engine.restore a', 'engine.tune 2'])
  })

  it('delivers the queue only once', () => {
    const radio = createSdrRadioCapability()
    radio.tune({ hz: 1 })
    const firstLog: string[] = []
    const detach = attachRadioEngine(recordingEngine(firstLog, 'first'))
    detach()

    const secondLog: string[] = []
    attachRadioEngine(recordingEngine(secondLog, 'second'))

    expect(firstLog).toEqual(['first.tune 1'])
    expect(secondLog).toEqual([])
  })

  it('queues again after the engine detaches', () => {
    const log: string[] = []
    const radio = createSdrRadioCapability()
    const detach = attachRadioEngine(recordingEngine(log, 'old'))
    detach()

    radio.tune({ hz: 3 })
    expect(log).toEqual([])

    attachRadioEngine(recordingEngine(log, 'new'))
    expect(log).toEqual(['new.tune 3'])
  })

  it('a stale detach leaves a newer engine attached', () => {
    const log: string[] = []
    const radio = createSdrRadioCapability()
    const detachOld = attachRadioEngine(recordingEngine(log, 'old'))
    attachRadioEngine(recordingEngine(log, 'new'))

    detachOld()
    radio.tune({ hz: 4 })

    expect(log).toEqual(['new.tune 4'])
  })
})

describe('sdr radio capability — connection', () => {
  it('reports the SDR store connection state, reactively', () => {
    const radio = createSdrRadioCapability()
    const connected = computed(() => radio.connected)
    expect(connected.value).toBe(false)

    useSdrStore().connected = true

    expect(connected.value).toBe(true)
  })
})

describe('sdr radio capability — frequencies', () => {
  it('loads the frequency list when it is empty', () => {
    const store = useSdrStore()
    const load = vi.spyOn(store, 'loadFrequencies').mockResolvedValue(undefined)

    createSdrRadioCapability().frequencies.ensureLoaded()

    expect(load).toHaveBeenCalledOnce()
  })

  it('does not reload a list that is already loaded', () => {
    const store = useSdrStore()
    store.frequencies = [stored(145_650_000)]
    const load = vi.spyOn(store, 'loadFrequencies').mockResolvedValue(undefined)

    createSdrRadioCapability().frequencies.ensureLoaded()

    expect(load).not.toHaveBeenCalled()
  })

  it('answers whether a frequency is stored from the store list', () => {
    useSdrStore().frequencies = [stored(145_650_000)]
    const { frequencies } = createSdrRadioCapability()

    expect(frequencies.has(145_650_000)).toBe(true)
    expect(frequencies.has(145_050_000)).toBe(false)
  })

  it('saves a frequency with a mode the SDR supports', async () => {
    const store = useSdrStore()
    const save = vi.spyOn(store, 'saveFrequency').mockResolvedValue(stored(145_650_000))

    await createSdrRadioCapability().frequencies.save({
      label: 'GB3NM',
      frequency_hz: 145_650_000,
      mode: 'NFM',
      group_ids: [7],
    })

    expect(save).toHaveBeenCalledWith({
      label: 'GB3NM',
      frequency_hz: 145_650_000,
      mode: 'NFM',
      group_ids: [7],
    })
  })

  it('refuses a mode the SDR does not support, without calling the store', async () => {
    const store = useSdrStore()
    const save = vi.spyOn(store, 'saveFrequency')

    await expect(
      createSdrRadioCapability().frequencies.save({
        label: 'X',
        frequency_hz: 1,
        mode: 'DMR',
      }),
    ).rejects.toThrow('Unsupported SDR mode "DMR"')
    expect(save).not.toHaveBeenCalled()
  })

  it('passes a save failure back to the caller', async () => {
    vi.spyOn(useSdrStore(), 'saveFrequency').mockRejectedValue(new Error('offline'))

    await expect(
      createSdrRadioCapability().frequencies.save({ label: 'X', frequency_hz: 1, mode: 'AM' }),
    ).rejects.toThrow('offline')
  })

  it('removes and groups through the store', async () => {
    const store = useSdrStore()
    const remove = vi.spyOn(store, 'removeStoredFrequency').mockResolvedValue(undefined)
    const ensureGroup = vi.spyOn(store, 'ensureFrequencyGroup').mockResolvedValue(9)
    const { frequencies } = createSdrRadioCapability()

    await frequencies.remove(145_650_000)
    const groupId = await frequencies.ensureGroup('Repeaters')

    expect(remove).toHaveBeenCalledWith(145_650_000)
    expect(ensureGroup).toHaveBeenCalledWith('Repeaters')
    expect(groupId).toBe(9)
  })
})

describe('sdr radio capability — background decoders', () => {
  it('reports the radio each decoder runs on from the store', () => {
    const store = useSdrStore()
    store.setAprsRadioId(3)
    store.setAisRadioId(5)
    const { decoders } = createSdrRadioCapability()

    expect(decoders.activeRadioId('aprs')).toBe(3)
    expect(decoders.activeRadioId('ais')).toBe(5)
  })

  it('re-reads each decoder from the backend', async () => {
    const store = useSdrStore()
    const aprs = vi.spyOn(store, 'hydrateAprsFromDb').mockResolvedValue()
    const ais = vi.spyOn(store, 'hydrateAisFromDb').mockResolvedValue()
    const { decoders } = createSdrRadioCapability()

    await decoders.refresh('aprs')
    expect(aprs).toHaveBeenCalledOnce()
    expect(ais).not.toHaveBeenCalled()

    await decoders.refresh('ais')
    expect(ais).toHaveBeenCalledOnce()
  })

  it('starts APRS and lights the SDR panel’s APRS flag only once it runs', async () => {
    const store = useSdrStore()
    const start = vi.spyOn(store, 'startAprs').mockResolvedValue(true)
    const { decoders } = createSdrRadioCapability()

    await expect(decoders.start('aprs', 4)).resolves.toBe(true)

    expect(start).toHaveBeenCalledWith(4)
    expect(store.aprsEnabled).toBe(true)
  })

  it('leaves the APRS flag alone when the start is refused', async () => {
    const store = useSdrStore()
    store.setAprsEnabled(false)
    vi.spyOn(store, 'startAprs').mockResolvedValue(false)
    const { decoders } = createSdrRadioCapability()

    await expect(decoders.start('aprs', 4)).resolves.toBe(false)

    expect(store.aprsEnabled).toBe(false)
  })

  it('stops APRS and drops the flag even when the stop is refused', async () => {
    const store = useSdrStore()
    store.setAprsEnabled(true)
    const stop = vi.spyOn(store, 'stopAprs').mockResolvedValue(false)
    const { decoders } = createSdrRadioCapability()

    await expect(decoders.stop('aprs', 4)).resolves.toBe(false)

    expect(stop).toHaveBeenCalledWith(4)
    expect(store.aprsEnabled).toBe(false)
  })

  it('starts and stops AIS through the store, with no APRS flag involved', async () => {
    const store = useSdrStore()
    store.setAprsEnabled(true)
    const start = vi.spyOn(store, 'startAis').mockResolvedValue(true)
    const stop = vi.spyOn(store, 'stopAis').mockResolvedValue(false)
    const { decoders } = createSdrRadioCapability()

    await expect(decoders.start('ais', 6)).resolves.toBe(true)
    await expect(decoders.stop('ais', 6)).resolves.toBe(false)

    expect(start).toHaveBeenCalledWith(6)
    expect(stop).toHaveBeenCalledWith(6)
    expect(store.aprsEnabled).toBe(true)
  })
})

describe('sdr radio capability — radio list', () => {
  it('summarises every configured radio', async () => {
    vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue([
      radioRecord({ id: 1, name: 'Attic', enabled: true, device_available: true }),
      radioRecord({ id: 2, name: 'Shed', enabled: false, device_available: false }),
    ])

    await expect(createSdrRadioCapability().listRadios()).resolves.toEqual([
      { id: 1, name: 'Attic', enabled: true, available: true },
      { id: 2, name: 'Shed', enabled: false, available: false },
    ])
  })

  it('treats a radio with no availability field as available', async () => {
    // A manually-entered radio has no Sentry device behind it, so the backend
    // may omit the flag entirely — that must not hide the radio.
    const handEntered = radioRecord({ id: 4, name: 'Hand Entered' })
    delete handEntered.device_available
    vi.spyOn(sdrRadiosApi, 'listRadios').mockResolvedValue([handEntered])

    const [summary] = await createSdrRadioCapability().listRadios()

    expect(summary!.available).toBe(true)
  })
})
