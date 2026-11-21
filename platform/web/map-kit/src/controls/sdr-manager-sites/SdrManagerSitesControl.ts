import * as maplibregl from 'maplibre-gl'
import { watch, type WatchStopHandle } from 'vue'
import { SentinelControlBase } from '@sentinel/map-kit/sentinel-control-base/SentinelControlBase'
import {
  buildLocationMarkerSvg,
  type OperatorMarkerDetails,
} from '@sentinel/map-kit/UserLocationMarker'
import {
  DARK_COUNT_RING,
  buildCountMarker,
  groupByProximity,
  type ScreenPosition,
} from '@sentinel/map-kit/map-cluster/mapCluster'
import { setMarkerAccessibleName } from '@sentinel/map-kit/map-label/mapMarkerAria'
import {
  buildCountDetailsPill,
  buildMarkerDetailsPill,
  type CountedMarkerEntry,
} from '@sentinel/map-kit/map-label/markerDetailsPill'
import { formatLatitude, formatLongitude } from '@sentinel/map-kit/utils/locationUtils'
import type { RadioSite } from '@sentinel/shell-api/shell/radioSitesCapability'
import { siteAddress, siteLabel } from '@sentinel/map-kit/utils/sdrManagerSiteLabel'
import { escapeHtml } from '@sentinel/ui/utils/escapeHtml'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import type { useSdrManagerSitesStore } from '@sentinel/shell-api/stores/sdrManagerSites'
import type { useSettingsStore } from '@sentinel/shell-api/stores/settings'

type SdrManagerSitesStore = ReturnType<typeof useSdrManagerSitesStore>
type SettingsStore = ReturnType<typeof useSettingsStore>

/**
 * Plots every connected SDR host at the position it reports, on every domain map.
 *
 * An SDR host is a fixed installation — the receiver the domain data is coming
 * from — so where it sits is context for every map, not a Land or SDR concern:
 * this control is added to Air, Space, Sea and Land alike, which is why it
 * lives under `shared/controls/` rather than in one domain's folder.
 *
 * Each site is drawn with the SENTINEL ⊙ mark — the same marker the operator's
 * own location uses, its dot in the settings panel's off-white so that on a map
 * showing both, a site is not mistaken for where the operator is standing — and
 * sites too close together to tell apart collapse into
 * one numbered count that zooms in when clicked — the same treatment crowded
 * APRS stations get on the Land map, from the same shared clustering module.
 * Zoomed out, a count holds until the marks it stands for clear each other; from
 * town level in, a group that still overlaps is fanned out into a ring of marks
 * instead, so sites metres apart don't stay a count until building level. The operator's own position is counted alongside
 * the sites, so an SDR host standing where the operator is standing collapses into
 * a count rather than the two marks smearing into one.
 * Hovering a site (or giving it keyboard focus) shows its details alongside the
 * mark — name, reachability dot, address and position — drawn as the same pill
 * the map's right-click menu uses, so the two read as one piece of map
 * furniture. The marker as a whole is the button: clicking the mark or its
 * details opens that host's own row in Settings → SDR.
 *
 * The map canvas is opaque to assistive tech, so the control also maintains a
 * visually-hidden table of the sites as the accessible equivalent, per
 * accessibility-standards.
 */
export class SdrManagerSitesControl extends SentinelControlBase {
  private readonly _sitesStore: SdrManagerSitesStore
  private readonly _settingsStore: SettingsStore
  // Keyed by siteKey: a host and a placed radio can share an id.
  private _markers = new Map<string, maplibregl.Marker>()
  /** Each marker's site name when it was built, so a renamed site is rebuilt. */
  private _markerNames = new Map<string, string>()
  private _clusterMarkers = new Map<string, maplibregl.Marker>()
  /** What each count lists, so it is only rebuilt when that changes — its
   *  number, or which marks it stands for. */
  private _clusterSignatures = new Map<string, string>()
  private readonly _getUserLocation: () => [number, number] | null
  private readonly _userMarker: OperatorMarker | null
  private _onMapMoveEnd: (() => void) | null = null
  private _stopWatch: WatchStopHandle | null = null
  private _a11yRegion: HTMLDivElement | null = null
  private _visible = true

  /**
   * @param options.getUserLocation Where the operator's own ⊙ marker is, if the
   *   view draws one. Its position joins the sites in the grouping pass, so a
   *   SDR host sitting on top of the operator's own position collapses into a
   *   count rather than the two marks smearing into one unreadable blob.
   * @param options.userMarker That marker, so it can be hidden while a count
   *   stands for it. Views without one (Sea) pass neither.
   */
  constructor(
    sitesStore: SdrManagerSitesStore,
    settingsStore: SettingsStore,
    options: {
      getUserLocation?: () => [number, number] | null
      userMarker?: OperatorMarker | null
    } = {},
  ) {
    super()
    this._sitesStore = sitesStore
    this._settingsStore = settingsStore
    this._getUserLocation = options.getUserLocation ?? (() => null)
    this._userMarker = options.userMarker ?? null
  }

  get buttonLabel(): string {
    // The ⊙ mark in miniature — the same ring-and-dot the sites are drawn with.
    return (
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.4" />' +
      '<circle cx="8" cy="8" r="2.2" fill="currentColor" /></svg>'
    )
  }

  get buttonTitle(): string {
    return 'Toggle SDR host sites'
  }

  protected onInit(): void {
    this.setButtonActive(this._visible)
    this._ensureA11yRegion()
    // Poll the fleet while this control is on the map.
    this._sitesStore.startPolling()
    // Which sites are close enough to collapse into a count depends on the
    // zoom, so the whole set is regrouped once a movement settles. `moveend`
    // rather than `zoomend`: it fires for zooms too, and a pan can bring the
    // projection's scale distortion into play at high latitudes.
    this._onMapMoveEnd = () => this._render()
    this.map.on('moveend', this._onMapMoveEnd)
    // Re-group on either input: a new fleet snapshot, or the operator's own
    // position moving — a fix that lands on top of an SDR host has to collapse the
    // two into a count just as two Sentries would.
    this._stopWatch = watch(
      () =>
        [
          this._sitesStore.sites,
          this._sitesStore.radioSites,
          this._getUserLocation(),
          // This machine's site is named by the machine name setting, which can
          // change while the sites themselves don't.
          this._sitesStore.sites.map((site) => siteLabel(site)),
          // …and so is the operator marker's tag, local SDR Manager or not.
          useAppStore().thisMachineLabel,
        ] as const,
      () => this._render(),
      { immediate: true, deep: true },
    )
  }

  protected handleClick(): void {
    this.setVisible(!this._visible)
  }

  /** Show or hide the SDR host sites. */
  setVisible(visible: boolean): void {
    if (this._visible === visible) return
    this._visible = visible
    this.setButtonActive(visible)
    this._render()
  }

  onRemove(): void {
    /* v8 ignore start -- defensive: onInit always assigns these, and MapLibre
       never removes a control it did not add */
    if (this._onMapMoveEnd) this.map.off('moveend', this._onMapMoveEnd)
    /* v8 ignore stop */
    this._onMapMoveEnd = null
    this._stopWatch?.()
    this._stopWatch = null
    this._sitesStore.stopPolling()
    this._clearMarkers()
    this._a11yRegion?.remove()
    this._a11yRegion = null
    super.onRemove()
  }

  // ── rendering ──────────────────────────────────────────────────────────────

  private _render(): void {
    // SDR hosts, then radios added by IP and port that were given a position.
    const sites = [...this._sitesStore.sites, ...this._sitesStore.radioSites]
    this._syncMarkers(this._visible ? this._sitesToPlot(sites) : [])
    this._renderA11yTable(sites)
    this._userMarker?.setDetails(this._thisMachineDetails())
  }

  /**
   * The tag for the operator's ⊙ marker, which stands for this machine: its
   * name, and the address and status of this machine's own SDR Manager, the
   * same values every other site's tag shows.
   *
   * Given even while the sites are toggled off: the marker is the view's, not a
   * site. Without a local SDR Manager reporting, this machine has no address
   * Sentinel knows, so the tag shows only the name and position.
   */
  private _thisMachineDetails(): OperatorMarkerDetails {
    const localSite = this._sitesStore.sites.find((site) => site.is_local)
    return {
      name: useAppStore().thisMachineLabel,
      address: localSite ? siteAddress(localSite) : null,
      reachable: localSite ? localSite.reachable : null,
    }
  }

  /**
   * The sites to draw on the map: all of them, except this machine's own SDR
   * Manager on a view that already draws the operator's ⊙ marker.
   *
   * Both stand for this machine, but they rarely sit on the same spot. The
   * operator's marker follows the browser's live GPS fix, while the local SDR
   * Manager publishes the saved Location setting, which it re-reads on its own
   * timer. So the two land a few metres apart, too far apart to merge into a
   * count, and one machine shows up as two marks. The operator's marker is the
   * live one, so it is the one kept. Until that marker has a position, the
   * local site is still plotted. The accessible table keeps every site.
   */
  private _sitesToPlot(sites: RadioSite[]): RadioSite[] {
    if (!this._userMarker || !this._getUserLocation()) return sites
    return sites.filter((site) => !(site.kind !== 'radio' && site.is_local))
  }

  /** Add/update/remove markers so the on-map set matches `sites`. */
  private _syncMarkers(sites: RadioSite[]): void {
    const { plotted, clusters, userLocationCounted } = this._planMarkers(sites)
    const seenSites = new Set<string>()
    const seenClusters = new Set<string>()

    for (const placement of plotted) {
      seenSites.add(siteKey(placement.site))
      this._syncSiteMarker(placement)
    }
    for (const cluster of clusters) {
      seenClusters.add(cluster.key)
      this._syncClusterMarker(cluster)
    }
    // The operator's own marker belongs to the view, not to this control — but
    // while a count stands for it, leaving it drawn would show one position
    // twice, as both a mark and a number.
    this._userMarker?.setHidden(userLocationCounted)

    // Drop markers for sites no longer plotted — deregistered, disabled, or now
    // inside a count.
    for (const [key, marker] of this._markers) {
      if (seenSites.has(key)) continue
      marker.remove()
      this._markers.delete(key)
      this._markerNames.delete(key)
    }
    // …and counts for groups the zoom has since taken apart.
    for (const [key, marker] of this._clusterMarkers) {
      if (seenClusters.has(key)) continue
      marker.remove()
      this._clusterMarkers.delete(key)
      this._clusterSignatures.delete(key)
    }
  }

  /**
   * Split what is on the map into marks drawn as themselves and groups shown as
   * one count, by how close together they land on screen at this zoom.
   *
   * Below `FAN_OUT_MIN_ZOOM`, a count holds for as long as the marks it stands
   * for would overlap: zooming in pulls a group apart the moment its marks clear
   * each other, and until then the number is the honest answer — superimposed ⊙
   * marks look like one site, and would hide how many are there.
   *
   * The operator's own position takes part as an ordinary point — an SDR host
   * standing where the operator is standing is exactly the overlap that needs
   * collapsing — but it is not a site, so it is reported back separately rather
   * than plotted by this control.
   *
   * From `FAN_OUT_MIN_ZOOM` in, a group is fanned out instead of counted: sites
   * metres apart (a Pi on the same roof as this machine) would otherwise stay a
   * count until building level. See `_fanOut`.
   */
  private _planMarkers(sites: RadioSite[]): MarkerPlan {
    const positions = new Map<string, ScreenPosition>()
    const points: ClusterPoint[] = sites.map((site) => {
      positions.set(siteKey(site), this.map.project([site.longitude, site.latitude]))
      return { key: siteKey(site), site }
    })
    const userLocation = this._getUserLocation()
    if (userLocation) {
      positions.set(USER_LOCATION_KEY, this.map.project(userLocation))
      points.push({ key: USER_LOCATION_KEY, site: null })
    }

    const plotted: SitePlacement[] = []
    const clusters: SdrManagerCluster[] = []
    let userLocationCounted = false
    const fanOut = this.map.getZoom() >= FAN_OUT_MIN_ZOOM
    for (const group of groupByProximity(points, positions, SITE_GROUP_RADIUS_PX)) {
      const groupSites = group.members.map((point) => point.site).filter(isSite)
      // A group of one is never a count: a "1" says less than the mark it would
      // replace, and that mark is the one an operator can actually open.
      if (group.members.length === 1) {
        if (groupSites[0]) plotted.push(placedAt(groupSites[0]))
        continue
      }
      const holdsUserLocation = groupSites.length < group.members.length
      if (fanOut) {
        plotted.push(
          ...this._fanOut(groupSites, positions, holdsUserLocation ? userLocation : null),
        )
        continue
      }
      if (holdsUserLocation) userLocationCounted = true
      // A counted group always holds at least one site: the only point that is
      // not a site is the operator's own position, and on its own that is a
      // group of one, which is never counted. So the first site is always there
      // to put the count on.
      const anchor = groupSites[0]!
      clusters.push({
        key: group.key,
        sites: groupSites,
        holdsUserLocation,
        memberCount: group.members.length,
        longitude: anchor.longitude,
        latitude: anchor.latitude,
      })
    }
    return { plotted, clusters, userLocationCounted }
  }

  /**
   * Spread a group's sites in a ring, so each is its own mark, with its own
   * tag, at a zoom where they would otherwise overlap.
   *
   * The ring centres on the operator's ⊙ when it is in the group (it stays put,
   * where it is: the view's marker, which this control never moves), otherwise
   * on the first site. Each mark sits on the ring by a pixel offset from that
   * centre, so the ring keeps its shape while the map zooms, and is regrouped
   * when the movement settles. The first site keeps its own side of the centre
   * and the rest follow evenly round, and the ring is wide enough that
   * neighbouring marks clear each other and the ⊙ in the middle. A mark's tag
   * and accessible name still give its true position.
   */
  private _fanOut(
    sites: RadioSite[],
    positions: Map<string, ScreenPosition>,
    userLocation: [number, number] | null,
  ): SitePlacement[] {
    const first = sites[0]!
    const centre: [number, number] = userLocation ?? [first.longitude, first.latitude]
    const centreOnScreen = userLocation
      ? positions.get(USER_LOCATION_KEY)!
      : positions.get(siteKey(first))!
    const radius = fanOutRadius(sites.length, userLocation !== null)
    const firstOnScreen = positions.get(siteKey(first))!
    const towardsFirst = Math.atan2(
      firstOnScreen.y - centreOnScreen.y,
      firstOnScreen.x - centreOnScreen.x,
    )
    // On top of the centre (the first site itself, or sitting on the ⊙): start
    // straight up, the one direction that reads as "this one first".
    const startAngle =
      Math.hypot(firstOnScreen.x - centreOnScreen.x, firstOnScreen.y - centreOnScreen.y) < 1
        ? -Math.PI / 2
        : towardsFirst
    return sites.map((site, index) => {
      const angle = startAngle + (2 * Math.PI * index) / sites.length
      return {
        site,
        anchor: centre,
        offset: [Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle))],
      }
    })
  }

  /** Add or move one site's marker, at its own position or on a fanned-out ring. */
  private _syncSiteMarker({ site, anchor, offset }: SitePlacement): void {
    const key = siteKey(site)
    const name = siteLabel(site)
    const existing = this._markers.get(key)
    if (existing && this._markerNames.get(key) === name) {
      existing.setLngLat(anchor).setOffset(offset)
      return
    }
    // A site whose name changed (this machine renamed) is built afresh: its
    // details pill and accessible name are fixed when it is made.
    existing?.remove()
    const marker = new maplibregl.Marker({
      element: this._buildSiteElement(site),
      anchor: 'center',
      offset,
    })
      .setLngLat(anchor)
      .addTo(this.map)
    // After addTo: MapLibre replaces the element's aria-label with its own
    // generic "Map marker" as it adds one, so the site's is put back.
    setMarkerAccessibleName(marker, siteMarkerLabel(site))
    this._markers.set(key, marker)
    this._markerNames.set(key, name)
  }

  /**
   * The marker for one site: the SENTINEL ⊙ mark with the site's details
   * alongside it, as a single button.
   *
   * One button rather than a mark plus a separate action, because there is only
   * one thing to do here — open the host in Settings — and the whole marker
   * does it, mark and details alike. That keeps it to one tab stop with one
   * name, and means the details panel cannot swallow a click meant for the mark
   * it is butted against.
   */
  private _buildSiteElement(site: RadioSite): HTMLElement {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = 'sdr-manager-map-marker'
    element.setAttribute('aria-label', siteMarkerLabel(site))
    element.appendChild(this._buildMark())
    element.appendChild(
      buildMarkerDetailsPill({
        name: siteLabel(site),
        latitude: site.latitude,
        longitude: site.longitude,
        address: siteAddress(site),
        reachable: site.reachable,
      }),
    )
    element.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      // A host opens on its own row; a radio added by IP is in Settings › SDR too.
      if (site.kind === 'radio') this._settingsStore.openPanel('sdr')
      else this._settingsStore.openSdrManagerHost(site.id)
    })
    return element
  }

  /** The ⊙ itself. */
  private _buildMark(): HTMLElement {
    const mark = document.createElement('span')
    mark.className = 'sdr-manager-map-marker-mark'
    mark.innerHTML = buildLocationMarkerSvg(SDR_MANAGER_MARKER_DOT_COLOR)
    return mark
  }

  /** Place (or move) the count standing for a group of sites, and zoom in on
   *  the group when it is clicked. */
  private _syncClusterMarker(cluster: SdrManagerCluster): void {
    const coords: [number, number] = [cluster.longitude, cluster.latitude]
    const entries = this._countedEntries(cluster)
    const signature = JSON.stringify(entries)
    const existing = this._clusterMarkers.get(cluster.key)
    if (existing && this._clusterSignatures.get(cluster.key) === signature) {
      existing.setLngLat(coords)
      return
    }
    // Built afresh when what it lists changes: its tag and accessible name are
    // fixed when it is made, like a site marker's.
    existing?.remove()
    const countLabel = clusterLabel(cluster, entries)
    const element = buildCountMarker({
      count: cluster.memberCount,
      ariaLabel: countLabel,
      className: 'sdr-manager-cluster-marker',
      countClassName: 'sdr-manager-cluster-count',
      ringColor: DARK_COUNT_RING,
      fillColor: SDR_MANAGER_COUNT_FILL,
      textColor: SDR_MANAGER_COUNT_TEXT,
    })
    element.appendChild(buildCountDetailsPill(entries))
    element.addEventListener('click', (domEvent: Event) => {
      domEvent.stopPropagation()
      // Far enough in to take the group apart, wherever the operator started
      // from — the count's whole purpose is to say "there is something here",
      // so one click should show what.
      this.map.easeTo({
        center: coords,
        // No further than the zoom where groups fan out: there, every site in
        // it is already its own mark, so going deeper only empties the view.
        zoom: Math.min(this.map.getZoom() + CLUSTER_ZOOM_STEP, FAN_OUT_MIN_ZOOM),
        duration: 300,
      })
    })
    const marker = new maplibregl.Marker({ element, anchor: 'center' })
      .setLngLat(coords)
      .addTo(this.map)
    setMarkerAccessibleName(marker, countLabel)
    this._clusterMarkers.set(cluster.key, marker)
    this._clusterSignatures.set(cluster.key, signature)
  }

  /** The marks a count stands for, as its tag lists them: this machine first
   *  when the operator's own ⊙ is among them, under the name its own tag uses,
   *  then each site. */
  private _countedEntries(cluster: SdrManagerCluster): CountedMarkerEntry[] {
    const siteEntries = cluster.sites.map((site) => ({
      name: siteLabel(site),
      reachable: site.reachable,
    }))
    if (!cluster.holdsUserLocation) return siteEntries
    const { name, reachable } = this._thisMachineDetails()
    return [{ name, reachable }, ...siteEntries]
  }

  // ── accessibility ──────────────────────────────────────────────────────────

  private _ensureA11yRegion(): void {
    /* v8 ignore start -- defensive idempotency guard: onInit calls this exactly once */
    if (this._a11yRegion) return
    /* v8 ignore stop */
    const region = document.createElement('div')
    region.setAttribute('role', 'region')
    region.setAttribute('aria-label', 'SDR sites')
    // Visually hidden but available to assistive tech (the map canvas itself is
    // opaque to screen readers, so this table is the accessible equivalent).
    region.style.cssText =
      'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0'
    this.map.getContainer().appendChild(region)
    this._a11yRegion = region
  }

  /** The accessible equivalent of the markers: every site, with its position and
   *  reachability, regardless of how the visual layer has grouped them. */
  private _renderA11yTable(sites: RadioSite[]): void {
    /* v8 ignore start -- defensive: _render only runs after onInit created the region */
    if (!this._a11yRegion) return
    /* v8 ignore stop */
    if (sites.length === 0) {
      this._a11yRegion.innerHTML = '<p>No SDR sites with a position.</p>'
      return
    }
    const rows = sites
      .map(
        (site) =>
          `<tr><td>${escapeHtml(siteLabel(site))}</td>` +
          `<td>${escapeHtml(siteAddress(site))}</td>` +
          `<td>${site.reachable ? 'Online' : 'Off air'}</td>` +
          `<td>${site.latitude.toFixed(4)}</td><td>${site.longitude.toFixed(4)}</td></tr>`,
      )
      .join('')
    this._a11yRegion.innerHTML =
      '<table><caption>SDR sites on this map</caption><thead><tr>' +
      '<th scope="col">Name</th><th scope="col">Address</th><th scope="col">Status</th>' +
      '<th scope="col">Latitude</th><th scope="col">Longitude</th></tr></thead>' +
      `<tbody>${rows}</tbody></table>`
  }

  private _clearMarkers(): void {
    // The view's own marker was only ever hidden by this control, so it is
    // handed back visible.
    this._userMarker?.setHidden(false)
    this._userMarker?.setDetails(null)
    for (const marker of this._markers.values()) marker.remove()
    this._markers.clear()
    this._markerNames.clear()
    for (const marker of this._clusterMarkers.values()) marker.remove()
    this._clusterMarkers.clear()
    this._clusterSignatures.clear()
  }
}

/** The view's own ⊙ for the operator's position, which this control borrows:
 *  it hides it while a count stands for it, and gives it this machine's tag. */
export interface OperatorMarker {
  setHidden(hidden: boolean): void
  setDetails(details: OperatorMarkerDetails | null): void
}

/** One point in the grouping pass: a site, or the operator's own position
 *  (`site: null` — it is grouped like any other point, but never plotted here). */
interface ClusterPoint {
  key: string
  site: RadioSite | null
}

/** A group of marks too close together to tell apart at this zoom. */
interface SdrManagerCluster {
  key: string
  /** The sites in the group — everything but the operator's own position. */
  sites: RadioSite[]
  /** Whether the operator's own position is one of the marks counted. */
  holdsUserLocation: boolean
  /** How many marks the count stands for, the operator's position included. */
  memberCount: number
  /** Where the count sits — the first member's position. */
  longitude: number
  latitude: number
}

/** Where one site's mark goes: a point on the map, plus a pixel offset from it
 *  — none for a site drawn where it is, a ring position when fanned out. */
interface SitePlacement {
  site: RadioSite
  anchor: [number, number]
  offset: [number, number]
}

/** A site drawn where it is. */
function placedAt(site: RadioSite): SitePlacement {
  return { site, anchor: [site.longitude, site.latitude], offset: [0, 0] }
}

/**
 * How far from the centre a fanned-out group's marks sit, in pixels: far enough
 * that neighbours on the ring are a mark's width apart, and — when the
 * operator's ⊙ is in the middle — that every mark clears it too.
 */
function fanOutRadius(siteCount: number, aroundUserLocation: boolean): number {
  // The chord between neighbours on a ring of n points is 2·r·sin(π/n).
  const clearOfNeighbours =
    siteCount > 1 ? SITE_GROUP_RADIUS_PX / (2 * Math.sin(Math.PI / siteCount)) : 0
  return Math.max(clearOfNeighbours, aroundUserLocation ? SITE_GROUP_RADIUS_PX : 0)
}

/** How the marks in view are split between drawn and counted. */
interface MarkerPlan {
  plotted: SitePlacement[]
  clusters: SdrManagerCluster[]
  /** Whether a count now stands for the operator's own position, so the view's
   *  marker for it must be hidden. */
  userLocationCounted: boolean
}

/** Narrows a group's members to the ones that are sites. */
function isSite(site: RadioSite | null): site is RadioSite {
  return site !== null
}

/** Identity of the operator's own position in the grouping pass. Not a number,
 *  so it can never collide with a host id. */
const USER_LOCATION_KEY = 'user-location'

/**
 * What a count says it stands for.
 *
 * Names the operator's own position when it is one of the marks counted:
 * otherwise the number would be one higher than the sites it appears to
 * summarise, which reads as a miscount. Then lists every mark by name, as the
 * count's tag does, so a screen reader hears what is here without zooming.
 */
function clusterLabel(cluster: SdrManagerCluster, entries: CountedMarkerEntry[]): string {
  const subject = cluster.holdsUserLocation
    ? `${cluster.memberCount} markers here, including your location`
    : `${cluster.memberCount} SDR sites here`
  const names = entries.map((entry) => entry.name).join(', ')
  return `${subject}: ${names} — zoom in to see them`
}

/** Everything a site marker says, as its accessible name — the same values its
 *  details panel shows, which is why that panel is `aria-hidden`. */
function siteMarkerLabel(site: RadioSite): string {
  const status = site.reachable ? 'online' : 'off air'
  const position = `${formatLatitude(site.latitude)} ${formatLongitude(site.longitude)}`
  const kind = site.kind === 'radio' ? 'SDR radio' : 'SDR host'
  return `${kind} ${siteLabel(site)}, ${siteAddress(site)}, ${status}, at ${position} — open in Settings`
}

/** Identity of a site for clustering and markers — stable across polls, and
 *  apart for a host and a placed radio that share an id. */
function siteKey(site: RadioSite): string {
  return site.kind === 'radio' ? `radio:${site.id}` : String(site.id)
}

/**
 * The dot at the centre of an SDR host's ⊙ mark: the map palette's
 * `--map-sdr-manager-dot` (template.css).
 *
 * On the dark map it is the off-white the settings panel is built on, against
 * the lime dot of the operator's own location marker; on the light map both
 * rings go dark and this dot goes black, against the lime one. Either way the two are
 * unmistakable side by side, and this one reads as a fixed installation rather
 * than a live position. A CSS variable, not a hex, so a marker already on the
 * map follows a palette switch. The ring is shared with the location marker —
 * the mark is the same mark; only whose place it is changes.
 */
const SDR_MANAGER_MARKER_DOT_COLOR = 'var(--map-sdr-manager-dot)'

/** How close two sites must be to share a count, in pixels — the ⊙ mark's own
 *  ring diameter, so sites are grouped exactly when their marks would overlap. */
const SITE_GROUP_RADIUS_PX = 30

/**
 * From this zoom in (town level), sites that would overlap are fanned out into
 * a ring rather than counted. Counting holds further out, where a ring of marks
 * would crowd the map more than it tells; nearer in, a count would hide sites
 * that can be metres apart until building level.
 */
const FAN_OUT_MIN_ZOOM = 13

/** How far in one click on a count goes, in zoom levels. Three steps splits a
 *  typical huddle in one go; a group that is tighter than that survives the
 *  click as a smaller count, and another click takes it further in. */
const CLUSTER_ZOOM_STEP = 3

/** Fill of an SDR Manager count marker's centre. */
const SDR_MANAGER_COUNT_FILL = '#000000'

/** Colour of the count itself — the dark map's site dot colour, which reads
 *  clearly on the count's black centre on either map (so it does not follow
 *  `--map-sdr-manager-dot`, which goes black on the light map). */
const SDR_MANAGER_COUNT_TEXT = '#f6f6f4'

// Re-exported from its shared home so the map-marker module stays the one
// place that names a site for callers already importing it from here.
export { siteLabel }
