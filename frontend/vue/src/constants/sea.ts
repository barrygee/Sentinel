/**
 * Shared cadence and presentation constants for the Sea domain's AIS feed.
 *
 * The backend holds a live in-memory vessel store fed continuously by the
 * AISStream WebSocket, so — unlike ADS-B, whose upstream is itself polled and
 * cached — a client poll always has a chance of carrying new fixes. The cadence
 * still matches the ADS-B poll so the two maps feel the same, and motion between
 * polls is covered by the control's own dead-reckoning from speed and course.
 */
export const SEA_POLL_INTERVAL_MS = 10_000

/**
 * How recent a fetch has to be for a newly-started poller to skip its immediate
 * first fetch (a pane remount, an overlay toggle) and wait for the next tick.
 */
export const SEA_REFETCH_GUARD_MS = SEA_POLL_INTERVAL_MS - 1_000

/** Most vessels a single snapshot request asks for. Matches the source
 *  project's render cap; a viewport bbox keeps real requests far smaller. */
export const SEA_MAX_RENDER_ROWS = 12_000

/**
 * Fill of a count marker's centre and its ring — the same black-on-black as
 * the pills, so a group reads as part of the same set as the labels it stands
 * in for (mirrors the Land map's APRS counts).
 */
export const SEA_COUNT_FILL = '#000000'
export const SEA_COUNT_RING = 'rgba(20, 23, 28, 0.55)'
export const SEA_COUNT_TEXT = '#ffffff'

/** How far a click on a count zooms in to open it up. */
export const SEA_COUNT_ZOOM_STEP = 2

/**
 * Views wider than this (nautical miles across the screen) group every
 * vessel into counts; only a vessel with no neighbour keeps its pill. Under
 * it, pills are the rule and counts appear only where they would pile up.
 */
export const SEA_GROUP_ALL_ABOVE_NM = 50

/** Screen cell (px) a count covers in a wide view — coarser than the marker
 *  itself, so a wide view is a handful of counts rather than a tiling of them. */
export const SEA_WIDE_VIEW_COUNT_CELL_PX = 72

/**
 * Dead-reckoning tick: how often vessel positions are advanced between polls.
 *
 * Deliberately slow. Every push of new GeoJSON is a full re-tile in MapLibre's
 * worker, and a sub-second cadence starved the base-map tiles of that worker
 * so the map never painted at all. Ships are slow; one nudge a second is
 * smooth enough and leaves the worker free.
 */
export const SEA_INTERPOLATE_INTERVAL_MS = 1000

/** A vessel slower than this is treated as stopped and never dead-reckoned. */
export const SEA_MIN_MOVING_KNOTS = 0.5

/**
 * Viewport padding (as a fraction of the visible span) added to the bbox sent
 * with each snapshot request. Kept to a sliver: only what is on screen is
 * fetched, and a pan asks for the new view straight away.
 */
export const SEA_VIEWPORT_PAD_FRACTION = 0.05

/** Settle time after a pan or zoom before the new view's vessels are fetched. */
export const SEA_MOVE_FETCH_DEBOUNCE_MS = 400
