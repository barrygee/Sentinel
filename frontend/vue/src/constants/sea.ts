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
 * Hard ceiling on label pills in one view — a browser safeguard, not a
 * design choice. Every vessel on screen carries the black pill, as aircraft
 * do on the Air map; only past this many (a worldwide-scale view of a busy
 * sea) do the remaining vessels fall back to bare arrows, because thousands
 * of DOM markers would freeze the page.
 */
export const SEA_MAX_LABELS = 2000

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
 * with each snapshot request, so a small pan does not empty the edges of the
 * map before the next poll.
 */
export const SEA_VIEWPORT_PAD_FRACTION = 0.5
