import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'

const { getNamespaceMock } = vi.hoisted(() => ({ getNamespaceMock: vi.fn() }))
vi.mock('@sentinel/shell-api/services/settingsApi', () => ({ getNamespace: getNamespaceMock }))

import { useSdrPreferences } from './useSdrPreferences'

function createPreferences(tuningOffsetHz = 0) {
  const tuning = {
    tuningOffsetHz: ref(tuningOffsetHz),
    currentFreqHz: ref(145_000_000),
    requestTune: vi.fn(),
  }
  return { tuning, preferences: useSdrPreferences(tuning) }
}

describe('useSdrPreferences', () => {
  beforeEach(() => {
    localStorage.clear()
    getNamespaceMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with the documented defaults', () => {
    const { preferences } = createPreferences()
    expect(preferences.autoCenterWaterfallOnTune.value).toBe(true)
    expect(preferences.snapToKnown.value).toBe(true)
    expect(preferences.displayBandPlan.value).toBe(true)
    expect(preferences.displayKnownFrequencies.value).toBe(true)
    expect(preferences.displayWaterfallTimestamps.value).toBe(true)
    expect(preferences.waterfallTimestampIntervalSec.value).toBe(5)
    expect(preferences.resumeDelaySec.value).toBe(0)
    expect(preferences.recordingMaxDurationMinutes.value).toBe(360)
    expect(preferences.recordRawIq.value).toBe(false)
    expect(preferences.viewZoom.value).toBe(1)
    expect(preferences.viewZmin.value).toBe(0)
    expect(preferences.viewZmax.value).toBe(0)
    expect(preferences.viewAutoScale.value).toBe(true)
  })

  // Each persisted option is wired to its own cache key and settings key; a
  // swapped key would silently read another option's value.
  const flags = [
    [
      'autoCenterWaterfallOnTune',
      'setAutoCenterWaterfallOnTune',
      'hydrateAutoCenterFromDb',
      'sdrAutoCenterWaterfallOnTune',
      'autoCenterWaterfallOnTune',
    ],
    ['snapToKnown', 'setSnapToKnown', 'hydrateSnapToKnownFromDb', 'sdrSnapToKnown', 'snapToKnown'],
    [
      'displayBandPlan',
      'setDisplayBandPlan',
      'hydrateDisplayBandPlanFromDb',
      'sdrShowBandPlan',
      'displayBandPlan',
    ],
    [
      'displayKnownFrequencies',
      'setDisplayKnownFrequencies',
      'hydrateDisplayKnownFrequenciesFromDb',
      'sdrShowKnownFreqs',
      'displayKnownFrequencies',
    ],
    [
      'displayWaterfallTimestamps',
      'setDisplayWaterfallTimestamps',
      'hydrateDisplayWaterfallTimestampsFromDb',
      'sdrShowWaterfallTimestamps',
      'displayWaterfallTimestamps',
    ],
  ] as const

  describe.each(flags)('%s', (valueName, setterName, hydrateName, storageKey, settingKey) => {
    it(`reads a cached "0" from ${storageKey}`, () => {
      localStorage.setItem(storageKey, '0')
      expect(createPreferences().preferences[valueName].value).toBe(false)
    })

    it(`caches its value under ${storageKey}`, () => {
      const { preferences } = createPreferences()
      preferences[setterName](false)
      expect(preferences[valueName].value).toBe(false)
      expect(localStorage.getItem(storageKey)).toBe('0')
    })

    it(`hydrates from the ${settingKey} setting`, async () => {
      getNamespaceMock.mockResolvedValue({ [settingKey]: false })
      const { preferences } = createPreferences()
      await preferences[hydrateName]()
      expect(getNamespaceMock).toHaveBeenCalledWith('sdr')
      expect(preferences[valueName].value).toBe(false)
    })
  })

  describe('auto-centre', () => {
    it('recentres on the demod frequency when turned on while off-centre', () => {
      const { tuning, preferences } = createPreferences(12_500)
      preferences.setAutoCenterWaterfallOnTune(true)
      expect(tuning.tuningOffsetHz.value).toBe(0)
      expect(tuning.requestTune).toHaveBeenCalledWith(145_000_000)
    })

    it('does not retune when already centred', () => {
      const { tuning, preferences } = createPreferences(0)
      preferences.setAutoCenterWaterfallOnTune(true)
      expect(tuning.requestTune).not.toHaveBeenCalled()
    })

    it('keeps the offset when turned off', () => {
      const { tuning, preferences } = createPreferences(12_500)
      preferences.setAutoCenterWaterfallOnTune(false)
      expect(tuning.tuningOffsetHz.value).toBe(12_500)
      expect(tuning.requestTune).not.toHaveBeenCalled()
    })

    it('recentres when an uploaded config turns it back on', async () => {
      localStorage.setItem('sdrAutoCenterWaterfallOnTune', '0')
      getNamespaceMock.mockResolvedValue({ autoCenterWaterfallOnTune: true })
      const { tuning, preferences } = createPreferences(-5_000)
      await preferences.hydrateAutoCenterFromDb()
      expect(preferences.autoCenterWaterfallOnTune.value).toBe(true)
      expect(tuning.requestTune).toHaveBeenCalledWith(145_000_000)
    })
  })

  describe('whole-number options', () => {
    it('reads the cached timestamp interval and resume delay', () => {
      localStorage.setItem('sdrWaterfallTimestampIntervalSec', '30')
      localStorage.setItem('sdrResumeDelaySec', '0')
      const { preferences } = createPreferences()
      expect(preferences.waterfallTimestampIntervalSec.value).toBe(30)
      expect(preferences.resumeDelaySec.value).toBe(0)
    })

    it('floors the timestamp interval at 1 s (0 falls back to 5)', () => {
      const { preferences } = createPreferences()
      preferences.setWaterfallTimestampIntervalSec(1)
      expect(preferences.waterfallTimestampIntervalSec.value).toBe(1)
      preferences.setWaterfallTimestampIntervalSec(0)
      expect(preferences.waterfallTimestampIntervalSec.value).toBe(5)
      expect(localStorage.getItem('sdrWaterfallTimestampIntervalSec')).toBe('5')
    })

    it('accepts a zero resume delay and rejects a negative one', () => {
      const { preferences } = createPreferences()
      preferences.setResumeDelaySec(4)
      preferences.setResumeDelaySec(0)
      expect(preferences.resumeDelaySec.value).toBe(0)
      preferences.setResumeDelaySec(-1)
      expect(preferences.resumeDelaySec.value).toBe(0)
      expect(localStorage.getItem('sdrResumeDelaySec')).toBe('0')
    })

    it('hydrates a stored zero resume delay over a cached one', async () => {
      localStorage.setItem('sdrResumeDelaySec', '4')
      getNamespaceMock.mockResolvedValue({ resumeDelaySec: 0 })
      const { preferences } = createPreferences()
      await preferences.hydrateResumeDelaySecFromDb()
      expect(preferences.resumeDelaySec.value).toBe(0)
    })

    it('keeps the recording limit out of localStorage', () => {
      const { preferences } = createPreferences()
      preferences.setRecordingMaxDurationMinutes(90)
      expect(preferences.recordingMaxDurationMinutes.value).toBe(90)
      preferences.setRecordingMaxDurationMinutes(0)
      expect(preferences.recordingMaxDurationMinutes.value).toBe(360)
      expect(localStorage.length).toBe(0)
    })

    it.each([
      [
        'hydrateWaterfallTimestampIntervalFromDb',
        'waterfallTimestampIntervalSec',
        'waterfallTimestampIntervalSec',
        15,
      ],
      ['hydrateResumeDelaySecFromDb', 'resumeDelaySec', 'resumeDelaySec', 3],
      [
        'hydrateRecordingMaxDurationFromDb',
        'recordingMaxDurationMinutes',
        'recordingMaxDurationMinutes',
        45,
      ],
    ] as const)('%s adopts the %s setting', async (hydrateName, settingKey, valueName, stored) => {
      getNamespaceMock.mockResolvedValue({ [settingKey]: stored })
      const { preferences } = createPreferences()
      await preferences[hydrateName]()
      expect(preferences[valueName].value).toBe(stored)
    })
  })

  it('sets the record-raw-IQ option without caching it', () => {
    const { preferences } = createPreferences()
    preferences.setRecordRawIq(true)
    expect(preferences.recordRawIq.value).toBe(true)
    expect(localStorage.length).toBe(0)
  })

  describe('waterfall view settings', () => {
    it('reads the cached sliders', () => {
      localStorage.setItem('sdrViewZoom', '2.5')
      localStorage.setItem('sdrViewZmin', '-90')
      localStorage.setItem('sdrViewZmax', '-20')
      localStorage.setItem('sdrViewAutoScale', '0')
      const { preferences } = createPreferences()
      expect(preferences.viewZoom.value).toBe(2.5)
      expect(preferences.viewZmin.value).toBe(-90)
      expect(preferences.viewZmax.value).toBe(-20)
      expect(preferences.viewAutoScale.value).toBe(false)
    })

    it('falls back for an unparsable cached number', () => {
      localStorage.setItem('sdrViewZoom', 'wide')
      expect(createPreferences().preferences.viewZoom.value).toBe(1)
    })

    it('falls back to the defaults when the cache cannot be read', () => {
      localStorage.setItem('sdrViewZoom', '3')
      localStorage.setItem('sdrViewAutoScale', '0')
      vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
        throw new Error('blocked')
      })
      const { preferences } = createPreferences()
      expect(preferences.viewZoom.value).toBe(1)
      expect(preferences.viewAutoScale.value).toBe(true)
    })

    it('updates only the given sliders and caches all four', () => {
      const { preferences } = createPreferences()
      preferences.setViewSettings({ zoom: 4, zmax: -10 })
      expect(preferences.viewZoom.value).toBe(4)
      expect(preferences.viewZmin.value).toBe(0)
      expect(preferences.viewZmax.value).toBe(-10)
      expect(preferences.viewAutoScale.value).toBe(true)
      preferences.setViewSettings({ zmin: -100, autoScale: false })
      expect(preferences.viewZmin.value).toBe(-100)
      expect(preferences.viewAutoScale.value).toBe(false)
      expect(localStorage.getItem('sdrViewZoom')).toBe('4')
      expect(localStorage.getItem('sdrViewZmin')).toBe('-100')
      expect(localStorage.getItem('sdrViewZmax')).toBe('-10')
      expect(localStorage.getItem('sdrViewAutoScale')).toBe('0')
    })

    it('keeps the sliders when the cache write fails', () => {
      const { preferences } = createPreferences()
      vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
        throw new Error('quota')
      })
      expect(() => preferences.setViewSettings({ zoom: 2, autoScale: true })).not.toThrow()
      expect(preferences.viewZoom.value).toBe(2)
    })
  })
})
