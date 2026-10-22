import { describe, it, expect } from 'vitest'
import { decode } from '@googlemaps/polyline-codec'
import { buildRoutePolyline } from '../../../../server/utils/route-polyline'

describe('buildRoutePolyline', () => {
  it('encodes a simple route that round-trips through decode', () => {
    const route: [number, number][] = [
      [39.600956, 2.601888],
      [39.601956, 2.602888],
      [39.602956, 2.603888]
    ]
    const encoded = buildRoutePolyline(route)
    expect(encoded).toBeTruthy()
    const decoded = decode(encoded!)
    expect(decoded).toHaveLength(3)
    expect(decoded[0]![0]).toBeCloseTo(39.60096, 4)
    expect(decoded[2]![1]).toBeCloseTo(2.60389, 4)
  })

  it('returns null for missing, empty or too-short input', () => {
    expect(buildRoutePolyline(null)).toBeNull()
    expect(buildRoutePolyline(undefined)).toBeNull()
    expect(buildRoutePolyline('nope')).toBeNull()
    expect(buildRoutePolyline([])).toBeNull()
    expect(buildRoutePolyline([[39.6, 2.6]])).toBeNull()
  })

  it('ignores invalid points and the 0,0 no-fix placeholder', () => {
    const encoded = buildRoutePolyline([
      [0, 0],
      [39.6, 2.6],
      [null, 2.6],
      [Number.NaN, 2.6],
      [91, 2.6],
      [39.7, 2.7],
      [0, 0]
    ])
    const decoded = decode(encoded!)
    expect(decoded).toHaveLength(2)
  })

  it('returns null when only invalid points remain', () => {
    expect(
      buildRoutePolyline([
        [0, 0],
        [0, 0],
        [200, 10]
      ])
    ).toBeNull()
  })

  it('downsamples long routes keeping first and last points', () => {
    const route: [number, number][] = Array.from({ length: 5000 }, (_, i) => [
      39 + i * 0.0001,
      2 + i * 0.0001
    ])
    const decoded = decode(buildRoutePolyline(route, 250)!)
    expect(decoded).toHaveLength(250)
    expect(decoded[0]![0]).toBeCloseTo(39, 4)
    expect(decoded[249]![0]).toBeCloseTo(39 + 4999 * 0.0001, 4)
  })

  it('does not downsample routes below the limit', () => {
    const route: [number, number][] = Array.from({ length: 100 }, (_, i) => [
      39 + i * 0.001,
      2 + i * 0.001
    ])
    expect(decode(buildRoutePolyline(route, 250)!)).toHaveLength(100)
  })
})
