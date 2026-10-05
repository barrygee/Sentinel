/**
 * Appends `?v=<tiersVersion>` to a tile URL/template so a completed or
 * deleted offline-map region can force a refetch without a style reload (see
 * `useOfflineTierRefresh` and `TerrainToggleControl.refreshTiles`). The
 * backend ignores the query string for routing but caches the response
 * per-version, so a version bump is both a cache-buster for the browser and a
 * correct cache key on the server.
 *
 * `tiersVersion` may be `null` (status not fetched yet) — in that case the
 * template is returned unchanged, matching the plain URL already baked into
 * the bundled style JSON files.
 */
export function withTierVersion(urlTemplate: string, tiersVersion: string | null): string {
  if (!tiersVersion) return urlTemplate
  const separator = urlTemplate.includes('?') ? '&' : '?'
  return `${urlTemplate}${separator}v=${encodeURIComponent(tiersVersion)}`
}
