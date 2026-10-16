import { computed } from 'vue'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { getSettingsSections } from '@sentinel/shell-api/shell/settingsRegistry'
// Core's own 'app' section registers on import, so it is in the list wherever
// this is used (the Settings panel, the docs rail).
import '@/components/shared/settings/appSettings'

/**
 * The Settings sections the menu offers: every registered section, except a
 * domain's while that domain is switched off. Shared by the Settings rail and
 * the docs rail, so both show the same buttons in the same order.
 */
export function useOfferedSettingsSections() {
  const appStore = useAppStore()
  const sections = getSettingsSections()
  const domainSectionKeys = new Set(
    sections.filter((section) => section.domain).map((section) => section.key),
  )
  /** Whether a section key is offered now (a domain's only while it is on). */
  function isSectionOffered(key: string): boolean {
    return !domainSectionKeys.has(key) || appStore.enabledDomains.includes(key)
  }
  const offeredSections = computed(() =>
    sections.filter((section) => isSectionOffered(section.key)),
  )
  return { sections, isSectionOffered, offeredSections }
}
