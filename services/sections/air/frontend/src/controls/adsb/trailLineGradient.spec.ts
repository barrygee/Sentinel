import { describe, expect, it } from 'vitest'
import { trailLineGradient } from './trailLineGradient'

describe('trailLineGradient', () => {
  const at = (lon: number, colour: string, lat = 0) => ({ lon, lat, colour })

  it('places a stop at each vertex by distance along the line', () => {
    const gradient = trailLineGradient([at(0, 'red'), at(1, 'green'), at(4, 'blue')])
    expect(gradient).toEqual([
      'interpolate',
      ['linear'],
      ['line-progress'],
      0,
      'red',
      0.25,
      'green',
      1,
      'blue',
    ])
  })

  it('narrows longitude towards the poles, as the map does', () => {
    const gradient = trailLineGradient([
      at(0, 'red', 60),
      at(2, 'green', 60), // 1° of latitude's length at 60°.
      { lon: 2, lat: 61, colour: 'blue' },
    ])!
    expect(gradient[5]).toBeCloseTo(0.5, 1)
  })

  it('skips a repeated position, because stops must rise', () => {
    const gradient = trailLineGradient([at(0, 'red'), at(0, 'green'), at(2, 'blue')])
    expect(gradient).toEqual(['interpolate', ['linear'], ['line-progress'], 0, 'red', 1, 'blue'])
  })

  it('is null for a line with no length', () => {
    expect(trailLineGradient([at(0, 'red'), at(0, 'blue')])).toBeNull()
  })

  it('is null for a single point', () => {
    expect(trailLineGradient([at(0, 'red')])).toBeNull()
  })
})
