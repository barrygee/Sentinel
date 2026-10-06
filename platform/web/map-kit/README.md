# @sentinel/map-kit

Sentinel's shared MapLibre layer (P4 of
[`docs/plans/section-containers.md`](../../../docs/plans/section-containers.md)).
Every section map is built from it; under Module Federation it is a
host-provided singleton alongside `maplibre-gl`.

Import as `@sentinel/map-kit/<path>` — `.vue` files with their extension, `.ts`
modules without:

| Path                                                  | Contents                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `MapLibreMap.vue`, `UserLocationMarker`               | The map component and the user-location marker                                                                      |
| `sentinel-control-base/SentinelControlBase`           | The base class every map control (`IControl`) extends                                                               |
| `controls/*`                                          | Shared controls: names, roads, terrain (+ DEM), sentry-sites, range-rings (incl. `LandRangeRingsControl`), map-zoom |
| `sprites/adsbSprites`, `map-cluster/*`, `map-label/*` | Sprites, clustering and label/marker-aria helpers                                                                   |
| `composables/*`                                       | `useBasemapLayerSync`, `useMapContextMenu`, `useOfflineTierRefresh`, `useRangeRingOrigin`, `useUserLocation`        |
| `utils/*`                                             | Map style/theme, basemap layers, offline tile versions, range rings, distance/location maths, site labels           |

Depends on `@sentinel/shell-api` (core stores) and `@sentinel/ui`, never on a section.

```bash
npm run lint -w @sentinel/map-kit
npm run typecheck -w @sentinel/map-kit
npm run test:coverage -w @sentinel/map-kit   # 100% coverage gate
```
