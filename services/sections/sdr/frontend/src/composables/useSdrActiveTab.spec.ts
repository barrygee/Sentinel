import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SDR_PANEL_TABS, useSdrActiveTab } from './useSdrActiveTab'

const STORAGE_KEY = 'sentinel_sdr_tab'

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('SDR_PANEL_TABS', () => {
  it('lists the five tabs in rail order with their names', () => {
    expect(SDR_PANEL_TABS).toEqual([
      { id: 'radio', label: 'RADIO' },
      { id: 'frequency-manager', label: 'FREQUENCY MANAGER' },
      { id: 'groups', label: 'GROUPS' },
      { id: 'search-ranges', label: 'SEARCH RANGES' },
      { id: 'recordings', label: 'RECORDINGS' },
    ])
  })
})

describe('useSdrActiveTab — restore', () => {
  it('starts on RADIO with nothing stored, and tells the store at setup', () => {
    const setStoreActiveTab = vi.fn()
    const { activeSdrTab } = useSdrActiveTab(setStoreActiveTab)
    expect(activeSdrTab.value).toBe('radio')
    expect(setStoreActiveTab).toHaveBeenCalledExactlyOnceWith('radio')
  })

  it.each(SDR_PANEL_TABS.map((tab) => tab.id))('restores a stored %s tab', (tabId) => {
    sessionStorage.setItem(STORAGE_KEY, tabId)
    const setStoreActiveTab = vi.fn()
    expect(useSdrActiveTab(setStoreActiveTab).activeSdrTab.value).toBe(tabId)
    expect(setStoreActiveTab).toHaveBeenCalledWith(tabId)
  })

  it('falls back to RADIO for a stored value that is not a tab', () => {
    sessionStorage.setItem(STORAGE_KEY, 'trunking')
    expect(useSdrActiveTab(vi.fn()).activeSdrTab.value).toBe('radio')
  })

  it('falls back to RADIO for an empty stored value', () => {
    sessionStorage.setItem(STORAGE_KEY, '')
    expect(useSdrActiveTab(vi.fn()).activeSdrTab.value).toBe('radio')
  })

  it('falls back to RADIO when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(useSdrActiveTab(vi.fn()).activeSdrTab.value).toBe('radio')
  })
})

describe('useSdrActiveTab — switch', () => {
  it('updates the ref, tells the store and remembers the tab', () => {
    const setStoreActiveTab = vi.fn()
    const { activeSdrTab, switchSdrTab } = useSdrActiveTab(setStoreActiveTab)
    switchSdrTab('recordings')
    expect(activeSdrTab.value).toBe('recordings')
    expect(setStoreActiveTab).toHaveBeenLastCalledWith('recordings')
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('recordings')
  })

  it('is restored by the next instance', () => {
    useSdrActiveTab(vi.fn()).switchSdrTab('groups')
    expect(useSdrActiveTab(vi.fn()).activeSdrTab.value).toBe('groups')
  })

  it('still switches when sessionStorage cannot be written', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const setStoreActiveTab = vi.fn()
    const { activeSdrTab, switchSdrTab } = useSdrActiveTab(setStoreActiveTab)
    expect(() => switchSdrTab('search-ranges')).not.toThrow()
    expect(activeSdrTab.value).toBe('search-ranges')
    expect(setStoreActiveTab).toHaveBeenLastCalledWith('search-ranges')
  })
})
