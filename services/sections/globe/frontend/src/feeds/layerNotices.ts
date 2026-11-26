import type { DrawnLayerId, LayerResult } from './globeFeedTypes'

/** One notice: a stable id (for dismissing) and what it says. */
export interface LayerNotice {
  id: string
  message: string
}

/** What each layer is called in a notice. */
const LAYER_NAMES: Readonly<Record<DrawnLayerId, string>> = {
  air: 'Aircraft',
  sea: 'Vessels',
  aprs: 'APRS stations',
}

/** The section that owns each layer. */
const OWNING_SECTIONS: Readonly<Record<DrawnLayerId, string>> = {
  air: 'AIR',
  sea: 'SEA',
  aprs: 'LAND',
}

/** Why a layer is empty, in words, from the feed's fixed reason vocabulary. */
function reasonText(layer: DrawnLayerId, reason: string | null): string {
  const section = OWNING_SECTIONS[layer]
  switch (reason) {
    case 'no-location':
      return 'need your location: set it in Settings › My Location'
    case 'daily-limit':
      return "are paused: today's online ADS-B limit is used up, and they return when it resets"
    case 'no-source':
      return 'have no ADS-B source for the current connectivity mode (Settings › AIR)'
    case 'upstream':
      return "can't be shown: the ADS-B source isn't answering"
    case 'settings':
      return "can't be shown: AIR's settings couldn't be read"
    case 'section-unavailable':
      return `can't be shown: the ${section} section isn't running`
    case 'timeout':
      return `can't be shown: ${section} didn't answer in time`
    default:
      return `can't be shown: ${section} couldn't answer`
  }
}

/**
 * The notices to show for the feed's current answer: one per unavailable
 * layer (or one still showing its last good objects, flagged with
 * `meta.staleReason`), one when the APRS layer is up but has heard nobody (a radio must be
 * running the APRS decoder), and one when the feed itself isn't answering.
 */
export function layerNotices(
  layers: Partial<Record<DrawnLayerId, LayerResult>>,
  feedUnreachable: boolean,
): LayerNotice[] {
  const notices: LayerNotice[] = []
  if (feedUnreachable) {
    notices.push({
      id: 'feed:unreachable',
      message: "The globe's live feed isn't answering; what's shown may be out of date.",
    })
  }
  for (const layer of Object.keys(LAYER_NAMES) as DrawnLayerId[]) {
    const result = layers[layer]
    if (!result) continue
    const staleReason = result.meta.staleReason
    if (result.status === 'ok' && typeof staleReason === 'string') {
      // Still drawn from the last good answer (see useGlobeLiveLayers).
      notices.push({
        id: `${layer}:stale`,
        message: `${LAYER_NAMES[layer]} aren't updating: ${OWNING_SECTIONS[layer]} ${
          staleReason === 'timeout' ? "didn't answer in time" : "couldn't answer"
        }. Showing the last positions.`,
      })
    } else if (result.status === 'unavailable') {
      notices.push({
        id: `${layer}:${result.reason ?? 'error'}`,
        message: `${LAYER_NAMES[layer]} ${reasonText(layer, result.reason)}.`,
      })
    } else if (layer === 'aprs' && result.items.length === 0) {
      notices.push({
        id: 'aprs:none-heard',
        message:
          'No APRS stations heard. APRS needs a radio running the APRS decoder (Settings › LAND).',
      })
    }
  }
  return notices
}
