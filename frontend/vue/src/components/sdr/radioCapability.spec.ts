import { describe, it, expect, beforeEach, vi } from 'vitest'
import { computed } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useSdrStore, type SdrStoredFrequency } from '@/stores/sdr'
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
