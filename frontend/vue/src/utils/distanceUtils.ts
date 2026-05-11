const EARTH_RADIUS_NM = 3440.065

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const toRad = (d: number) => d * Math.PI / 180
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return EARTH_RADIUS_NM * c
}

export function buildCirclePolygon(
    lng: number,
    lat: number,
    radiusNm: number,
    steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
    const R = radiusNm / EARTH_RADIUS_NM
    const lat1 = lat * Math.PI / 180
    const lon1 = lng * Math.PI / 180
    const ring: [number, number][] = []
    for (let i = 0; i <= steps; i++) {
        const bearing = (i / steps) * Math.PI * 2
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(R) + Math.cos(lat1) * Math.sin(R) * Math.cos(bearing))
        const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(R) * Math.cos(lat1), Math.cos(R) - Math.sin(lat1) * Math.sin(lat2))
        ring.push([lon2 * 180 / Math.PI, lat2 * 180 / Math.PI])
    }
    return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { radiusNm },
    }
}
