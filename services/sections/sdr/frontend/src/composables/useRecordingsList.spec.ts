import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { useRecordingsList, type RecordingsList } from './useRecordingsList'
import type { SdrRecording } from '../sdrRecordings'

function makeRecording(overrides: Partial<SdrRecording> = {}): SdrRecording {
  return {
    id: 1,
    name: 'Tower',
    notes: '',
    frequency_hz: 118_700_000,
    mode: 'AM',
    duration_s: 10,
    file_size_bytes: 100,
    started_at: '',
    has_iq_file: false,
    radio_id: 1,
    radio_name: 'rtl0',
    ...overrides,
  }
}

let fetchMock: ReturnType<typeof vi.fn>

function respondWith(recordings: SdrRecording[], ok = true): void {
  fetchMock.mockResolvedValue({ ok, json: () => Promise.resolve(recordings) })
}

// The composable registers onBeforeUnmount, so it runs inside a host component.
function mountList(afterReload = vi.fn()): {
  wrapper: VueWrapper
  list: RecordingsList
  afterReload: ReturnType<typeof vi.fn>
} {
  let list!: RecordingsList
  const wrapper = mount(
    defineComponent({
      setup() {
        list = useRecordingsList(afterReload)
        return () => h('div')
      },
    }),
  )
  return { wrapper, list, afterReload }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fetchMock = vi.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  respondWith([])
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useRecordingsList — loading', () => {
  it('starts empty and fetches nothing until reload', () => {
    const { list } = mountList()
    expect(list.recordings.value).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reload fetches the list uncached and stores it', async () => {
    const recordings = [makeRecording({ id: 1 }), makeRecording({ id: 2 })]
    respondWith(recordings)
    const { list } = mountList()
    await list.reload()
    expect(fetchMock).toHaveBeenCalledWith('/api/sdr/recordings', { cache: 'no-store' })
    expect(list.recordings.value).toEqual(recordings)
  })

  it('keeps the previous list when the server answers an error', async () => {
    const { list } = mountList()
    respondWith([makeRecording({ id: 1 })])
    await list.reload()
    respondWith([makeRecording({ id: 9 })], false)
    await list.reload()
    expect(list.recordings.value.map((recording) => recording.id)).toEqual([1])
  })

  it('keeps the previous list and does not throw when the fetch fails', async () => {
    const { list } = mountList()
    respondWith([makeRecording({ id: 1 })])
    await list.reload()
    fetchMock.mockRejectedValue(new Error('offline'))
    await expect(list.reload()).resolves.toBeUndefined()
    expect(list.recordings.value.map((recording) => recording.id)).toEqual([1])
  })

  it('runs afterReload after every reload, success or failure', async () => {
    const { list, afterReload } = mountList()
    expect(afterReload).not.toHaveBeenCalled()
    await list.reload()
    await flushPromises()
    expect(afterReload).toHaveBeenCalledTimes(1)
    fetchMock.mockRejectedValue(new Error('offline'))
    await list.reload()
    await flushPromises()
    expect(afterReload).toHaveBeenCalledTimes(2)
  })
})

describe('useRecordingsList — filter', () => {
  const recordings = [
    makeRecording({ id: 1, name: 'Tower', notes: '', radio_name: 'rtl0', mode: 'AM' }),
    makeRecording({
      id: 2,
      name: 'Marine',
      notes: 'Coastguard call',
      radio_name: 'rtl1',
      mode: 'NFM',
    }),
    makeRecording({ id: 3, name: '', notes: '', radio_name: 'Kitchen', mode: 'USB' }),
  ]

  async function filtered(text: string): Promise<number[]> {
    respondWith(recordings)
    const { list } = mountList()
    await list.reload()
    list.filterText.value = text
    return list.filteredRecordings.value.map((recording) => recording.id)
  }

  it('shows everything with an empty filter', async () => {
    expect(await filtered('')).toEqual([1, 2, 3])
  })

  it.each([
    ['tower', [1], 'name'],
    ['COASTGUARD', [2], 'notes, case-insensitively'],
    ['kitchen', [3], 'radio name'],
    ['usb', [3], 'mode'],
    ['fm', [2], 'part of a mode'],
    ['rtl', [1, 2], 'several rows'],
  ])('matches %j by %s', async (text, expected) => {
    expect(await filtered(text)).toEqual(expected)
  })

  it('shows nothing when no field matches', async () => {
    expect(await filtered('zzz')).toEqual([])
  })

  it('tolerates missing text fields', async () => {
    respondWith([
      makeRecording({
        id: 4,
        name: undefined as unknown as string,
        notes: undefined as unknown as string,
        radio_name: undefined as unknown as string,
        mode: undefined as unknown as string,
      }),
    ])
    const { list } = mountList()
    await list.reload()
    list.filterText.value = 'a'
    expect(list.filteredRecordings.value).toEqual([])
  })
})

describe('useRecordingsList — re-listing while an IQ file copies', () => {
  it('re-lists every 3 s while any recording is still copying its IQ', async () => {
    respondWith([makeRecording({ iq_file_pending: true })])
    const { list } = mountList()
    await list.reload()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('stops re-listing once the copy has landed', async () => {
    respondWith([makeRecording({ iq_file_pending: true })])
    const { list } = mountList()
    await list.reload()
    respondWith([makeRecording({ iq_file_pending: false })])
    vi.advanceTimersByTime(3000)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(30000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not schedule a re-list when nothing is copying', async () => {
    respondWith([makeRecording({ has_iq_file: true })])
    const { list } = mountList()
    await list.reload()
    vi.advanceTimersByTime(30000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps a single timer when reload is called again before it fires', async () => {
    respondWith([makeRecording({ iq_file_pending: true })])
    const { list } = mountList()
    await list.reload()
    vi.advanceTimersByTime(2000)
    await list.reload()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The first timer was replaced: 1 s later (3 s after the first reload) nothing fires.
    vi.advanceTimersByTime(1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(2000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cancels a pending re-list on unmount', async () => {
    respondWith([makeRecording({ iq_file_pending: true })])
    const { list, wrapper } = mountList()
    await list.reload()
    wrapper.unmount()
    vi.advanceTimersByTime(30000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('unmounts cleanly with no re-list pending', () => {
    const { wrapper } = mountList()
    expect(() => wrapper.unmount()).not.toThrow()
  })
})
