import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { useArmedPassConflict } from './useArmedPassConflict'
import { setAutoTuneEnabled, setPassNotifEnabled } from '../controls/satellite/passNotifStore'
import type { AccPass } from '../spacePassesUtils'

const NOW_MS = Date.UTC(2026, 10, 20, 9, 0)
const MINUTE_MS = 60_000
const LOCATION: [number, number] = [-1.6, 54.9]

function accPass(startOffsetMinutes: number, endOffsetMinutes: number): AccPass {
  const aosMs = NOW_MS + startOffsetMinutes * MINUTE_MS
  const losMs = NOW_MS + endOffsetMinutes * MINUTE_MS
  return {
    aos_utc: new Date(aosMs).toISOString(),
    los_utc: new Date(losMs).toISOString(),
    aos_unix_ms: aosMs,
    los_unix_ms: losMs,
    duration_s: (losMs - aosMs) / 1000,
    max_elevation_deg: 30,
    max_el_utc: new Date(aosMs).toISOString(),
  }
}

function passWindow(startOffsetMinutes: number, endOffsetMinutes: number) {
  return {
    aos_unix_ms: NOW_MS + startOffsetMinutes * MINUTE_MS,
    los_unix_ms: NOW_MS + endOffsetMinutes * MINUTE_MS,
  }
}

function clock(offsetMinutes: number): string {
  return new Date(NOW_MS + offsetMinutes * MINUTE_MS).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Answers each satellite's pass request from a table keyed by NORAD id.
function answerPasses(table: Record<string, unknown>) {
  fetchMock.mockImplementation((url: string) => {
    const noradId = decodeURIComponent(url.split('/')[4]!)
    const body = table[noradId]
    if (body === 'fail') return Promise.resolve({ ok: false })
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) })
  })
}

// Mounts the composable in a host component, so its document listener is live.
function setup(
  options: { expanded?: string; passes?: AccPass[]; location?: [number, number] | null } = {},
) {
  const expandedNoradId = ref(options.expanded ?? '25544')
  const expandedPasses = ref<AccPass[]>(options.passes ?? [accPass(10, 20)])
  const armedTick = ref(0)
  const location = options.location === undefined ? LOCATION : options.location
  let conflict!: ReturnType<typeof useArmedPassConflict>
  const wrapper = mount(
    defineComponent({
      setup() {
        conflict = useArmedPassConflict({
          getUserLocation: () => location,
          expandedNoradId,
          expandedPasses,
          armedTick,
        })
        return () => h('div')
      },
    }),
  )
  return { conflict, wrapper, expandedNoradId, expandedPasses, armedTick }
}

// Unmount each host after its test, or its document listener outlives it.
enableAutoUnmount(afterEach)

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW_MS)
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setAutoTuneEnabled('25544', true, { name: 'ISS (ZARYA)' })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useArmedPassConflict', () => {
  it('warns about the armed satellite whose pass overlaps the expanded one', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict } = setup()
    await conflict.refreshArmedPasses('25544')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/space/satellite/7530/passes?lat=54.9&lon=-1.6&hours=24&min_el=0',
    )
    expect(conflict.conflictText.value).toBe(
      `Overlaps AO-7 @ ${clock(15)} — earlier pass keeps the radio`,
    )
  })

  it('names the satellite with the earliest overlapping pass', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    setAutoTuneEnabled('43017', true, { name: 'AO-91' })
    answerPasses({
      '7530': { passes: [passWindow(15, 25)] },
      '43017': { passes: [passWindow(5, 12)] },
    })
    const { conflict } = setup()
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).toBe(
      `Overlaps AO-91 @ ${clock(5)} — earlier pass keeps the radio`,
    )
  })

  it('falls back to the NORAD id for an armed satellite stored without a name', async () => {
    setAutoTuneEnabled('7530', true)
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict } = setup()
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).toContain('Overlaps 7530 @')
  })

  it('says nothing when the passes only touch end to start', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(20, 30), passWindow(0, 10)] } })
    const { conflict } = setup()
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).toBe('')
  })

  it("ignores the other satellite's passes that have already ended", async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(-20, 0)] } })
    const { conflict } = setup({ passes: [accPass(-25, 15)] })
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).toBe('')
  })

  it("ignores the expanded satellite's own passes that have already ended", async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(-5, 5)] } })
    const { conflict } = setup({ passes: [accPass(-10, -1)] })
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).toBe('')
  })

  it('says nothing while no satellite is expanded', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict } = setup({ expanded: '' })
    await conflict.refreshArmedPasses('')
    expect(conflict.conflictText.value).toBe('')
  })

  it('says nothing when the expanded satellite is not armed', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict } = setup({ expanded: '43017' })
    await conflict.refreshArmedPasses('43017')
    expect(conflict.conflictText.value).toBe('')
  })

  it('re-reads arming when armedTick changes', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict, armedTick } = setup()
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).not.toBe('')
    setAutoTuneEnabled('25544', false)
    armedTick.value++
    expect(conflict.conflictText.value).toBe('')
  })

  it('follows changes to the expanded passes', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict, expandedPasses } = setup({ passes: [] })
    await conflict.refreshArmedPasses('25544')
    expect(conflict.conflictText.value).toBe('')
    expandedPasses.value = [accPass(10, 20)]
    expect(conflict.conflictText.value).not.toBe('')
  })

  describe('refreshArmedPasses', () => {
    it('fetches only armed satellites other than the excluded one', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      setPassNotifEnabled('43017', true, 'AO-91')
      answerPasses({ '7530': { passes: [] } })
      const { conflict } = setup()
      await conflict.refreshArmedPasses('25544')
      expect(fetchMock.mock.calls.map(([url]) => url as string)).toEqual([
        '/api/space/satellite/7530/passes?lat=54.9&lon=-1.6&hours=24&min_el=0',
      ])
    })

    it('fetches nothing and clears when no other satellite is armed', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
      const { conflict } = setup()
      await conflict.refreshArmedPasses('25544')
      setAutoTuneEnabled('7530', false)
      fetchMock.mockClear()
      await conflict.refreshArmedPasses('25544')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(conflict.conflictText.value).toBe('')
    })

    it('fetches nothing and clears without a location', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      const { conflict } = setup({ location: null })
      await conflict.refreshArmedPasses('25544')
      expect(fetchMock).not.toHaveBeenCalled()
      expect(conflict.conflictText.value).toBe('')
    })

    it('counts a failed reply or one without passes as no passes', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      setAutoTuneEnabled('43017', true, { name: 'AO-91' })
      setAutoTuneEnabled('40069', true, { name: 'METEOR' })
      answerPasses({ '7530': 'fail', '43017': {}, '40069': { passes: [passWindow(15, 25)] } })
      const { conflict } = setup()
      await conflict.refreshArmedPasses('25544')
      expect(conflict.conflictText.value).toContain('Overlaps METEOR @')
    })

    it('clears on a network error', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
      const { conflict } = setup()
      await conflict.refreshArmedPasses('25544')
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
      await conflict.refreshArmedPasses('25544')
      expect(conflict.conflictText.value).toBe('')
    })

    it('url-encodes the NORAD id', async () => {
      setAutoTuneEnabled('A/B', true, { name: 'ODD' })
      answerPasses({ 'A/B': { passes: [] } })
      const { conflict } = setup()
      await conflict.refreshArmedPasses('25544')
      expect(fetchMock.mock.calls[0]![0]).toContain('/api/space/satellite/A%2FB/passes')
    })
  })

  it('clearArmedPasses forgets the other passes', async () => {
    setAutoTuneEnabled('7530', true, { name: 'AO-7' })
    answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
    const { conflict } = setup()
    await conflict.refreshArmedPasses('25544')
    conflict.clearArmedPasses()
    expect(conflict.conflictText.value).toBe('')
  })

  describe("on 'satellite-auto-tune-changed'", () => {
    it('refetches for an armed expanded satellite', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
      const { conflict } = setup()
      document.dispatchEvent(new Event('satellite-auto-tune-changed'))
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(conflict.conflictText.value).toContain('Overlaps AO-7 @')
    })

    it('clears when the expanded satellite is no longer armed', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
      const { conflict, armedTick } = setup()
      await conflict.refreshArmedPasses('25544')
      expect(conflict.conflictText.value).not.toBe('')
      setAutoTuneEnabled('25544', false)
      document.dispatchEvent(new Event('satellite-auto-tune-changed'))
      // Re-arming without a refetch shows the cleared list held nothing.
      setAutoTuneEnabled('25544', true)
      armedTick.value++
      expect(conflict.conflictText.value).toBe('')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('clears when nothing is expanded', async () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      answerPasses({ '7530': { passes: [passWindow(15, 25)] } })
      const { conflict, expandedNoradId } = setup()
      await conflict.refreshArmedPasses('25544')
      expandedNoradId.value = ''
      document.dispatchEvent(new Event('satellite-auto-tune-changed'))
      expandedNoradId.value = '25544'
      expect(conflict.conflictText.value).toBe('')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('stops listening once unmounted', () => {
      setAutoTuneEnabled('7530', true, { name: 'AO-7' })
      const { wrapper } = setup()
      wrapper.unmount()
      document.dispatchEvent(new Event('satellite-auto-tune-changed'))
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
