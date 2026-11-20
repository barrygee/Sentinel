import { describe, it, expect, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { useSatelliteFilterResults } from './useSatelliteFilterResults'
import type { SatEntry } from './spaceFilterTypes'

function sat(noradId: string, name: string, category: string | null): SatEntry {
  return { norad_id: noradId, name, category, updated_at: null }
}

const LOADED = [
  sat('25544', 'ISS (ZARYA)', 'space_station'),
  sat('7530', 'AO-7', 'amateur'),
  sat('43017', 'AO-91', 'amateur'),
  sat('99999', '', 'amateur'),
]

// Runs the composable in an effect scope (its watch needs one), with setters
// that write through to the refs the way the space store does.
function setup(
  options: { satellites?: SatEntry[]; category?: string; query?: string; expanded?: string } = {},
) {
  const satellites = ref<SatEntry[]>(options.satellites ?? LOADED)
  const query = ref(options.query ?? '')
  const filterCategory = ref(options.category ?? 'amateur')
  const expandedNoradId = ref(options.expanded ?? '')
  const setAvailableCategories = vi.fn()
  const setFilterCategory = vi.fn((category: string) => (filterCategory.value = category))
  const scope = effectScope()
  const results = scope.run(() =>
    useSatelliteFilterResults({
      satellites,
      query,
      filterCategory,
      expandedNoradId,
      setAvailableCategories,
      setFilterCategory,
    }),
  )!
  return {
    satellites,
    query,
    filterCategory,
    expandedNoradId,
    setAvailableCategories,
    setFilterCategory,
    results,
    scope,
  }
}

describe('useSatelliteFilterResults', () => {
  describe('category sub-tabs', () => {
    it('publishes the categories present at once and keeps a valid selection', () => {
      const { setAvailableCategories, setFilterCategory, filterCategory } = setup()
      expect(setAvailableCategories).toHaveBeenCalledWith(['space_station', 'amateur'])
      expect(setFilterCategory).not.toHaveBeenCalled()
      expect(filterCategory.value).toBe('amateur')
    })

    it('moves a selection whose category has no satellites to the first one that has', () => {
      const { setFilterCategory, filterCategory } = setup({ category: 'weather' })
      expect(setFilterCategory).toHaveBeenCalledWith('space_station')
      expect(filterCategory.value).toBe('space_station')
    })

    it('clears the selection while nothing is loaded, then repairs it once satellites arrive', async () => {
      const { satellites, setAvailableCategories, setFilterCategory, filterCategory } = setup({
        satellites: [],
      })
      expect(setAvailableCategories).toHaveBeenLastCalledWith([])
      expect(setFilterCategory).toHaveBeenLastCalledWith('')
      expect(filterCategory.value).toBe('')

      satellites.value = LOADED
      await nextTick()
      expect(setAvailableCategories).toHaveBeenLastCalledWith(['space_station', 'amateur'])
      expect(filterCategory.value).toBe('space_station')
    })

    it('keeps the sub-tab set stable while the query narrows the rows', async () => {
      const { query, setAvailableCategories } = setup()
      setAvailableCategories.mockClear()
      query.value = 'iss'
      await nextTick()
      expect(setAvailableCategories).not.toHaveBeenCalled()
    })
  })

  describe('items', () => {
    it("lists only the selected category's satellites, with their row text", () => {
      const { results } = setup()
      expect(results.items.value).toEqual([
        {
          key: '7530',
          primary: 'AO-7',
          secondary: 'AMATEUR · NORAD 7530',
          optionLabel: 'AO-7, AMATEUR · NORAD 7530, collapsed',
        },
        {
          key: '43017',
          primary: 'AO-91',
          secondary: 'AMATEUR · NORAD 43017',
          optionLabel: 'AO-91, AMATEUR · NORAD 43017, collapsed',
        },
        {
          key: '99999',
          primary: '99999',
          secondary: 'AMATEUR · NORAD 99999',
          optionLabel: '99999, AMATEUR · NORAD 99999, collapsed',
        },
      ])
    })

    it('labels the expanded row as expanded', async () => {
      const { results, expandedNoradId } = setup()
      expandedNoradId.value = '43017'
      await nextTick()
      expect(results.items.value.map((item) => item.optionLabel)).toEqual([
        'AO-7, AMATEUR · NORAD 7530, collapsed',
        'AO-91, AMATEUR · NORAD 43017, expanded',
        '99999, AMATEUR · NORAD 99999, collapsed',
      ])
    })

    it('narrows by the query within the selected category', async () => {
      const { results, query } = setup()
      query.value = 'ao-91'
      await nextTick()
      expect(results.items.value.map((item) => item.key)).toEqual(['43017'])
    })

    it('is empty when the query matches nothing in the selected category', async () => {
      const { results, query } = setup()
      query.value = 'iss'
      await nextTick()
      expect(results.items.value).toEqual([])
    })

    it('follows a change of category', async () => {
      const { results, filterCategory } = setup()
      filterCategory.value = 'space_station'
      await nextTick()
      expect(results.items.value.map((item) => item.key)).toEqual(['25544'])
    })
  })

  describe('expandedSat', () => {
    it('is undefined while nothing is expanded', () => {
      expect(setup().results.expandedSat.value).toBeUndefined()
    })

    it('resolves from the full loaded set, even when the query hides its row', async () => {
      const { results, query } = setup({ expanded: '25544' })
      query.value = 'ao'
      await nextTick()
      expect(results.expandedSat.value).toEqual(LOADED[0])
    })

    it('is undefined for an id that is not loaded', () => {
      expect(setup({ expanded: '1' }).results.expandedSat.value).toBeUndefined()
    })
  })

  it('stops publishing categories once its scope is disposed', async () => {
    const { scope, satellites, setAvailableCategories } = setup()
    setAvailableCategories.mockClear()
    scope.stop()
    satellites.value = [sat('1', 'NOAA 19', 'weather')]
    await nextTick()
    expect(setAvailableCategories).not.toHaveBeenCalled()
  })
})
