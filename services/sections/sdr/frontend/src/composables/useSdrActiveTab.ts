import { ref } from 'vue'
import type { SdrTab } from '../stores/sdr'

/** sessionStorage key holding the last SDR panel tab, so a reload reopens it. */
const SDR_TAB_STORAGE_KEY = 'sentinel_sdr_tab'

/** The SDR panel's tabs, in rail order, with the names the rail shows. */
export const SDR_PANEL_TABS: ReadonlyArray<{ id: SdrTab; label: string }> = [
  { id: 'radio', label: 'RADIO' },
  { id: 'frequency-manager', label: 'FREQUENCY MANAGER' },
  { id: 'groups', label: 'GROUPS' },
  { id: 'search-ranges', label: 'SEARCH RANGES' },
  { id: 'recordings', label: 'RECORDINGS' },
]

function restoreSdrTab(): SdrTab {
  try {
    const storedTab = sessionStorage.getItem(SDR_TAB_STORAGE_KEY) as SdrTab | null
    if (storedTab && SDR_PANEL_TABS.some((tab) => tab.id === storedTab)) return storedTab
  } catch {}
  return 'radio'
}

/**
 * Which SDR panel tab is showing: restored from sessionStorage, remembered on
 * every switch, and mirrored into the SDR store (`setActiveTab`) so the footer
 * indicator follows it.
 *
 * @param setStoreActiveTab the store's `setActiveTab`; called once at setup with
 *   the restored tab, so the indicator is right from first paint.
 */
export function useSdrActiveTab(setStoreActiveTab: (tab: SdrTab) => void) {
  const activeSdrTab = ref<SdrTab>(restoreSdrTab())
  setStoreActiveTab(activeSdrTab.value)

  function switchSdrTab(tab: SdrTab) {
    activeSdrTab.value = tab
    setStoreActiveTab(tab)
    try {
      sessionStorage.setItem(SDR_TAB_STORAGE_KEY, tab)
    } catch {}
  }

  return { activeSdrTab, switchSdrTab }
}
