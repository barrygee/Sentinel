import type { Component } from 'vue'

/**
 * Shell-side section registry (plan: docs/plans/section-containers.md, phase P2).
 *
 * In the target architecture each domain section (air, space, sea, land, sdr)
 * ships as an independently deployable Module Federation remote that calls
 * `register(shell)` to contribute its route, nav entry and — for sdr — the
 * persistent radio pane (`@sentinel/shell-api`'s `ShellContext`, §3.6 of the
 * plan). This module is the in-monolith precursor to that contract: every
 * section still lives in this bundle and is still imported statically (see
 * `shell/sections.ts`), but the router and `App.vue` already read from this
 * registry instead of hard-coding each section, so the later switch to
 * runtime-loaded remotes only has to change *how* `registerSection` gets
 * called, not what reads its output.
 */

/** A route contributed by a section. */
export interface SectionRouteDefinition {
  /** The path registered with vue-router, e.g. "/sea/". */
  path: string
  /** The routed view component. Statically imported until federation (P4) loads it at runtime. */
  component: Component
}

/** Everything one section contributes to the shell. */
export interface SectionDefinition {
  /** Stable identifier, e.g. "sea" — matches the domain keys in `appStore.enabledDomains`. */
  id: string
  /** Nav label, e.g. "SEA". */
  label: string
  /** Sort order for nav links and the default ("/") redirect target. Lower sorts first. */
  navOrder: number
  /**
   * Whether the section is on when the settings hold no `<id>.enabled` key
   * (a fresh install). Air, Space and SDR are; Sea and Land must be switched on.
   */
  enabledByDefault: boolean
  route: SectionRouteDefinition
  /**
   * The persistent radio pane rendered in `MapSidebar`'s `#radio` slot. Only
   * the sdr section registers this today. It is mounted once by `App.vue` —
   * not per-route — which is why the SDR engine survives navigation to every
   * other section (docs/plans/section-containers.md §1.4).
   */
  persistentRadioPane?: Component
  /**
   * Set by the shell, never by a section: the section was expected (it is in
   * the deployment's section list) but its code could not be loaded, so the
   * shell registered a stand-in whose route explains that (plan §3.5).
   */
  unavailable?: boolean
}

const registeredSections = new Map<string, SectionDefinition>()

/**
 * Registers a section with the shell. Each section id may only be registered
 * once per process — a duplicate call is a programming error (e.g. a
 * `shell/sections.ts` import listed twice), not a runtime condition to
 * recover from.
 */
export function registerSection(definition: SectionDefinition): void {
  if (registeredSections.has(definition.id)) {
    throw new Error(`Section "${definition.id}" is already registered`)
  }
  registeredSections.set(definition.id, definition)
}

function sectionsByNavOrder(): SectionDefinition[] {
  return [...registeredSections.values()].sort((first, second) => first.navOrder - second.navOrder)
}

/** All registered sections, ordered by `navOrder`. */
export function getRegisteredSections(): SectionDefinition[] {
  return sectionsByNavOrder()
}

/** Route definitions for every registered section, in nav order, ready to spread into `createRouter`'s `routes`. */
export function getSectionRoutes(): Array<{
  path: string
  component: Component
  meta: { domain: string }
}> {
  return sectionsByNavOrder().map((section) => ({
    path: section.route.path,
    component: section.route.component,
    meta: { domain: section.id },
  }))
}

/** `[domain, label]` pairs for every registered section, in nav order — drives the AIR/SPACE/... nav links. */
export function getNavEntries(): Array<[string, string]> {
  return sectionsByNavOrder().map((section) => [section.id, section.label])
}

/** Whether a registered section is only the shell's stand-in for one that failed to load. */
export function isSectionUnavailable(sectionId: string): boolean {
  return registeredSections.get(sectionId)?.unavailable === true
}

/**
 * The persistent radio pane component, if any registered section provides
 * one. Today only `sdr` does; returns `undefined` when no section registers
 * a pane so the shell renders nothing in its place.
 */
export function getPersistentRadioPane(): Component | undefined {
  return sectionsByNavOrder()
    .map((section) => section.persistentRadioPane)
    .find((pane): pane is Component => pane !== undefined)
}

/**
 * Which registered sections are enabled, given the boot settings payload: a
 * stored `<id>.enabled` boolean wins, otherwise the section's own default.
 */
export function getEnabledSectionIds(settings: Record<string, Record<string, unknown>>): string[] {
  return sectionsByNavOrder()
    .filter((section) => {
      const stored = settings[section.id]?.enabled
      return typeof stored === 'boolean' ? stored : section.enabledByDefault
    })
    .map((section) => section.id)
}
