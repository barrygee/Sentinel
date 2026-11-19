# Plan: refactor and reuse series (C)

**Status:** proposed, waiting on the order's OK · **Date:** 2026-11-14 · **Cut against:** `main` @ `1cbab3ef`
**Scope:** structure only. Every PR in this series is behaviour-preserving: no feature changes, no bug fixes, no
settings, wire format, route or guard-policy changes. A bug found on the way gets its own `fix(...)` PR.

## 0. Summary

The largest files in the repo each mix several concerns, and a few UI pieces are written twice. This series breaks
them up one extraction per PR, smallest risk first, so every PR lands green and the tree is never half-moved.

| Order | PR | What | Size today | Risk |
|---|---|---|---|---|
| 1 | C1 | AWACS orbit data out of `AwacControl.ts` | 2,407 lines (2,335 are data) | very low |
| 2 | C2 | Split `sdr-manager-remote` `routers/hosts.py` by concern | 1,237 | low (goldens pin it) |
| 3 | C3 | Shared map-view composable, Air + Sea | AirMap 459, SeaMap 269 | medium |
| 4 | C4 | The same composable for Land + Space | LandView 321, SpaceMap 275 | medium |
| 5 | C5 | One UPCOMING PASSES section for both Space accordions | 420 + 414 | medium (cascade) |
| 6 | C6–C9 | `AdsbLiveControl.ts` into helpers | 3,060 | medium–high |
| 7 | C10 | `SatelliteControl.ts` follow/label helpers | 1,020 | medium |
| 8 | C11–C15 | `SdrWaterfall.vue` into composables | 3,406 + 700 CSS | high |
| 9 | C16–C18 | `SdrPanel.vue/.css`, `SdrRecordingsSection.vue`, `stores/sdr.ts` | 2,061 + 1,817, 1,248, 1,361 | high |
| 10 | C19–C21 | Filter panels on `BaseFilterPanel` | Air 1,012, Space 748, Land 574 | medium |

**Dropped from the brief:** a shared base for the three map-layers settings controls. They are already thin
(`MapBasemapLayersControl` 59, Sea `SeaMapLayersControl` 58, Air `MapLayersControl` 93 lines) and all three already
compose `LabelFieldsTable`; what differs is each one's rows and store. A base would add indirection without removing
code. Revisit only if a fourth appears.

The order puts the mechanical, golden-pinned moves first (C1, C2), then the reuse work that removes real duplication
(C3–C5), then the big SDR and Air decompositions, which need the most care and benefit from the series' momentum.

---

## 1. Rules for every PR

- One extraction per PR, one `refactor(<scope>): …` commit (plus `build(spa): …` when the bundle changes).
- The parent shrinks to wiring. Extracted units take their styles (scoped) and specs with them.
- Shared-package modules import their own package by name (`@sentinel/map-kit/…`), never relatively.
- Existing specs stay green unchanged except for moved imports. New public units that lack coverage are covered at
  commit time, on the user's yes (global testing rule).
- Stacked work rebases onto the merged previous PR; `frontend/spa-dist/` is rebuilt after every rebase.

## 2. Verification recipe (every PR)

```bash
# Frontend PRs, from the worktree root
npm run web-packages -- lint && npm run web-packages -- typecheck && npm run web-packages -- test:coverage
cd frontend/vue && npm run lint && npm run typecheck && npm run test:coverage
cd frontend/vue && npm run build && npm run test:e2e        # --workers=1 if the machine is loaded

# Backend PRs, from the worktree root
uv run --project backend ruff check backend services/sections services/radio services/docs services/sdr-manager-local services/sdr-manager-remote
uv run --project backend ruff format --check backend services/sections services/radio services/docs services/sdr-manager-local services/sdr-manager-remote
uv run --project backend pytest
uv run --project backend python -m backend.scripts.guard_policy_artifacts --check
```

Like-for-like checks, per kind of change:

- **Data or logic moves:** the same output. C1 compares the GeoJSON before and after with a one-off script (deep
  equal, not committed).
- **Backend router splits:** `tests/backend/test_request_guard_route_inventory.py`, the parity goldens in
  `tests/backend/parity/` (HTTP contract, OpenAPI) and the generated access matrix all unchanged. Any golden diff
  means the split changed behaviour.
- **UI moves:** screenshots of the affected view before and after at 1440 px and 390 px (Chrome), including hover,
  open, selected and disabled states; e2e green.
- **CSS moves:** the above, plus computed-style spot checks on the moved selectors (`getComputedStyle` on the same
  elements before and after), because scoped styles change specificity.

---

## 3. The PRs

### C1. AWACS orbit data out of `AwacControl.ts`

`services/sections/air/frontend/src/controls/awacs/AwacControl.ts` is 2,407 lines, but lines 9–2,343 are one
constant: `AWACS_ORBITS`, 49 pre-computed ~37-point lobe polygons. The control itself (`AwacToggleControl`) is about
70 lines.

- Move `AWACS_ORBITS` verbatim to `controls/awacs/awacsOrbits.ts`, exported, with its header comment.
- `AwacControl.ts` imports it and keeps only the control.
- Like-for-like: deep-equal the exported collection against the old constant.
- Not in this PR: generating the lobes from centre and radius at runtime. It would shrink the data to 49 lines but
  changes the coordinates' floating-point digits, so it is a behaviour change. Offer it separately if wanted.

### C2. Split `routers/hosts.py` by concern

`services/sdr-manager-remote/backend/sentinel_sdr_manager_remote/routers/hosts.py` (1,237 lines) holds 15 Pydantic
schemas, shared helpers and 26 routes across five concerns under one prefix, `/api/sdr-manager/remote/hosts`.

| New module | Contents |
|---|---|
| `schemas/hosts.py` | every `*In` / `*Out` / `*Patch` model, `_validated_fingerprint` |
| `routers/host_access.py` | `get_host_or_404`, `host_to_out`, `raise_for_host_error`, `raise_for_unreachable` |
| `routers/hosts.py` | host CRUD, `test`, `info`, `locations`, and the certificate preview/trust routes with their helpers |
| `routers/host_devices.py` | devices, device records, patch/delete device, serial flash |
| `routers/host_wifi.py` | Wi-Fi config, enable/disable/confirm, interfaces, clients |

The certificate routes stay in `hosts.py`: the route inventory golden pins route order, and they sit between the host
CRUD routes (`POST /certificate` before `GET /{host_id}`, `…/{host_id}/certificate` before `DELETE /{host_id}`), so a
separate router could not keep that order.

- Each router keeps the same prefix and tags; `routers.ROUTERS` mounts them in the original order (hosts, devices,
  Wi-Fi), so the route inventory golden and first-match guard rules see the same table.
- No path, status code, response model or dependency changes. The goldens above are the proof.
- Tests move only if a test file maps one-to-one onto a new module; otherwise they stay and keep importing the public
  names (re-exported from `routers/hosts.py` only if a test needs it, to be removed in the same PR by updating the
  import).

### C3. Shared map-view composable (Air + Sea)

`AirMap.vue` and `SeaMap.vue` carry the same style lifecycle: `syncStyleToState` (load the target style once, re-add
overlays after `style.load`), the connectivity and map-theme watchers that call it, the `onMapCreated` basics (keep
the map, start user location, add the location marker, attach the context menu), and the post-reload re-init
(re-run each control's `initLayers`, `offlineTierRefresh.applyCurrentVersion()`, `basemapLayerSync.apply()`).

- New `platform/web/map-kit/src/composables/useSectionMapStyle.ts`: takes the style URL ref and a `reinitOverlays`
  callback; returns `onMapCreated`, `syncStyleToState` and the current map. It owns the watchers.
- Air and Sea keep their own control construction in `onStyleLoaded` (that part differs per section).
- Like-for-like: switch connectivity and map theme on each map and confirm overlays (vessels, ports, ferry routes,
  aircraft, range rings, SDR sites) come back after each restyle; e2e air/sea specs.

### C4. The same composable for Space (Land stays out)

- `SpaceMap.vue` adopts `useSectionMapStyle` for the style lifecycle. The composable gains three options for it:
  `basemapLayerGroups` (Space follows roads and borders from Settings), `markerClassName` (its own marker style) and an
  optional `getTerrainControl` (Space has no terrain). Its globe projection and `onGoToLocation` stay in the view.
- One Space spec changed: it fired the connectivity callback with no mode change, which `useConnectivity` never does;
  it now drives a real off grid → online change.
- `LandView.vue` stays out. It builds its controls on `map-created`, before any style has loaded, and re-asserts its
  layers inside `style-loaded` on every load, the first included. Moving it onto the composable means building its
  controls on the first style load instead, a timing change a refactor must not carry. Its `zoomIn`/`zoomOut`/
  `goToLocation` serve its own rail, which Air and Sea don't have, so they stay too.

### C5. One UPCOMING PASSES section for both Space accordions

The survey read this as two stylesheets styling the same UI twice. By now the styling was already shared: an
earlier dedupe had moved the expanded-satellite accordion into `SatelliteAccordion.css`, and the PASSES pane's own
`SpacePasses.css` styles only its pass rows, filters and messages, which the satellite list doesn't have. What was
still duplicated was the **markup**: `SpaceFilter.vue` (the satellite list) and `SpacePasses.vue` (the PASSES pane)
each rendered their own copy of the accordion's UPCOMING PASSES section.

- `UpcomingPassesSection.vue` renders that section (props `passes`, `loading`, `status`, `now`). Both accordions
  render it. Its pass-list rules moved out of the global `SatelliteAccordion.css` into its scoped styles. The section
  shell (`sat-acc-section`, `sat-acc-section-title`) stays global, shared with the accordion's other sections.
- The satellite list now times countdowns and NOW from its `now` ref, which ticks every second, as the PASSES pane
  already did, instead of reading `Date.now()` while rendering.
- Dead code dropped: the never-displayed `.sat-acc-pass-num` rule and the satellite list's unused `data-aos-ms`/
  `data-los-ms` attributes.
- Cascade check: a throwaway Playwright spec (not committed) dumped computed styles, boxes and text of every element
  in the section, in both panes at 390 and 1280 px, from the old and new bundles: no differences.

### C6–C9. `AdsbLiveControl.ts` (3,060 lines) into helpers

The class mixes eight concerns. Each PR moves one into a focused helper class (or module of pure functions) that the
control owns and calls, keeping the control's public API (`setTypeFilter`, `selectByHex`, `toggleFollowByHex`,
`setIconStyle`, `setAltitudeColouring`, `setLabelsVisible`, `clearAircraft`, `handleConnectivityChange`, `toggle`)
unchanged.

| PR | Extract | Methods today |
|---|---|---|
| C6 | `adsbIconStyle.ts` (pure expressions) | `_registerIcons`, `_iconImageExpression`, `_iconSizeExpression`, `_silhouetteZoomScale`, `_iconRotateExpression`, `_iconLayerVisibility`, `_applyMapDimming` |
| C7 | `AircraftTags` (hover + selected tag markers) | `_buildTagHTML`, `_wireTagButton`, `_rebuildTagForHex`, `_placeTagMarker`, `_show/_hideSelectedTag`, `_show/_hideHoverTag`, `_tagAnchor`, `_labelOffset` |
| C8 | `CallsignLabels` | `_buildCallsignLabelEl`, `_restingLabelFields`, `_updateCallsignMarkers`, `_clearCallsignMarkers`, `_glyphMarkup`, `_arrowColour`, `_makeArrowSvg`, `_isLeftFacing` |
| C9 | `AircraftTrails` + `AdsbTrackingPersistence` | `_rebuildTrails`, `_trailColour`, `_trailLineCoords`, `_refreshTrailLineHead`; `_saveTrackingState`, `_restore*`, `_doRestoreTracking` |

Polling and fetch (`_fetch`, `_startPolling`, …) stay in the control: they drive everything else. The filter-restore
timing rule (restore in the constructor, not later) is kept as is.

C7 as built:

- `AircraftTags.ts` owns both tag markers and their state (which aircraft each belongs to, the side the selected
  tag was placed on, the hover tag's hide timer and the label it covers). It builds the tag markup, places, refreshes
  and removes the markers. The control still decides *when* a tag shows: selection, follow, the status bar and saving
  tracking state stay in the control's `_showSelectedTag`/`_hideSelectedTag`/`_startFollowingHex`.
- It reads the control through a small host object (`AircraftTagsHost`: icon style, selection, follow, tag fields,
  alert opt-in, interpolated position, resting label, the arrow/category/altitude helpers C8 will move) and reports
  UNTRACK and hover-tag clicks back through it.
- The four placements that each built a tag element, wired it, removed the old marker and placed a new one are now
  one `placeSelected`; the in-place poll refresh is `refreshSelected`.
- `AircraftProperties`/`AircraftGeoFeature` moved to `adsbFeature.ts` so both files can name them.
- The control keeps one-line delegates (`_buildTagHTML`, `_wireTagButton`, `_showHoverTag`, `_hideHoverTag(Now)`,
  `_labelOffset`) and accessors (`_tagHex`, `_tagMarker`, `_hoverHex`, `_hoverHideTimer`), because the spec reaches
  them through `priv()` and spies on `_rebuildTagForHex`/`_hideHoverTagNow`. The spec is unchanged.

C8 as built:

- `CallsignLabels.ts` owns the resting label markers (`markers`, by hex) and everything that draws them: which
  aircraft get a label (layer, type filter, ground vehicles/towers, selection, isolation), building the pill
  (`buildLabelEl`), the in-place update and the rebuild when an aircraft turns (`update`), `clear`, and the glyph,
  arrow colour, arrow markup and resting-field helpers C7's host borrowed.
- It reads the control through `CallsignLabelsHost` (map, features, icon style, altitude colouring, field selection,
  filters, selection/isolation/follow, alert opt-in, staleness, interpolated position, label offset, category and
  altitude formatting) and reports back through it: a label placed while the hover tag is open over its aircraft,
  the TRACKING button, and mouse enter/leave/click. The hover tag and trail stay the control's.
- `_isLeftFacing` is gone (the control imports map-kit's `isLeftFacing`, as `AircraftTags` does).
- The control keeps one-line delegates (`_updateCallsignMarkers`, `_clearCallsignMarkers`, `_buildCallsignLabelEl`,
  `_makeArrowSvg`, `_arrowColour`) and a `_callsignMarkers` accessor, because the spec calls and spies on them through
  `priv()`; its own refreshes go through `_updateCallsignMarkers` so those spies still see them. The spec is
  unchanged. `AdsbLiveControl.ts` 2,562 → 2,128 lines.

C9 as built:

- `AircraftTrails.ts` owns every aircraft's kept positions (`points`, capped at `maxPoints`), which aircraft's trail
  is asked for (`hex`, the hovered one; null falls back to the selection), the dot and line GeoJSON, and the two
  trail sources and layers: `record`/`forget` a position history, `addLayers` after a style load, `rebuild` (dots,
  line and its altitude gradient), `refreshLineHead` each interpolation tick, `setVisibility`, `colour` and `clear`.
  It reads the control through `AircraftTrailsHost` (map, features, selection, interpolated position, icon style,
  altitude colouring, palette). The control still decides whose trail shows and when it is redrawn (hover,
  selection, polls). The style-reload path no longer saves and restores the trail state around adding the layers:
  `addLayers` starts the dots empty itself.
- `AdsbTrackingPersistence.ts` owns the `adsbTracking` localStorage entry, the `/api/air/tracking` calls and the
  restore-once flags: `save`, `restoreIsolation`, `restoreTracking` (the backend's record wins, then `applySaved`)
  and `applySaved`, which retries on later polls until the aircraft is in the feed. Applying a restore stays the
  control's, through `AdsbTrackingPersistenceHost`: `applyIsolation` and `applyTracking` (the control's
  `_applyTrackingRestore`: select, follow, re-arm alerts, tag, status bar, camera).
- The control keeps one-line delegates (`_rebuildTrails`, `_trailColour`, `_saveTrackingState`,
  `_restoreTrackingState`, `_restoreIsolationState`, `_doRestoreTracking`) and accessors (`_trails`, `_trailHex`, a
  `_MAX_TRAIL` setter, `_trackingRestored`/`_isolationRestored` getters), because the spec reaches them through
  `priv()` and spies on `_rebuildTrails`. The spec is unchanged. `AdsbLiveControl.ts` 2,128 → 1,881 lines.

### C10. `SatelliteControl.ts` (1,020 lines)

- Extract follow and active-satellite persistence (`_saveFollowState`, `_readFollowState`, `_saveActiveSat`,
  `_readActiveSat`) and the label element (`_buildLabelEl`, `_showLabel`, `_hideLabel`).
- Both tracking status bars already share the tracking store; nothing to merge there.

C10 as built:

- `satellitePersistence.ts` holds the two localStorage entries as plain functions (no state, so no class):
  `saveFollowedSatellite` (null forgets it) / `readFollowedSatellite` for `sentinel_space_follow`, and
  `saveActiveSatellite` / `readActiveSatellite` for `sentinel_space_activeSat`. The two readers share one parser
  (bad JSON or no NORAD id → null; the id stands in for a missing name).
- `SatelliteLabel.ts` owns the label marker: `show` (plain, or move the one shown), `replace` (TRACKING form when
  given an `onUntrack`, which the badge's click calls), `moveTo`, `showPreview` / `restoreName` (the filter-hover name
  swap and badge hide) and `hide`. The control replaces `_labelMarker` with it and still decides which form shows.
- The spec reaches none of the moved members (it goes through localStorage and the DOM), so the control keeps no
  delegates and the spec is unchanged. `SatelliteControl.ts` 1,020 → 888 lines.

### C11–C15. `SdrWaterfall.vue` (3,406 lines + 700 CSS)

One composable per interaction, each taking the refs it needs and returning handlers. The template and the draw loop
stay in the component until the last PR.

| PR | Composable | Functions today |
|---|---|---|
| C11 | `useKnownFrequencyMarkers` | `toggleKnownMarker`, `onKnownMarker*`, `isKnownPopoverShown`, `isKnownMarkerEvent`, `snapToKnownFreqHz`, `syncKnownFrequencies`, `applyMarker` |
| C12 | `useSignalMarkers` | `computeSignalMarkerAtPoint`, `isPointWithinMarker`, `signalMarkersOverlap`, `toggleSignalMarkerPin`, `signalMarkerTimeLabels`, `rowIndexForTimeMs`, row-clock helpers |
| C13 | `useFrequencyDrag` (tune by drag and wheel) | `onPlotMouseDown/Up`, `freqDragFlush`, `tryStart/commit/abortFreqDrag`, `wheelFlush`, `onPlotWheel` |
| C14 | `useBandwidthBracketDrag` | `acc*` drag helpers, `nearAccEdge`, `nearAccGrabZone`, `dispatchBridgedMouseEvent`, `onPlotTouchStart`, `bracketGeomHz`, `carrierFromBracketHz` |
| C15 | `useWaterfallPlots` + CSS split | `buildPipes`, `initPlots`, `drawLoop`, `computeDesiredBins`, `publishDesiredBins`, zoom/range; the 700-line CSS splits to the components that now own each part |

The SDR audio engine sits outside `<RouterView>` and must keep playing through every step: each PR runs the SDR e2e
specs (`sdr`, `sdr-radio-switch`, `sdr-engine-late-mount`, `sdr-css-cascade`, the P0 audio-survives-navigation spec).

C11 as built:

- `composables/useKnownFrequencyMarkers.ts` takes the store (as a narrow `KnownFrequencySource`), the span/zoom refs,
  `dataBoxWidthPx` and `zoomWindowHz`, and returns the marker list, popover state/handlers, `isKnownMarkerEvent`,
  `snapToKnownFreqHz` and `attach`/`detachAnnotationPlugin` (the empty sigplot AnnotationPlugin and its stale
  document `mouseup` listener). Its document `mousedown` listener and watchers move with it; the component calls it
  where the block used to be, so listener order is unchanged.
- `applyMarker` stays in the component: it positions the tuning accordions, not the known-frequency dots, so it
  moves with the bracket drag in C14.
- The spec reaches the markers only through the DOM, so it is unchanged. `SdrWaterfall.vue` 3,406 → 3,229 lines.

C12 as built:

- `composables/useSignalMarkers.ts` owns the row history (each raster row's push time and bins, newest first, capped at
  the raster depth), the clock labels and second ticks down the raster's left edge, the raster data box refs the
  component fills after a draw, and the signal marker (hover detection, Shift+Click pin/unpin, start/end labels). It
  takes the store as a narrow `SignalMarkerSource`, the span/zoom refs, the raster element and the frequency scale as
  getters (`firstBinHz`/`hzPerBin`), because a retune reassigns `xstartHz`/`xdeltaHz` in the component.
- The hover version of `clientXToFreqHz` (the only one in the file) moved with it: it maps a point to a row and bin
  for detection, never snapping. C13 keeps `onPlotMouseUp`'s own rect math, as before.
- The spec reaches all of it through the DOM, so it is unchanged. `SdrWaterfall.vue` 3,229 → 2,826 lines.

C13 as built:

- `composables/useFrequencyDrag.ts` owns the gutter drag-to-pan (mouse and touch: `tryStart`/`commit`/`abortFreqDrag`,
  the rAF flush and the five document listeners), the wheel pan (accumulate per tick, commit once 250 ms after the
  burst) and click-to-tune (`tuneToClientX`: the click's frequency in the visible window, known-frequency snap, the
  auto-centre / demod-offset choice). It takes the store as a narrow `FrequencyTuningSource`, the span refs, the three
  gutter insets, `livePanOffsetHz`, `zoomWindowHz`, `snapToKnownFreqHz` and an `applyView` callback (`applyZoom` +
  `applyMarker`); the spectrum element comes as a getter because its ref is declared further down the component, and
  the call sits where the block used to be so the document listeners keep their order.
- `onPlotMouseDown`/`onPlotMouseUp` stay in the component: they are the plots' pointer router (right-click
  suppression, known-marker presses, bracket drags, Shift+Click signal pins, then pan or click-to-tune), so they call
  `tryStartFreqDrag` and `tuneToClientX` rather than move. `livePanOffsetHz` stays too: `zoomWindowHz`, `applyZoom`,
  `applyMarker` and the new-frame reset all read it; the reset asks `isFreqDragActive()`. The window `blur` →
  `abortFreqDrag` hook stays beside the bracket drag's, keeping their order.
- `onPlotWheel` is a one-line component function around the composable's handler: the template binds it on both
  plots, and Vue wraps a destructured handler in a per-element arrow, which left the raster's copy uncovered.
- The spec reaches all of it through the DOM, so it is unchanged. `SdrWaterfall.vue` 2,826 → 2,584 lines.

C14 as built:

- `composables/useBandwidthBracketDrag.ts` owns the four sigplot accordions (passband + carrier line on each plot) and
  their styles (`attachAccordions(AccordionPluginClass, spectrumPlot, waterfallPlot)` from `initPlots`,
  `detachAccordions()` on unmount), `applyMarker`, the drag mirror / commit / abort with its baseline and
  `suppressAccEvents` guard, the resize cursor (`nearEdge`), the touch-to-mouse bridge (its three document listeners)
  and the `pointercancel` safety net. It takes the store as a narrow `BracketTuningSource`, the span refs,
  `livePanOffsetHz` and `snapToKnownFreqHz`; the plots and their elements come as getters (the component reassigns the
  plots and declares the element refs further down). The call sits where the drag block used to be, so the document
  listeners keep their order; the window `blur` hooks stay in the component beside C13's.
- `onPlotTouchStart` stays in the component as the touch router, like `onPlotMouseDown`: it rules out pinch-zoom,
  known-marker taps and gutter pans, then hands the touch to `tryStartBracketTouch`. `onPlotMouseUp` asks
  `isBracketDragActive()`, and the store watcher asks `isWritingBracket()` instead of reading the flags directly.
- `_lastCommittedFreqHz`/`_lastCommittedBwHz` were written but never read, so they were dropped.
- The spec reaches all of it through the DOM, so it is unchanged. `SdrWaterfall.vue` 2,584 → 2,002 lines.

C15 as built:

- The plots move to `composables/useWaterfallPlots.ts`: creating them after the double rAF, `buildPipes`, the
  zoom-aware FFT bin request, the frame feed and draw loop, the stop blanking, the store / Min-Max / zoom /
  tuned-frequency watchers, the data box reads and the teardown. The plots and their frequency scale live in one
  plain, non-reactive object (`waterfallPlotHandles.ts`) the component creates first, so C11–C14 read it through
  getters instead of component variables; the component calls `useWaterfallPlots` last, where the plot block used to
  be, so its watchers and hooks keep their order.
- Zoom, the live pan offset, the Min/Max dB range, `zoomWindowHz`, `applyZoom` and `applySpecRange` move to
  `composables/useWaterfallViewRange.ts`, called before the other composables because they all map through
  `zoomWindowHz`. Its `lastTouched` watchers are registered before the plots' combined `[zmin, zmax]` watcher, which
  asks `clampSliderCollision` first, as the one watcher used to. The measured data box insets and the overlay styles
  move to `composables/useWaterfallDataBox.ts`; the sigplot `mx` patches and the per-plot margin tweaks to
  `sigplotAxisPatches.ts` (a side-effect import); the tick layout to the pure `waterfallFrequencyTicks.ts`.
- The template splits into six sub-components, each with its own CSS file cut from `SdrWaterfall.css`:
  `SdrWaterfallSearchOverlay`, `SdrWaterfallViewSliders` (it owns the negated slider proxies and the slider sizing),
  `SdrBandPlanOverlay`, `SdrFrequencyTickGutter`, `SdrKnownFrequencyMarkers` and `SdrWaterfallTimeOverlay`. No
  selector spans two of them, the built CSS holds the same rule set, and the `sdr-css-cascade` snapshot is unchanged.
  The root file keeps the container, its state classes, the spectrum and the raster.
- The spec reaches all of it through the DOM, so it is unchanged. `SdrWaterfall.vue` 2,002 → 516 lines;
  `SdrWaterfall.css` 700 → 139.

### C16–C18. `SdrPanel`, `SdrRecordingsSection`, `stores/sdr.ts`

These had a full decomposition series in July (panel 5,548 → 1,872); they have grown back to 2,061. Each PR starts
with a seam map of what grew back (written into the PR description), then:

- C16 `SdrPanel.vue/.css`: move whatever sub-areas grew back into their own sub-components, with their CSS.
- C17 `SdrRecordingsSection.vue`: split list, row and player/actions into sub-components.
- C18 `stores/sdr.ts`: split by slice (radios, frequencies/groups, recordings) behind the same store API, or into
  composable store modules if Pinia slicing would change the public shape.

C16 as built:

- What grew back was the RADIO tab's template (≈ 450 lines of inline markup) and the CSS of tabs already extracted
  in July, which never left `SdrPanel.css`. The RADIO tab now composes small components, each with its own CSS file:
  `SdrSidebarRail` (+ `SdrRailTabIcon`; it tracks whether the side panel is open and emits `select`),
  `SdrFrequencyEntry` (the MHz readout; exposes its `<input>` for the digit wheel), `SdrTransportButtons`,
  `SdrSignalMeter`, `SdrModulationPills` (owns the radio-group keyboard model), `SdrDigitalModeToggle`,
  `SdrScannerSection` and `SdrSearchSection` (→ `SdrAdhocSearchRow`, `SdrSavedRangesList`), sharing
  `SdrSweepStateIndicator`, `SdrSweepPlayButton` and `SdrPlayStopIcon`. Each section component's root is the
  `.sdr-radio-section` wrapper the pane's pinning rules (`.sdr-tab-pane--radio > …`) select, so the DOM is unchanged.
  Script moves: `useSdrActiveTab` (tab list, sessionStorage memory, store mirror) and `useSdrSignalMeter`.
- Sole-renderer families of the extracted tabs moved out of `SdrPanel.css` into `SdrFrequencyManagerTab.css`,
  `SdrSearchRangesTab.css`, `SdrFrequencyForm.css`, `SdrRangeForm.css`, `SdrFrequencyGroupFilter.css`,
  `SdrFrequencyRowSummary.css`, `SdrFavouritesSection.css` and `SdrFavouriteStar.css`. What stays is the pane layout
  plus the chrome several components share (`.sdr-field-label`, `.sdr-mode-pill`, `.sdr-panel-input/-btn/-empty`,
  `.sdr-editfreq-body`, the `.sdr-freq-row-*` rows and their action box, `.sdr-scan-groups-row`, `@keyframes
  sdr-rec-pulse`).
- Cascade trap found by the check: `.sdr-scan-groups-row` is also the Frequency Manager group filter's chip row, whose
  `-row` rule overrides its margin at equal specificity, so it stays in `SdrPanel.css` (loaded first).
- Dead CSS purged in its own commit: `#sdr-panel`, `.sdr-group-toggle/-body`, `.sdr-radio-section--tight`,
  `.sdr-scan-btn`, `.sdr-scan-groups-row + .sdr-scan-subsection-label`, the never-shown adhoc placeholder and the
  `:disabled` rule on a `div`, orphan comments (incl. the long-gone trunk section), all but one rule of
  `SdrTabPanel.vue`'s style block, and the unused `_rangesSectionExpanded` ref.
- Verification: a throwaway Playwright pass dumped the DOM and every computed property (pseudo-elements included) of
  the rail and panes for all five tabs at 1280 and 390 px, collapsed, with every accordion expanded, and with the add
  forms open: identical to `main` after each step. The built CSS holds the same rule set (minus the purge). Spec
  unchanged, SDR 2,303 tests at 100 %, e2e 202 passed. `SdrPanel.vue` 2,061 → 1,611 lines; `SdrPanel.css`
  1,835 → 842.

### C19–C21. Filter panels on `BaseFilterPanel`

`AirFilter.vue` (1,012), `SpaceFilter.vue` (748) and `LandFilter.vue` (574) already render inside `BaseFilterPanel`
(690) but still carry their own list rows, section headers and search plumbing; `SeaFilter.vue` (231) shows how thin
they can be. One PR per panel, largest first: move the repeated row and section markup into `@sentinel/ui` base
pieces (or into `BaseFilterPanel` slots), so each panel keeps only its own data and categories.

---

## 4. Not in this series

- The ADS-B dim-by-feed fix (`fix/adsb-dim-by-feed`) is a behaviour change and ships on its own.
- Generating AWACS lobes at runtime (see C1).
- Anything in `docs/` beyond comments and code-map updates the moves require.
