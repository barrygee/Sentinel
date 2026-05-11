// Canvas sprite factories + footprint feature builder for SatelliteControl.
// Pure functions: no map / no class state.

export function createSatelliteIcon(): ImageData {
    const size = 96
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const cx = size / 2, cy = size / 2
    ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx + 9, cy)
    ctx.lineTo(cx, cy + 11); ctx.lineTo(cx - 9, cy); ctx.closePath()
    ctx.fillStyle = '#ffffff'; ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillRect(cx - 28, cy - 4, 15, 8); ctx.fillRect(cx + 13, cy - 4, 15, 8)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy - 21); ctx.stroke()
    return ctx.getImageData(0, 0, size, size)
}

export function createSatBracket(): ImageData {
    const size = 96
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    const left = 8, top = 8, right = 88, bottom = 88, arm = 14
    ctx.fillStyle = 'rgba(0,0,0,0.10)'; ctx.fillRect(left, top, right - left, bottom - top)
    ctx.strokeStyle = '#c8ff00'; ctx.lineWidth = 2.5; ctx.lineCap = 'square'
    ;([
        [left, top, 1, 1], [right, top, -1, 1],
        [left, bottom, 1, -1], [right, bottom, -1, -1],
    ] as [number, number, number, number][]).forEach(([x, y, dx, dy]) => {
        ctx.beginPath(); ctx.moveTo(x + dx * arm, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * arm); ctx.stroke()
    })
    return ctx.getImageData(0, 0, size, size)
}

// Build the FeatureCollection used by the footprint source: one fill
// feature for the (Multi)Polygon plus one LineString outline per ring.
// The backend has already split antimeridian crossings and handled polar
// enclosures, so the geometry can be rendered as-is with no further math.
export function buildFootprintFeatures(
    geom: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): GeoJSON.FeatureCollection {
    const rings: GeoJSON.Position[][] = geom.type === 'Polygon'
        ? [geom.coordinates[0]]
        : geom.coordinates.map(p => p[0])
    const features: GeoJSON.Feature[] = [
        { type: 'Feature', geometry: geom, properties: {} },
    ]
    for (const ring of rings) {
        features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: ring },
            properties: {},
        })
    }
    return { type: 'FeatureCollection', features }
}
