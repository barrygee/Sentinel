import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { registerAirSettings } from '@sentinel/section-air/settings'
import { registerSeaSettings } from '@sentinel/section-sea/settings'
import { useOfferedSettingsSections } from './useOfferedSettingsSections'

registerAirSettings()
registerSeaSettings()

describe('useOfferedSettingsSections', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it("lists every registered section, core's App Settings first", () => {
    const { sections } = useOfferedSettingsSections()
    expect(sections.map((section) => section.key)).toEqual(['app', 'air', 'sea'])
  })

  it('offers a section that is not a domain whatever is switched on', () => {
    useAppStore().enabledDomains = []
    const { isSectionOffered } = useOfferedSettingsSections()
    expect(isSectionOffered('app')).toBe(true)
  })

  it("offers a domain's section only while that domain is switched on", () => {
    useAppStore().enabledDomains = ['air']
    const { isSectionOffered } = useOfferedSettingsSections()
    expect(isSectionOffered('air')).toBe(true)
    expect(isSectionOffered('sea')).toBe(false)
  })

  it('follows the switched-on domains as they change', async () => {
    const appStore = useAppStore()
    appStore.enabledDomains = ['air', 'sea']
    const { offeredSections } = useOfferedSettingsSections()
    expect(offeredSections.value.map((section) => section.key)).toEqual(['app', 'air', 'sea'])
    appStore.enabledDomains = ['sea']
    await nextTick()
    expect(offeredSections.value.map((section) => section.key)).toEqual(['app', 'sea'])
  })
})
