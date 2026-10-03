import type { SettingItem } from '@/types/settings'

/**
 * Settings registry (docs/plans/section-containers.md §3.6, F3).
 *
 * The Settings panel is core, but most of what it lists belongs to a section:
 * AIR's data sources, SEA's AISStream key, LAND's APRS channel. Each section
 * registers its nav entry and its items — label, search words and the control
 * that edits it — so the panel and `SettingRow` import no section controls and
 * an absent section's settings simply aren't offered. Core registers the
 * `app` section the same way (`components/shared/settings/appSettings.ts`).
 */

/** A Settings nav entry. */
export interface SettingsSection {
  /** Matches `SettingItem.section`, e.g. 'sea'. */
  key: string
  /** Nav label, e.g. 'SEA' or 'App Settings'. */
  label: string
  /** Nav position; lower first. Items are listed in section order too. */
  order: number
  /**
   * A domain section (air/space/sea/land/sdr) is shown, and searched, only
   * while that domain is enabled. Core's `app` section always is.
   */
  domain: boolean
}

const sections = new Map<string, SettingsSection>()
const items: SettingItem[] = []

/** Registers a nav entry. Each key once. */
export function registerSettingsSection(section: SettingsSection): void {
  if (sections.has(section.key)) {
    throw new Error(`Settings section "${section.key}" is already registered`)
  }
  sections.set(section.key, section)
}

/** Registers items, listed in this order within their section. Ids must be unique. */
export function registerSettingItems(newItems: readonly SettingItem[]): void {
  for (const item of newItems) {
    if (items.some((existing) => existing.id === item.id)) {
      throw new Error(`Setting "${item.id}" is already registered`)
    }
    items.push(item)
  }
}

function sectionOrder(key: string): number {
  return sections.get(key)?.order ?? Number.MAX_SAFE_INTEGER
}

/** Every nav entry, in nav order. */
export function getSettingsSections(): SettingsSection[] {
  return [...sections.values()].sort((first, second) => first.order - second.order)
}

/** Every item, grouped by section in nav order, each section's items in registration order. */
export function getSettingItems(): SettingItem[] {
  // Array.prototype.sort is stable, so items keep their registration order within a section.
  return [...items].sort(
    (first, second) => sectionOrder(first.section) - sectionOrder(second.section),
  )
}

/** Test seam: forget every registration. */
export function resetSettingsRegistryForTests(): void {
  sections.clear()
  items.length = 0
}
