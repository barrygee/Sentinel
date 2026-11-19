import { computed, ref } from 'vue'
import type { SdrFrequencyGroup, SdrMode, SdrStoredFrequency } from './sdrTypes'

/** What a caller supplies to `saveFrequency`; everything else takes the
 *  backend's per-frequency defaults, as a Frequency Manager "add" does. */
interface SaveFrequencyInput {
  label: string
  frequency_hz: number
  mode: SdrMode
  notes?: string
  /** Frequency-group ids to file the frequency under (none = Default). */
  group_ids?: number[]
}

/**
 * The SDR store's frequency library slice: the Frequency Manager's saved
 * frequencies and groups, what is derived from them (groups in use,
 * favourites) and the writes made from outside the SDR panel.
 */
export function useSdrFrequencyLibrary() {
  const groups = ref<SdrFrequencyGroup[]>([])
  const frequencies = ref<SdrStoredFrequency[]>([])

  // Fetch the saved frequency groups and replace `groups`. Single owner of
  // group data. Silently keeps the previous value on a network error or
  // non-2xx response, like loadRadios in the tuning slice.
  async function loadGroups() {
    try {
      const res = await fetch('/api/sdr/groups')
      if (res.ok) groups.value = await res.json()
    } catch {}
  }

  // Fetch the saved (Frequency Manager) frequencies and replace `frequencies`.
  // Single owner of frequency data — both SdrPanel's Frequency Manager UI and
  // SdrWaterfall's known-frequency markers read this same list, so it now
  // carries the full backend shape (group_ids, notes, per-frequency tuning
  // settings) rather than a slimmed-down mirror. Errors are swallowed as in
  // loadGroups.
  async function loadFrequencies() {
    try {
      const res = await fetch('/api/sdr/frequencies')
      if (res.ok) frequencies.value = await res.json()
    } catch {}
  }

  /**
   * The groups a stored frequency belongs to. Merges the current many-to-many
   * `group_ids` with the legacy single `group_id` (0 / null mean "Default",
   * i.e. no group).
   */
  function freqGroupsFor(freq: SdrStoredFrequency): SdrFrequencyGroup[] {
    const ids = new Set<number>((freq.group_ids || []).filter((id) => id !== 0))
    if (freq.group_id != null && freq.group_id !== 0) ids.add(freq.group_id)
    return groups.value.filter((group) => ids.has(group.id))
  }

  /**
   * The groups referenced by at least one of `freqs`, sorted
   * case-insensitively by name.
   */
  function groupsReferencedBy(freqs: SdrStoredFrequency[]): SdrFrequencyGroup[] {
    const referencedIds = new Set<number>()
    freqs.forEach((freq) => {
      ;(freq.group_ids || []).forEach((id) => {
        if (id !== 0) referencedIds.add(id)
      })
      if (freq.group_id != null && freq.group_id !== 0) referencedIds.add(freq.group_id)
    })
    return groups.value
      .filter((group) => referencedIds.has(group.id))
      .slice()
      .sort((first, second) =>
        first.name.localeCompare(second.name, undefined, { sensitivity: 'base' }),
      )
  }

  /**
   * Groups that currently have at least one stored frequency. Drives the
   * RADIO tab's scan-group chips and the Frequency Manager's group filter.
   */
  const groupsWithFreqs = computed<SdrFrequencyGroup[]>(() => groupsReferencedBy(frequencies.value))

  /**
   * Frequencies the user has starred. Drives the RADIO panel's FAVOURITES
   * accordion — a fixed shortcut list distinct from the full Frequency
   * Manager, kept as a computed (not a separate fetch) since `frequencies`
   * already carries the `favourite` column.
   */
  const favouriteFrequencies = computed<SdrStoredFrequency[]>(() =>
    frequencies.value.filter((freq) => freq.favourite === true),
  )

  /**
   * Toggle a stored frequency's favourite flag. Uses the dedicated
   * `PATCH /api/sdr/frequencies/{id}` favourite-only body rather than the
   * full-replace frequency PUT — that endpoint setattrs every field from a
   * client-supplied `FrequencyIn`, so a partial/stale caller would silently
   * reset tuning settings (mode/gain/scannable/groups) back to their
   * defaults. This is the store's first write action: it is invoked from two
   * components (the manager's row star and the favourites list's unfavourite
   * button), so the fetch lives here once rather than being duplicated in
   * both. Rejects on a non-OK response so callers can surface the failure;
   * the local row is left untouched until a successful response confirms it.
   */
  async function setFrequencyFavourite(frequencyId: number, favourite: boolean): Promise<void> {
    const res = await fetch(`/api/sdr/frequencies/${frequencyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ favourite }),
    })
    if (!res.ok) throw new Error(`Failed to set favourite (status ${res.status})`)
    const updated = (await res.json()) as SdrStoredFrequency
    const index = frequencies.value.findIndex((freq) => freq.id === frequencyId)
    if (index !== -1) frequencies.value[index] = updated
  }

  /**
   * The id of the frequency group with this name, creating it (in the SDR
   * accent colour, after the existing groups) if the manager has none yet —
   * so a caller filing frequencies from elsewhere (the Land pane's repeaters)
   * can keep them together without the operator making the group first.
   * Rejects on a non-OK response.
   */
  async function ensureFrequencyGroup(name: string): Promise<number> {
    if (groups.value.length === 0) await loadGroups()
    // Matched loosely — case, spacing and a plural "s" ignored — so an
    // operator's existing "Repeater" group is reused rather than doubled.
    const normalise = (value: string) => value.trim().toLowerCase().replace(/s$/, '')
    const wanted = normalise(name)
    const existing = groups.value.find((group) => normalise(group.name) === wanted)
    if (existing) return existing.id
    const res = await fetch('/api/sdr/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color: '#c8ff00', sort_order: groups.value.length }),
    })
    if (!res.ok) throw new Error(`Failed to create frequency group (status ${res.status})`)
    const created = (await res.json()) as SdrFrequencyGroup
    await loadGroups()
    return created.id
  }

  /**
   * Add a frequency to the Frequency Manager from outside the SDR panel — a
   * repeater's output in the Land pane, say. `POST /api/sdr/frequencies` with
   * the manager's own defaults (scannable, not a favourite, no group), then
   * the list is reloaded so the waterfall markers and favourites follow.
   * Rejects on a non-OK response so callers can surface the failure.
   */
  async function saveFrequency(input: SaveFrequencyInput): Promise<SdrStoredFrequency> {
    const res = await fetch('/api/sdr/frequencies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: input.label,
        frequency_hz: input.frequency_hz,
        mode: input.mode,
        scannable: true,
        favourite: false,
        group_ids: input.group_ids ?? [],
        notes: input.notes ?? '',
      }),
    })
    if (!res.ok) throw new Error(`Failed to save frequency (status ${res.status})`)
    const saved = (await res.json()) as SdrStoredFrequency
    await loadFrequencies()
    return saved
  }

  /** Whether the Frequency Manager already holds this exact frequency (Hz). */
  function hasStoredFrequency(frequencyHz: number): boolean {
    return frequencies.value.some((freq) => freq.frequency_hz === frequencyHz)
  }

  /**
   * Remove every stored frequency at exactly this Hz — the bookmark's undo,
   * from outside the SDR panel. `DELETE /api/sdr/frequencies/{id}` per row,
   * then the list is reloaded. Rejects on a non-OK response.
   */
  async function removeStoredFrequency(frequencyHz: number): Promise<void> {
    const matching = frequencies.value.filter((freq) => freq.frequency_hz === frequencyHz)
    for (const freq of matching) {
      const res = await fetch(`/api/sdr/frequencies/${freq.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`Failed to remove frequency (status ${res.status})`)
    }
    await loadFrequencies()
  }

  return {
    groups,
    frequencies,
    loadGroups,
    loadFrequencies,
    freqGroupsFor,
    groupsWithFreqs,
    favouriteFrequencies,
    setFrequencyFavourite,
    saveFrequency,
    ensureFrequencyGroup,
    hasStoredFrequency,
    removeStoredFrequency,
  }
}
