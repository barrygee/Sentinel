import type { Component } from 'vue'

/**
 * Footer registry (docs/plans/section-containers.md §3.6).
 *
 * The footer is core, but a section may show live state there whichever page
 * is open — SDR's tuned-frequency readout. Sections register a small component
 * here; `AppFooter` renders each before its settings button and passes it
 * `activeSectionId` (the section on screen), so the footer imports no section
 * store.
 */
export interface FooterItem {
  /** Stable id, e.g. 'sdr-frequency'. */
  id: string
  /** Left-to-right position among footer items; lower first. */
  order: number
  /** Rendered with prop `activeSectionId: string`. */
  component: Component
}

const items: FooterItem[] = []

/** Registers a footer item. Each id once. */
export function registerFooterItem(item: FooterItem): void {
  if (items.some((existing) => existing.id === item.id)) {
    throw new Error(`Footer item "${item.id}" is already registered`)
  }
  items.push(item)
  items.sort((first, second) => first.order - second.order)
}

/** Every registered footer item, in order. */
export function getFooterItems(): readonly FooterItem[] {
  return items
}

/** Test seam: forget every registered item. */
export function resetFooterRegistryForTests(): void {
  items.length = 0
}
