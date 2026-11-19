import { ref, computed, nextTick, onBeforeUnmount, type ComputedRef, type Ref } from 'vue'
import type { SdrRecording } from '../sdrRecordings'

// While any recording's IQ is still being copied from the radio hub, re-list
// this often so its IQ button enables once the copy lands.
const IQ_PENDING_RELOAD_MS = 3000

/** What {@link useRecordingsList} gives the RECORDINGS tab. */
export interface RecordingsList {
  recordings: Ref<SdrRecording[]>
  /** The NOTES · MODE filter box's text. */
  filterText: Ref<string>
  /** The recordings whose name, notes, radio or mode contain the filter text. */
  filteredRecordings: ComputedRef<SdrRecording[]>
  /** Re-fetches the list (the panel calls it once a recording stops). */
  reload: () => Promise<void>
}

/**
 * The saved recordings list: fetching it, filtering it, and re-fetching every
 * few seconds while an IQ file is still copying.
 *
 * @param afterReload Runs on the next tick after every fetch (the tab's
 *   scroll-hint check), whether or not the fetch succeeded.
 */
export function useRecordingsList(afterReload: () => void): RecordingsList {
  const recordings = ref<SdrRecording[]>([])
  const filterText = ref('')
  const filteredRecordings = computed(() => {
    const query = filterText.value.toLowerCase()
    if (!query) return recordings.value
    return recordings.value.filter(
      (recording) =>
        (recording.name || '').toLowerCase().includes(query) ||
        (recording.notes || '').toLowerCase().includes(query) ||
        (recording.radio_name || '').toLowerCase().includes(query) ||
        (recording.mode || '').toLowerCase().includes(query),
    )
  })

  let pendingReloadTimer: ReturnType<typeof setTimeout> | null = null

  async function reload(): Promise<void> {
    try {
      const response = await fetch('/api/sdr/recordings', { cache: 'no-store' })
      if (response.ok) recordings.value = await response.json()
    } catch (_) {}
    nextTick(afterReload)
    scheduleReloadWhileIqPending()
  }

  function scheduleReloadWhileIqPending(): void {
    if (pendingReloadTimer !== null) clearTimeout(pendingReloadTimer)
    pendingReloadTimer = null
    if (!recordings.value.some((recording) => recording.iq_file_pending)) return
    pendingReloadTimer = setTimeout(() => {
      pendingReloadTimer = null
      void reload()
    }, IQ_PENDING_RELOAD_MS)
  }

  onBeforeUnmount(() => {
    if (pendingReloadTimer !== null) clearTimeout(pendingReloadTimer)
    pendingReloadTimer = null
  })

  return { recordings, filterText, filteredRecordings, reload }
}
