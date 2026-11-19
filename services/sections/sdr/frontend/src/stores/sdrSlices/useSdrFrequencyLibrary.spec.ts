import { describe, it, expect, afterEach, vi } from 'vitest'
import { useSdrFrequencyLibrary } from './useSdrFrequencyLibrary'
import type { SdrFrequencyGroup, SdrStoredFrequency } from './sdrTypes'

const group = (id: number, name: string): SdrFrequencyGroup => ({
  id,
  name,
  slug: name.toLowerCase(),
  color: '#fff',
  sort_order: id,
})
const frequency = (
  overrides: Partial<SdrStoredFrequency> & { id: number },
): SdrStoredFrequency => ({
  group_id: null,
  label: `F${overrides.id}`,
  frequency_hz: 145_000_000 + overrides.id,
  mode: 'NFM',
  ...overrides,
})

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body }
}

describe('useSdrFrequencyLibrary', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts empty', () => {
    const library = useSdrFrequencyLibrary()
    expect(library.groups.value).toEqual([])
    expect(library.frequencies.value).toEqual([])
    expect(library.groupsWithFreqs.value).toEqual([])
    expect(library.favouriteFrequencies.value).toEqual([])
  })

  describe.each([
    ['loadGroups', 'groups', '/api/sdr/groups'],
    ['loadFrequencies', 'frequencies', '/api/sdr/frequencies'],
  ] as const)('%s', (loaderName, listName, url) => {
    it(`replaces ${listName} from ${url}`, async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([{ id: 9 }]))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      await library[loaderName]()
      expect(fetchMock).toHaveBeenCalledWith(url)
      expect(library[listName].value).toEqual([{ id: 9 }])
    })

    it('keeps the previous list on a non-OK response or a network error', async () => {
      const library = useSdrFrequencyLibrary()
      library[listName].value = [{ id: 1 }] as never
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([], false, 500)))
      await library[loaderName]()
      expect(library[listName].value).toEqual([{ id: 1 }])
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      await expect(library[loaderName]()).resolves.toBeUndefined()
      expect(library[listName].value).toEqual([{ id: 1 }])
    })
  })

  describe('group membership', () => {
    it('merges group_ids with the legacy group_id, treating 0 and null as Default', () => {
      const library = useSdrFrequencyLibrary()
      // A row with id 0 must still never match: 0 means Default, not a group.
      library.groups.value = [
        group(0, 'Zero'),
        group(1, 'Air'),
        group(2, 'Marine'),
        group(3, 'Ham'),
      ]
      expect(library.freqGroupsFor(frequency({ id: 1, group_ids: [0, 2], group_id: 3 }))).toEqual([
        group(2, 'Marine'),
        group(3, 'Ham'),
      ])
      expect(library.freqGroupsFor(frequency({ id: 2, group_id: 0 }))).toEqual([])
      expect(library.freqGroupsFor(frequency({ id: 3 }))).toEqual([])
    })

    it('lists only groups in use, sorted by name ignoring case', () => {
      const library = useSdrFrequencyLibrary()
      library.groups.value = [
        group(0, 'Zero'),
        group(1, 'marine'),
        group(2, 'Unused'),
        group(3, 'Air'),
        group(4, 'ham'),
      ]
      library.frequencies.value = [
        frequency({ id: 1, group_ids: [1, 0] }),
        frequency({ id: 2, group_id: 4 }),
        frequency({ id: 3, group_ids: [3], group_id: 0 }),
        frequency({ id: 4 }),
      ]
      expect(library.groupsWithFreqs.value.map((entry) => entry.name)).toEqual([
        'Air',
        'ham',
        'marine',
      ])
      expect(library.groups.value.map((entry) => entry.id)).toEqual([0, 1, 2, 3, 4])
    })
  })

  it('keeps names differing only in case in their original order', () => {
    const library = useSdrFrequencyLibrary()
    library.groups.value = [group(1, 'Air'), group(2, 'air')]
    library.frequencies.value = [frequency({ id: 1, group_ids: [1, 2] })]
    expect(library.groupsWithFreqs.value.map((entry) => entry.id)).toEqual([1, 2])
  })

  describe('favourites', () => {
    it('lists only frequencies explicitly starred', () => {
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [
        frequency({ id: 1, favourite: true }),
        frequency({ id: 2, favourite: false }),
        frequency({ id: 3 }),
      ]
      expect(library.favouriteFrequencies.value.map((entry) => entry.id)).toEqual([1])
    })

    it('PATCHes only the favourite flag and replaces the row with the reply', async () => {
      const updated = frequency({ id: 2, favourite: true, label: 'Updated' })
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(updated))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [frequency({ id: 1 }), frequency({ id: 2 })]
      await library.setFrequencyFavourite(2, true)
      expect(fetchMock).toHaveBeenCalledWith('/api/sdr/frequencies/2', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favourite: true }),
      })
      expect(library.frequencies.value[1]).toEqual(updated)
      expect(library.frequencies.value[0]).toEqual(frequency({ id: 1 }))
    })

    it('leaves the list alone when the row is no longer there', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(frequency({ id: 5 }))))
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [frequency({ id: 1 })]
      await library.setFrequencyFavourite(5, true)
      expect(library.frequencies.value).toEqual([frequency({ id: 1 })])
    })

    it('rejects with the status and keeps the row on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 409)))
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [frequency({ id: 1 })]
      await expect(library.setFrequencyFavourite(1, true)).rejects.toThrow('status 409')
      expect(library.frequencies.value).toEqual([frequency({ id: 1 })])
    })
  })

  describe('ensureFrequencyGroup', () => {
    it('reuses a loosely matching group without creating one', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      library.groups.value = [group(1, 'Air'), group(7, '  Repeater ')]
      await expect(library.ensureFrequencyGroup('REPEATERS')).resolves.toBe(7)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('loads the groups first when none are held, then matches', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([group(3, 'Repeaters')]))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      await expect(library.ensureFrequencyGroup('Repeaters')).resolves.toBe(3)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith('/api/sdr/groups')
    })

    it('creates the group after the existing ones, then reloads', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(group(11, 'Repeaters')))
        .mockResolvedValueOnce(jsonResponse([group(1, 'Air'), group(11, 'Repeaters')]))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      library.groups.value = [group(1, 'Air')]
      await expect(library.ensureFrequencyGroup('Repeaters')).resolves.toBe(11)
      expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/sdr/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Repeaters', color: '#c8ff00', sort_order: 1 }),
      })
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sdr/groups')
      expect(library.groups.value).toHaveLength(2)
    })

    it('rejects when the group cannot be created', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false, 422)))
      const library = useSdrFrequencyLibrary()
      library.groups.value = [group(1, 'Air')]
      await expect(library.ensureFrequencyGroup('Ham')).rejects.toThrow('status 422')
    })
  })

  describe('saveFrequency', () => {
    it('POSTs with the manager defaults and reloads the list', async () => {
      const saved = frequency({ id: 30 })
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(saved))
        .mockResolvedValueOnce(jsonResponse([saved]))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      await expect(
        library.saveFrequency({ label: 'GB3XX', frequency_hz: 145_600_000, mode: 'NFM' }),
      ).resolves.toEqual(saved)
      expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
        label: 'GB3XX',
        frequency_hz: 145_600_000,
        mode: 'NFM',
        scannable: true,
        favourite: false,
        group_ids: [],
        notes: '',
      })
      expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/sdr/frequencies')
      expect(library.frequencies.value).toEqual([saved])
    })

    it('passes given groups and notes through', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
      vi.stubGlobal('fetch', fetchMock)
      await useSdrFrequencyLibrary().saveFrequency({
        label: 'X',
        frequency_hz: 1,
        mode: 'AM',
        notes: 'tower',
        group_ids: [4],
      })
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.group_ids).toEqual([4])
      expect(body.notes).toBe('tower')
    })

    it('rejects without reloading on failure', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 400))
      vi.stubGlobal('fetch', fetchMock)
      await expect(
        useSdrFrequencyLibrary().saveFrequency({ label: 'X', frequency_hz: 1, mode: 'AM' }),
      ).rejects.toThrow('status 400')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('stored frequency lookup and removal', () => {
    it('matches an exact frequency only', () => {
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [frequency({ id: 1, frequency_hz: 145_500_000 })]
      expect(library.hasStoredFrequency(145_500_000)).toBe(true)
      expect(library.hasStoredFrequency(145_500_001)).toBe(false)
    })

    it('deletes every row at that frequency, then reloads', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [
        frequency({ id: 1, frequency_hz: 100 }),
        frequency({ id: 2, frequency_hz: 200 }),
        frequency({ id: 3, frequency_hz: 100 }),
      ]
      await library.removeStoredFrequency(100)
      expect(fetchMock.mock.calls).toEqual([
        ['/api/sdr/frequencies/1', { method: 'DELETE' }],
        ['/api/sdr/frequencies/3', { method: 'DELETE' }],
        ['/api/sdr/frequencies'],
      ])
    })

    it('stops at the first failed delete and rejects', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 404))
      vi.stubGlobal('fetch', fetchMock)
      const library = useSdrFrequencyLibrary()
      library.frequencies.value = [
        frequency({ id: 1, frequency_hz: 100 }),
        frequency({ id: 2, frequency_hz: 100 }),
      ]
      await expect(library.removeStoredFrequency(100)).rejects.toThrow('status 404')
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
