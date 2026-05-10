"""
Satellite position and ground track computation using SGP4.

Uses the sgp4 library to propagate TLE data forward/backward in time.
All outputs use [longitude, latitude] coordinate order (GeoJSON convention).
"""

import math
from datetime import datetime, timedelta, timezone

from sgp4.api import Satrec, jday


# Earth radius in km
_RE_KM = 6371.0


def _jday_now() -> tuple[int, float]:
    """Return the current Julian date as (jd_int, jd_frac)."""
    now = datetime.now(timezone.utc)
    jd, fr = jday(now.year, now.month, now.day, now.hour, now.minute, now.second + now.microsecond / 1e6)
    return jd, fr


def _eci_to_geodetic(r_km: list[float], t: datetime | None = None) -> tuple[float, float, float]:
    """Convert ECI position vector (km) to geodetic lat/lon/alt.

    Returns (latitude_deg, longitude_deg, altitude_km).
    Uses a simplified spherical Earth model — sufficient for display purposes.
    """
    if t is None:
        t = datetime.now(timezone.utc)
    # Greenwich Mean Sidereal Time (radians) — simple approximation.
    # tzinfo is stripped so both sides of the subtraction are naive UTC datetimes;
    # the J2000.0 epoch (2000-01-01 12:00 UTC) is defined in UTC so no precision is lost.
    j2000 = (t.replace(tzinfo=None) - datetime(2000, 1, 1, 12, 0, 0)).total_seconds() / 86400.0
    gmst_deg = math.fmod(280.46061837 + 360.98564736629 * j2000, 360.0)
    gmst_rad = math.radians(gmst_deg)

    x, y, z = r_km
    lon_rad = math.atan2(y, x) - gmst_rad
    lon_deg = math.degrees(lon_rad)
    # Normalise to -180..180
    while lon_deg > 180:
        lon_deg -= 360
    while lon_deg < -180:
        lon_deg += 360

    r_xy = math.sqrt(x * x + y * y)
    lat_deg = math.degrees(math.atan2(z, r_xy))
    alt_km = math.sqrt(x * x + y * y + z * z) - _RE_KM
    return lat_deg, lon_deg, alt_km


def _propagate_at(sat: Satrec, jd: int, fr: float) -> tuple[list[float], list[float]] | None:
    """Propagate satellite to given Julian date. Returns (r_km, v_km_s) or None on error."""
    e, r, v = sat.sgp4(jd, fr)
    if e != 0:
        return None
    return list(r), list(v)


def compute_position(tle_line1: str, tle_line2: str) -> dict:
    """Compute the current position of a satellite from its TLE lines.

    Returns:
      lat          — latitude in degrees
      lon          — longitude in degrees
      alt_km       — altitude in kilometres
      velocity_kms — speed in km/s
      track_deg    — heading in degrees (0=north, clockwise)
    """
    sat = Satrec.twoline2rv(tle_line1, tle_line2)
    jd, fr = _jday_now()

    result = _propagate_at(sat, jd, fr)
    if result is None:
        raise RuntimeError("SGP4 propagation error at current time")

    r, v = result
    now = datetime.now(timezone.utc)
    lat, lon, alt_km = _eci_to_geodetic(r, now)
    velocity_kms = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)

    # Compute heading: propagate 10 seconds ahead for bearing estimate
    fr_ahead = fr + 10.0 / 86400.0  # +10 seconds in fractional days
    result_ahead = _propagate_at(sat, jd, fr_ahead)
    track_deg = 0.0
    if result_ahead:
        r_ahead, _ = result_ahead
        lat_ahead, lon_ahead, _ = _eci_to_geodetic(r_ahead, now + timedelta(seconds=10))
        dlat_rad = math.radians(lat_ahead - lat)
        dlon_rad = math.radians(lon_ahead - lon)
        lat_rad  = math.radians(lat)
        lat_ahead_rad = math.radians(lat_ahead)
        x = math.sin(dlon_rad) * math.cos(lat_ahead_rad)
        y = math.cos(lat_rad) * math.sin(lat_ahead_rad) - math.sin(lat_rad) * math.cos(lat_ahead_rad) * math.cos(dlon_rad)
        track_deg = (math.degrees(math.atan2(x, y)) + 360) % 360

    return {
        "lat": round(lat, 4),
        "lon": round(lon, 4),
        "alt_km": round(alt_km, 1),
        "velocity_kms": round(velocity_kms, 3),
        "track_deg": round(track_deg, 1),
    }


def compute_ground_track(tle_line1: str, tle_line2: str) -> dict:
    """Compute current and next orbit as a GeoJSON FeatureCollection.

    ISS orbital period ~92 minutes, so:
      - orbit1:   0..92   minutes  → properties.track = 'orbit1'  (current orbit)
      - orbit2:  92..184  minutes  → properties.track = 'orbit2'  (next orbit)

    Longitudes are unwrapped (allowed to exceed ±180°) so MapLibre can draw a
    continuous line with renderWorldCopies and in globe projection.

    Unwrapping uses the shortest-path difference between consecutive raw lons
    (always in [-180, 180]) so it works correctly at all latitudes and
    inclinations — polar passes, retrograde orbits, and antimeridian crossings
    are all handled without special-case threshold logic.
    """
    sat = Satrec.twoline2rv(tle_line1, tle_line2)
    jd, fr = _jday_now()
    now = datetime.now(timezone.utc)

    features = []

    # 10-second steps (~0.167 min) for smoother track lines
    time_step_min = 1 / 6

    for track_type, start_min, end_min in [
        ("orbit1",   0,  92),
        ("orbit2",  92, 184),
    ]:
        coords: list[list[float]] = []
        prev_lon_raw: float | None = None
        unwrapped_lon: float = 0.0

        t = start_min
        while t <= end_min + 1e-9:
            jd_t, fr_t = _jday_offset(jd, fr, t * 60.0)
            result = _propagate_at(sat, jd_t, fr_t)
            if result is None:
                t += time_step_min
                continue

            r, _ = result
            t_propagated = now + timedelta(minutes=t)
            lat, lon, _ = _eci_to_geodetic(r, t_propagated)

            if prev_lon_raw is None:
                unwrapped_lon = lon
            else:
                # Shortest-path difference between consecutive raw longitudes,
                # always in [-180, 180].  This correctly handles antimeridian
                # crossings at any latitude: a satellite crossing from lon +179
                # to -179 has a shortest-path diff of ~-2°, not -358°, so the
                # unwrapped longitude advances by ~-2° as expected.  This also
                # handles polar passes where longitude sweeps many degrees per
                # step — those are real motion and the shortest-path diff
                # captures them without any threshold logic.
                diff = (lon - prev_lon_raw + 180) % 360 - 180
                unwrapped_lon += diff

            coords.append([round(unwrapped_lon, 4), round(lat, 4)])
            prev_lon_raw = lon
            t += time_step_min

        if len(coords) >= 2:
            features.append({
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {"track": track_type},
            })

    return {"type": "FeatureCollection", "features": features}


def _angular_distance_rad(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle angular distance (radians) between two lat/lon points."""
    lat1r, lon1r = math.radians(lat1), math.radians(lon1)
    lat2r, lon2r = math.radians(lat2), math.radians(lon2)
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    return 2 * math.asin(math.sqrt(a))


def _elevation_deg(dist_rad: float, alt_km: float) -> float:
    """Return observer elevation angle (degrees) given angular distance from sub-satellite point."""
    if dist_rad <= 0:
        return 90.0
    return math.degrees(math.atan(
        (math.cos(dist_rad) - (_RE_KM / (_RE_KM + alt_km))) / math.sin(dist_rad)
    ))


def _jday_offset(jd: int, fr: float, offset_seconds: float) -> tuple[int, float]:
    """Return (jd, fr) shifted by offset_seconds."""
    fr_new = fr + offset_seconds / 86400.0
    jd_new = jd
    if fr_new >= 1.0:
        extra_days = int(fr_new)
        jd_new += extra_days
        fr_new -= extra_days
    elif fr_new < 0.0:
        extra_days = int(abs(fr_new)) + 1
        jd_new -= extra_days
        fr_new += extra_days
    return jd_new, fr_new


def compute_passes(
    tle_line1: str,
    tle_line2: str,
    obs_lat: float,
    obs_lon: float,
    lookahead_hours: int = 24,
    min_elevation_deg: float = 0.0,
) -> list[dict]:
    """Predict passes of the satellite above the observer's horizon.

    A pass begins (AOS) when the satellite rises above the observer's horizon
    (elevation >= 0°) and ends (LOS) when it sets below the horizon.

    Returns up to 10 passes within lookahead_hours, each with:
      aos_utc, los_utc, aos_unix_ms, los_unix_ms, duration_s,
      max_elevation_deg, max_el_utc
    """
    sat = Satrec.twoline2rv(tle_line1, tle_line2)
    jd, fr = _jday_now()
    now = datetime.now(timezone.utc)

    total_minutes = lookahead_hours * 60
    passes: list[dict] = []

    # --- coarse scan at 1-minute resolution ---
    prev_visible = False
    # Track start time and sample points for the current pass window
    pass_start_s: float | None = None
    pass_samples: list[tuple[float, float]] = []  # (offset_seconds, elev_deg)

    def _vis_at(offset_s: float) -> tuple[bool, float, float]:
        """Return (visible, elevation_deg, alt_km) at now + offset_s."""
        jd_t, fr_t = _jday_offset(jd, fr, offset_s)
        result = _propagate_at(sat, jd_t, fr_t)
        if result is None:
            return False, -90.0, 0.0
        r, _ = result
        t_prop = now + timedelta(seconds=offset_s)
        lat, lon, alt_km = _eci_to_geodetic(r, t_prop)
        horizon_rad = math.acos(max(-1.0, min(1.0, _RE_KM / (_RE_KM + alt_km))))
        dist_rad = _angular_distance_rad(lat, lon, obs_lat, obs_lon)
        elev = _elevation_deg(dist_rad, alt_km)
        return dist_rad <= horizon_rad, elev, alt_km

    def _refine_transition(t_before_s: float, t_after_s: float) -> float:
        """Binary-search to find the transition second within a 5-second resolution."""
        lo, hi = t_before_s, t_after_s
        for _ in range(10):
            mid = (lo + hi) / 2
            vis_mid, _, _ = _vis_at(mid)
            if vis_mid == _vis_at(t_before_s)[0]:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    for minute in range(total_minutes + 1):
        offset_s = minute * 60.0
        visible, elev, _ = _vis_at(offset_s)

        if visible and not prev_visible:
            # AOS transition
            aos_s = _refine_transition((minute - 1) * 60.0, offset_s) if minute > 0 else 0.0
            pass_start_s = aos_s
            pass_samples = [(offset_s, elev)]
        elif visible and prev_visible:
            pass_samples.append((offset_s, elev))
        elif not visible and prev_visible and pass_start_s is not None:
            # LOS transition
            los_s = _refine_transition((minute - 1) * 60.0, offset_s)

            # Find max elevation within pass
            best_s, best_elev = max(pass_samples, key=lambda x: x[1])
            # Refine max elevation time at 5-second resolution
            lo_s = max(pass_start_s, best_s - 60.0)
            hi_s = min(los_s, best_s + 60.0)
            max_elev = best_elev
            max_elev_s = best_s
            scan_s = lo_s
            while scan_s <= hi_s:
                _, elev_at_scan, _ = _vis_at(scan_s)
                if elev_at_scan > max_elev:
                    max_elev = elev_at_scan
                    max_elev_s = scan_s
                scan_s += 5.0

            if max_elev >= min_elevation_deg:
                aos_dt = now + timedelta(seconds=pass_start_s)
                los_dt = now + timedelta(seconds=los_s)
                max_el_dt = now + timedelta(seconds=max_elev_s)
                passes.append({
                    "aos_utc":           aos_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "los_utc":           los_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "aos_unix_ms":       int(aos_dt.timestamp() * 1000),
                    "los_unix_ms":       int(los_dt.timestamp() * 1000),
                    "duration_s":        int(los_s - pass_start_s),
                    "max_elevation_deg": round(max_elev, 1),
                    "max_el_utc":        max_el_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                })
                if len(passes) >= 10:
                    break

            pass_start_s = None
            pass_samples = []

        prev_visible = visible

    return passes


def compute_footprint(lat: float, lon: float, alt_km: float) -> dict:
    """Compute the satellite visibility footprint as a GeoJSON Polygon or MultiPolygon.

    The footprint radius is determined by the satellite altitude:
      radius_rad = arccos(Re / (Re + alt_km))

    Antimeridian crossings and polar enclosures are handled here so the
    frontend can render the returned geometry directly without further
    coordinate-system gymnastics.  Returned coordinates are always in
    [-180, 180] x [-90, 90], with explicit ±180 vertices on each side of any
    antimeridian split.  Exterior rings are counter-clockwise (per RFC 7946
    §3.1.6) so MapLibre fills the interior of the visibility region.
    """
    radius_rad = math.acos(_RE_KM / (_RE_KM + alt_km))
    lat_rad = math.radians(lat)
    lon_rad = math.radians(lon)

    # 1. Generate the horizon ring at 2° bearing spacing.  Each point's
    #    longitude is normalised to [-180, 180]; we'll re-thread it into a
    #    continuous unwrapped longitude in step 2.
    raw: list[tuple[float, float]] = []
    for i in range(181):
        bearing_rad = math.radians(i * 2)
        lat2 = math.asin(
            math.sin(lat_rad) * math.cos(radius_rad)
            + math.cos(lat_rad) * math.sin(radius_rad) * math.cos(bearing_rad)
        )
        lon2_rad = lon_rad + math.atan2(
            math.sin(bearing_rad) * math.sin(radius_rad) * math.cos(lat_rad),
            math.cos(radius_rad) - math.sin(lat_rad) * math.sin(lat2),
        )
        lon2_norm = (math.degrees(lon2_rad) + 180) % 360 - 180
        raw.append((lon2_norm, math.degrees(lat2)))

    # 2. Unwrap into continuous longitudes.  Python's % is true modulo so the
    #    shortest-path delta is always in [-180, 180] without sign-handling.
    unwrapped: list[tuple[float, float]] = []
    prev_lon: float | None = None
    acc = 0.0
    for lon_n, lat_n in raw:
        if prev_lon is None:
            acc = lon_n
        else:
            acc += (lon_n - prev_lon + 180) % 360 - 180
        unwrapped.append((acc, lat_n))
        prev_lon = lon_n

    def _norm(L: float) -> float:
        return (L + 180) % 360 - 180

    def _round(L: float, A: float) -> list[float]:
        return [round(L, 4), round(A, 4)]

    def _ring_signed_area(ring: list[list[float]]) -> float:
        return sum(
            (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1])
            for i in range(len(ring) - 1)
        ) / 2

    def _ensure_ccw(ring: list[list[float]]) -> list[list[float]]:
        # Positive shoelace area (in lon=x, lat=y coords) means clockwise; reverse.
        if _ring_signed_area(ring) > 0:
            ring.reverse()
        return ring

    def _world_of(L: float) -> int:
        return math.floor((L + 180) / 360)

    # 3. Polar enclosure: net longitude change of a full revolution.  Build a
    #    single polygon that detours over the appropriate pole at each
    #    antimeridian crossing, so the fill correctly covers the polar cap.
    winding = unwrapped[-1][0] - unwrapped[0][0]
    if abs(winding) > 270:
        mean_lat = sum(p[1] for p in unwrapped) / len(unwrapped)
        pole = 90.0 if mean_lat >= 0 else -90.0
        ring: list[list[float]] = []
        for i, (L, A) in enumerate(unwrapped):
            if i == 0:
                ring.append(_round(_norm(L), A))
                continue
            pL, pA = unwrapped[i - 1]
            w_prev = _world_of(pL)
            w_cur = _world_of(L)
            if w_prev != w_cur:
                step = 1 if w_cur > w_prev else -1
                w = w_prev
                while w != w_cur:
                    boundary = (w + 1) * 360 - 180 if step > 0 else w * 360 - 180
                    t = (boundary - pL) / (L - pL)
                    cross_lat = pA + t * (A - pA)
                    exit_side = 180.0 if step > 0 else -180.0
                    entry_side = -exit_side
                    ring.append(_round(exit_side, cross_lat))
                    ring.append(_round(exit_side, pole))
                    ring.append(_round(entry_side, pole))
                    ring.append(_round(entry_side, cross_lat))
                    w += step
            ring.append(_round(_norm(L), A))
        if ring[0] != ring[-1]:
            ring.append(list(ring[0]))
        _ensure_ccw(ring)
        return {"type": "Polygon", "coordinates": [ring]}

    # 4. Antimeridian split: walk the unwrapped ring, break at each ±180°
    #    world boundary, and stitch the trailing fragment back onto the first
    #    sub-ring (since the input ring is closed, the walk's start and end
    #    belong to the same sub-ring).
    sub_rings: list[list[list[float]]] = []
    current: list[list[float]] = []
    pending_first = False
    for i, (L, A) in enumerate(unwrapped):
        if i == 0:
            current.append([L, A])
            continue
        pL, pA = unwrapped[i - 1]
        w_prev = _world_of(pL)
        w_cur = _world_of(L)
        if w_prev != w_cur:
            step = 1 if w_cur > w_prev else -1
            w = w_prev
            while w != w_cur:
                boundary = (w + 1) * 360 - 180 if step > 0 else w * 360 - 180
                t = (boundary - pL) / (L - pL)
                cross_lat = pA + t * (A - pA)
                exit_lon = 180.0 if step > 0 else -180.0
                entry_lon = -exit_lon
                current.append([exit_lon, cross_lat])
                if not pending_first:
                    sub_rings.append(current)
                    pending_first = True
                else:
                    current.append([current[0][0], current[0][1]])
                    sub_rings.append(current)
                current = [[entry_lon, cross_lat]]
                w += step
        current.append([L, A])
    if current:
        if pending_first and sub_rings:
            first = sub_rings[0]
            sub_rings[0] = current + first[1:]
        else:
            sub_rings.append(current)

    # 5. Normalise lons; preserve ±180 boundary markers on the side that
    #    matches the sub-ring's hemisphere (otherwise %-based normalisation
    #    silently flips +180 to -180, placing them on the wrong map edge).
    out_rings: list[list[list[float]]] = []
    for ring_pts in sub_rings:
        east_votes = 0
        west_votes = 0
        for L, _ in ring_pts:
            if L == 180.0 or L == -180.0:
                continue
            n = _norm(L)
            if n > 0:
                east_votes += 1
            elif n < 0:
                west_votes += 1
        boundary_lon = 180.0 if east_votes >= west_votes else -180.0
        norm_ring: list[list[float]] = []
        for L, A in ring_pts:
            if L == 180.0 or L == -180.0:
                norm_ring.append(_round(boundary_lon, A))
            else:
                norm_ring.append(_round(_norm(L), A))
        if len(norm_ring) >= 2 and norm_ring[0] != norm_ring[-1]:
            norm_ring.append(list(norm_ring[0]))
        if len(norm_ring) >= 4:
            _ensure_ccw(norm_ring)
            out_rings.append(norm_ring)

    if len(out_rings) == 1:
        return {"type": "Polygon", "coordinates": out_rings}
    return {"type": "MultiPolygon", "coordinates": [[r] for r in out_rings]}
