import { countryFromMmsi } from '@/utils/mmsiCountry'

/** Where the backend serves the vendored flag SVGs (`frontend/assets/flags`). */
const FLAG_ASSET_PATH = '/assets/flags'

/** Drawn size of the flag — 4:3, matched to the pill's 15px text. */
export const FLAG_WIDTH_PX = 20
export const FLAG_HEIGHT_PX = 15

/**
 * The flag-state segment of a vessel label: the national flag as a small 4:3
 * rectangle sized to the pill's text, drawn from the SVGs vendored
 * under `frontend/assets/flags` so it works offline and looks the same on
 * every platform (unlike emoji flags). The country's name is the image's
 * alternative text and tooltip.
 *
 * Returns `null` when the MMSI carries no allocated MID, so the pill simply
 * omits the segment rather than showing a blank.
 */
export function createFlagBadge(mmsi: string): HTMLSpanElement | null {
  const country = countryFromMmsi(mmsi)
  if (!country) return null
  const badge = document.createElement('span')
  badge.style.cssText =
    'background:#000000;align-self:stretch;display:flex;align-items:center;padding:0 7px;'
  const image = document.createElement('img')
  image.src = `${FLAG_ASSET_PATH}/${country.code.toLowerCase()}.svg`
  image.alt = `Flag: ${country.name}`
  image.title = country.name
  image.draggable = false
  // Fixed 4:3 box the height of the pill's text, so the flag never outgrows
  // its segment or spills over a neighbour when the pill is mirrored.
  image.style.cssText = `width:${FLAG_WIDTH_PX}px;height:${FLAG_HEIGHT_PX}px;display:block;object-fit:cover;flex:none;`
  badge.appendChild(image)
  return badge
}
