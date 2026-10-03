import type { Component } from 'vue'
import type { SidebarPaneId } from '@/constants/sidebarPanes'

/**
 * Sidebar registry (docs/plans/section-containers.md §3.6, F2).
 *
 * `MapSidebar` is core, but two parts of its rail belong to sections:
 *  - the FILTER sub-tabs shown under the FILTER tab — what they are, which one
 *    is lit, and what picking one does (Air's aircraft/airports/bases, Sea's
 *    vessel families, Land's layers, Space's satellite categories);
 *  - rail tabs only one section has (Space's PASSES).
 * Sections register those here, so the sidebar holds no section stores or
 * category lists. The pane DOM ids the sections teleport into are unchanged
 * (`constants/sidebarPanes.ts`).
 */

/** One FILTER sub-tab. */
export interface SidebarFilterSubTab {
  id: string
  label: string
  /** Greyed out, with the label saying why (e.g. Land's APRS with no receiver). */
  disabled?: boolean
}

/** A section's FILTER sub-tabs. Store access happens inside each call, never at registration. */
export interface SidebarFilterSubTabs {
  /** The sub-tabs right now. Read inside a computed, so its reactive reads are tracked. */
  tabs(): SidebarFilterSubTab[]
  /** Whether a sub-tab is lit. */
  isActive(id: string): boolean
  /** What picking a sub-tab does (the sidebar has already switched to FILTER). */
  select(id: string): void
  /** Renders a sub-tab's glyph; receives the sub-tab id as `category`. */
  icon: Component
}

/** A rail tab only one section shows, e.g. Space's PASSES. */
export interface SidebarSectionTab {
  /** The pane it opens — one of the sidebar's existing panes. */
  id: SidebarPaneId
  label: string
  /** The section whose routes show it; hidden elsewhere. */
  sectionId: string
  /** The rail glyph. */
  icon: Component
}

const filterSubTabsBySection = new Map<string, SidebarFilterSubTabs>()
const sectionTabs: SidebarSectionTab[] = []

/** Registers a section's FILTER sub-tabs. Once per section. */
export function registerSidebarFilterSubTabs(
  sectionId: string,
  subTabs: SidebarFilterSubTabs,
): void {
  if (filterSubTabsBySection.has(sectionId)) {
    throw new Error(`Section "${sectionId}" already registered sidebar filter sub-tabs`)
  }
  filterSubTabsBySection.set(sectionId, subTabs)
}

/** A section's FILTER sub-tabs, or undefined when it has none (e.g. SDR). */
export function getSidebarFilterSubTabs(sectionId: string): SidebarFilterSubTabs | undefined {
  return filterSubTabsBySection.get(sectionId)
}

/** Registers a section-only rail tab. Each tab id once. */
export function registerSidebarSectionTab(tab: SidebarSectionTab): void {
  if (sectionTabs.some((existing) => existing.id === tab.id)) {
    throw new Error(`Sidebar tab "${tab.id}" is already registered`)
  }
  sectionTabs.push(tab)
}

/** Every registered section-only rail tab, in registration order. */
export function getSidebarSectionTabs(): readonly SidebarSectionTab[] {
  return sectionTabs
}

/** Test seam: forget every registration. */
export function resetSidebarRegistryForTests(): void {
  filterSubTabsBySection.clear()
  sectionTabs.length = 0
}
