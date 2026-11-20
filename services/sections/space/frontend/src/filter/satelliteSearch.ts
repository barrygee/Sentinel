/**
 * The Space FILTER pane's search and grouping rules, kept free of Vue so they
 * can be read (and tested) on their own: which satellites a query matches and
 * in what order, how they group by category, and the text each row shows.
 */
import { SATELLITE_CATEGORY_ORDER, SATELLITE_CATEGORY_SHORT_LABELS } from '../utils/satelliteUtils'
import type { SatEntry } from './spaceFilterTypes'

/** The most rows one category shows, however many satellites match. */
export const CATEGORY_ROW_CAP = 20

/** Words a query can use to mean a whole category ("ham", "gps", "iss" …). */
const CATEGORY_ALIASES: Record<string, string[]> = {
  space_station: ['space station', 'station', 'iss'],
  amateur: ['amateur', 'ham'],
  weather: ['weather', 'met'],
  military: ['military', 'mil', 'defense', 'defence'],
  navigation: ['navigation', 'nav', 'gps', 'gnss'],
  science: ['science', 'sci', 'research'],
  cubesat: ['cubesat', 'cube', 'smallsat'],
  active: ['active'],
  unknown: ['unknown', 'unkn'],
}

/**
 * The category a query names, if any: an alias equal to it, starting with it,
 * or that it starts with. Queries shorter than two characters name none.
 */
export function categoryForQuery(query: string): string | null {
  const lowerQuery = query.toLowerCase().trim()
  if (lowerQuery.length < 2) return null
  for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (
      aliases.some(
        (alias) =>
          alias === lowerQuery || alias.startsWith(lowerQuery) || lowerQuery.startsWith(alias),
      )
    )
      return category
  }
  return null
}

// Lower score = better match, so the most relevant satellites sort first
// within their category group (e.g. "ISS (ZARYA)" floats above the other
// space stations when the query is "iss").
function matchScore(sat: SatEntry, lowerQuery: string, matchedCategory: string | null): number {
  /* v8 ignore start -- sat.name is typed non-null; the `?.`/`??` are defensive and the
     empty-string fallback can't occur for well-formed data. */
  const name = sat.name?.toLowerCase() ?? ''
  /* v8 ignore stop */
  if (name === lowerQuery) return 0
  if (name.startsWith(lowerQuery)) return 1
  if (name.includes(lowerQuery)) return 2
  if (sat.norad_id.includes(lowerQuery)) return 3
  /* v8 ignore start -- unreachable tail: a satellite reaching here failed the name and
     norad checks above, so it must have passed the results filter via category — the
     category test is therefore always true (score 4) and `return 5` is never reached. */
  if (matchedCategory !== null && sat.category === matchedCategory) return 4
  return 5
  /* v8 ignore stop */
}

/**
 * The satellites a query matches — by name, NORAD id or a category alias —
 * best match first. An empty query matches every satellite, in loaded order.
 */
export function filterSatellites(satellites: SatEntry[], query: string): SatEntry[] {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return satellites
  const matchedCategory = categoryForQuery(trimmedQuery)
  const lowerQuery = trimmedQuery.toLowerCase()
  return satellites
    .filter(
      (sat) =>
        sat.name?.toLowerCase().includes(lowerQuery) ||
        sat.norad_id.includes(lowerQuery) ||
        (matchedCategory !== null && sat.category === matchedCategory),
    )
    .sort(
      (first, second) =>
        matchScore(first, lowerQuery, matchedCategory) -
        matchScore(second, lowerQuery, matchedCategory),
    )
}

/** One category's satellites, capped at `CATEGORY_ROW_CAP`. */
export interface SatelliteCategoryGroup {
  cat: string
  sats: SatEntry[]
}

/**
 * Groups satellites by category ('unknown' when they have none): the known
 * categories in display order, then any others in the order first met. Empty
 * groups are left out.
 */
export function groupByCategory(satellites: SatEntry[]): SatelliteCategoryGroup[] {
  const groups = new Map<string, SatEntry[]>()
  for (const category of SATELLITE_CATEGORY_ORDER) groups.set(category, [])
  for (const sat of satellites) {
    const key = sat.category || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(sat)
  }
  const grouped: SatelliteCategoryGroup[] = []
  groups.forEach((sats, cat) => {
    if (!sats.length) return
    grouped.push({ cat, sats: sats.slice(0, CATEGORY_ROW_CAP) })
  })
  return grouped
}

/** The categories that have at least one satellite, in display order. */
export function categoriesPresent(satellites: SatEntry[]): string[] {
  const present = new Set<string>()
  for (const sat of satellites) present.add(sat.category || 'unknown')
  return SATELLITE_CATEGORY_ORDER.filter((category) => present.has(category))
}

/** A row's second line: "<CATEGORY> · NORAD <id>", or just the NORAD part. */
export function satSecondary(sat: SatEntry): string {
  const catLabel = sat.category
    ? // defensive: a rendered row's category always came from either the rail
      // sub-tab selection (gated to SATELLITE_CATEGORY_ORDER, whose keys are a
      // 1:1 match with SATELLITE_CATEGORY_SHORT_LABELS) or
      // restoreExpandedAccordion (which sets filterCategory, but the
      // availableCategories watch immediately resets any category not in
      // that same order back to the first available one) — so sat.category
      // can never actually miss a short label at render time. Kept as a guard
      // against the two lookup tables drifting out of sync.
      /* v8 ignore start -- unreachable given the category-order/short-label key parity; see above */
      SATELLITE_CATEGORY_SHORT_LABELS[sat.category] || sat.category.toUpperCase()
    : /* v8 ignore stop */
      ''
  return catLabel ? `${catLabel} · NORAD ${sat.norad_id}` : `NORAD ${sat.norad_id}`
}

/**
 * A row's accessible name. Each result row is a role="option": an explicit
 * label keeps its name to the satellite identity (otherwise it would absorb
 * the whole expanded accordion), and says whether it is open, since an option
 * cannot carry aria-expanded.
 */
export function satOptionLabel(sat: SatEntry, expanded: boolean): string {
  return `${sat.name || sat.norad_id}, ${satSecondary(sat)}, ${expanded ? 'expanded' : 'collapsed'}`
}
