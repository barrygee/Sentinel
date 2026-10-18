/**
 * Shapes shared by the docs feature: the navigation manifest (`docs/nav.json`)
 * once validated against the docs service's markdown, and the library built from it.
 */

/**
 * The fixed groups, in reading order: Getting started first, then Introduction,
 * one group per Settings section in the Settings rail's order (`app` and the
 * five sections), and Developer docs. A manifest group must use one of these keys.
 */
export const DOC_GROUP_KEYS = [
  'getting-started',
  'introduction',
  'app',
  'air',
  'space',
  'sea',
  'land',
  'sdr',
  'develop',
] as const

/** Key of one of the fixed groups. */
export type DocGroupKey = (typeof DOC_GROUP_KEYS)[number]

/** One readable page: where it lives, how it is named and its markdown. */
export interface DocsPage {
  /** URL path under `/docs/`, e.g. `operations` or `adr/0006-section-containers`. */
  path: string
  /** The router URL, e.g. `/docs/operations` (`/docs/` for the welcome page). */
  url: string
  /** Title for the page list, breadcrumb, heading and window title. */
  title: string
  /** Repo-relative source file, e.g. `docs/operations.md` or `CONTRIBUTING.md`. */
  file: string
  /** The markdown source, as the docs service sent it. */
  markdown: string
  groupKey: DocGroupKey
  groupTitle: string
  /** Title of the sub-list the page sits under (e.g. "Design decisions"), if any. */
  subgroupTitle?: string
}

/** A labelled run of pages inside a group (the ADR list under Develop). */
export interface DocsSubgroup {
  title: string
  pages: DocsPage[]
}

/** One row of a group's page list: a page, or a nested sub-list. */
export type DocsListEntry =
  | { kind: 'page'; page: DocsPage }
  | { kind: 'subgroup'; subgroup: DocsSubgroup }

/** A rail group and its pages. */
export interface DocsGroup {
  key: DocGroupKey
  title: string
  /** The page list, in manifest order (sub-lists nested). */
  entries: DocsListEntry[]
  /** Every page of the group, flattened in reading order. */
  pages: DocsPage[]
}

/** The validated, ready-to-read documentation set. */
export interface DocsLibrary {
  /** Only groups that have pages; empty groups stay hidden until they do. */
  groups: DocsGroup[]
  /** Every page in reading order across groups (drives previous/next). */
  pages: DocsPage[]
  pageByPath: ReadonlyMap<string, DocsPage>
  pageByFile: ReadonlyMap<string, DocsPage>
  /** Search synonyms: a word typed -> the terms also searched (first is its label). */
  synonyms: Readonly<Record<string, readonly string[]>>
}
