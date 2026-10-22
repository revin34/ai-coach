type LatLng = [number, number]

function isValidPoint(point: unknown): point is LatLng {
  if (!Array.isArray(point) || point.length < 2) return false
  const [lat, lng] = point
  if (typeof lat !== 'number' || typeof lng !== 'number') return false
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false
  // Devices report 0,0 while they still have no GPS fix.
  return !(lat === 0 && lng === 0)
}

// Google encoded polyline algorithm (precision 5). Implemented locally because
// `@googlemaps/polyline-codec` is CommonJS and its named exports cannot be
// imported by the worker (tsx / native Node ESM).
function encodeValue(value: number, out: string[]): void {
  let v = value < 0 ? ~(value << 1) : value << 1
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63))
    v >>= 5
  }
  out.push(String.fromCharCode(v + 63))
}

function encodePolyline(points: LatLng[]): string {
  const out: string[] = []
  let prevLat = 0
  let prevLng = 0
  for (const [lat, lng] of points) {
    const latE5 = Math.round(lat * 1e5)
    const lngE5 = Math.round(lng * 1e5)
    encodeValue(latE5 - prevLat, out)
    encodeValue(lngE5 - prevLng, out)
    prevLat = latE5
    prevLng = lngE5
  }
  return out.join('')
}

/**
 * Builds the encoded summary polyline used by route thumbnails from a full
 * GPS stream. The stream is downsampled evenly (keeping first and last point)
 * so the stored value stays small. Returns null when there is no usable route.
 */
export function buildRoutePolyline(latlng: unknown, maxPoints = 250): string | null {
  if (!Array.isArray(latlng)) return null

  const points = latlng.filter(isValidPoint)
  if (points.length < 2) return null

  let sampled: LatLng[] = points
  if (points.length > maxPoints && maxPoints >= 2) {
    sampled = []
    const step = (points.length - 1) / (maxPoints - 1)
    for (let i = 0; i < maxPoints; i++) {
      sampled.push(points[Math.round(i * step)]!)
    }
  }

  return encodePolyline(sampled)
}
