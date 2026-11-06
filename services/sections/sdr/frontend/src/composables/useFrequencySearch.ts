import { ref } from 'vue'
import type { SdrFrequencyGroup, SdrStoredFrequency } from '../stores/sdr'

/**
 * `useFrequencySearch` — the text search behind the Frequency Manager's side
 * panel field: the query, and a `searchFrequencies` helper that narrows a list
 * to the frequencies matching it.
 *
 * A frequency matches when every space-separated word appears somewhere in its
 * label, MHz figure (as the row shows it, to 4dp, so `118.38` finds 118.3800),
 * mode, group names or notes, ignoring case. Words rather than one phrase, so
 * `airband am` finds an AM frequency in an Airband group.
 *
 * @param freqGroupsFor - resolves a stored frequency to the groups it belongs
 *   to (the store's `freqGroupsFor`, or an equivalent).
 */
export function useFrequencySearch(
  freqGroupsFor: (freq: SdrStoredFrequency) => SdrFrequencyGroup[],
) {
  const query = ref('')

  function searchableText(freq: SdrStoredFrequency): string {
    return [
      freq.label,
      (freq.frequency_hz / 1e6).toFixed(4),
      freq.mode,
      ...freqGroupsFor(freq).map((group) => group.name),
      freq.notes ?? '',
    ]
      .join(' ')
      .toLowerCase()
  }

  function searchFrequencies(list: SdrStoredFrequency[]): SdrStoredFrequency[] {
    const words = query.value.toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return list
    return list.filter((freq) => {
      const text = searchableText(freq)
      return words.every((word) => text.includes(word))
    })
  }

  return { query, searchFrequencies }
}
