import type { Component } from 'vue'

/**
 * Shared types for the Settings panel's data-driven control registry.
 *
 * Sections register `SettingItem`s with `shell/settingsRegistry.ts`;
 * `SettingsPanel.vue` lists them and `SettingRow.vue` renders each item's
 * `control`. Several modules depend on this shape, so it lives here rather
 * than inside any one of them.
 */

/** How a setting is edited: the control, its props, and how it talks to the panel. */
export interface SettingControl {
  component: Component
  /** Props passed to the control, e.g. a settings namespace or a file's URLs. */
  props?: Record<string, unknown>
  /**
   * The panel events the control emits: `stage` hands APPLY CHANGES a
   * closure to run; `commit` asks the panel to apply now. A control that
   * applies everything itself emits neither.
   */
  emits?: ReadonlyArray<'stage' | 'commit'>
  /**
   * Card width: two columns, two columns on a fresh row, or the full row.
   * Omitted = one column.
   */
  layout?: 'half' | 'half-stacked' | 'full'
  /** Let the card grow to its content instead of the row's fixed height. */
  naturalHeight?: boolean
}

/**
 * Describes one entry in the Settings panel's navigation/search registry —
 * which section it belongs to, its label/description and search words, and
 * the control that edits it.
 */
export interface SettingItem {
  section: string
  sectionLabel: string
  id: string
  label: string
  desc: string
  /**
   * Extra words the search box matches on but that are never rendered. Used by
   * controls that deliberately show no descriptive text (e.g. the SDR options
   * checkbox box) so their individual options stay findable by name.
   */
  searchTerms?: string
  groupLabel?: string
  /**
   * Hide the card's title on screen (it stays in the accessibility tree and in
   * search). For a card whose group heading already names it, so the title is
   * not printed twice.
   */
  hideLabel?: boolean
  control: SettingControl
}
