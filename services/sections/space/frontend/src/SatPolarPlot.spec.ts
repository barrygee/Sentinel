import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatPolarPlot from './SatPolarPlot.vue'

interface SkyPoint {
  az: number
  el: number
}

function mountPlot(props: { track: SkyPoint[]; live?: SkyPoint | null }) {
  return mount(SatPolarPlot, { props })
}

// Geometry constants mirrored from the component for assertions.
const CENTRE = 100 // SIZE/2
const HORIZON_R = 88 // R

describe('SatPolarPlot rings + axes', () => {
  it('always renders the three elevation rings and two cardinal axes', () => {
    const wrapper = mountPlot({ track: [] })
    expect(wrapper.findAll('circle.spp-polar-ring')).toHaveLength(3)
    expect(wrapper.findAll('line.spp-polar-axis')).toHaveLength(2)
  })

  it('places the horizon ring at the full radius and the zenith at the centre', () => {
    const wrapper = mountPlot({ track: [] })
    const horizon = wrapper.find('circle.spp-polar-ring--horizon')
    // el 0 → radius R (horizon).
    expect(horizon.attributes('r')).toBe(String(HORIZON_R))
    expect(horizon.attributes('cx')).toBe(String(CENTRE))
  })
})

describe('SatPolarPlot track arc', () => {
  it('omits the polyline when there are fewer than two samples', () => {
    expect(mountPlot({ track: [] }).find('polyline.spp-polar-track').exists()).toBe(false)
    expect(
      mountPlot({ track: [{ az: 0, el: 0 }] })
        .find('polyline.spp-polar-track')
        .exists(),
    ).toBe(false)
  })

  it('draws the polyline with one projected point per sample', () => {
    const wrapper = mountPlot({
      track: [
        { az: 0, el: 0 },
        { az: 90, el: 90 },
      ],
    })
    const polyline = wrapper.find('polyline.spp-polar-track')
    expect(polyline.exists()).toBe(true)
    const points = polyline.attributes('points')!.split(' ')
    expect(points).toHaveLength(2)
    // az 90 / el 90 (zenith) projects to the exact centre regardless of azimuth.
    expect(points[1]).toBe('100.0,100.0')
  })
})

describe('SatPolarPlot endpoints', () => {
  it('renders no AOS/LOS markers for a track shorter than two points', () => {
    const wrapper = mountPlot({ track: [{ az: 10, el: 10 }] })
    expect(wrapper.find('circle.spp-polar-aos').exists()).toBe(false)
    expect(wrapper.find('circle.spp-polar-los').exists()).toBe(false)
  })

  it('marks the first sample as AOS and the last as LOS', () => {
    const wrapper = mountPlot({
      track: [
        { az: 0, el: 0 }, // AOS at the horizon, due north → (100, 12)
        { az: 45, el: 45 },
        { az: 90, el: 90 }, // LOS at zenith → centre
      ],
    })
    const aos = wrapper.find('circle.spp-polar-aos')
    const los = wrapper.find('circle.spp-polar-los')
    expect(aos.attributes('cy')).toBe(String(CENTRE - HORIZON_R)) // 12
    expect(los.attributes('cx')).toBe(String(CENTRE))
    expect(los.attributes('cy')).toBe(String(CENTRE))
  })
})

describe('SatPolarPlot live satellite', () => {
  it('omits the live marker when no live position is given', () => {
    expect(mountPlot({ track: [] }).find('circle.spp-polar-sat').exists()).toBe(false)
    expect(mountPlot({ track: [], live: null }).find('circle.spp-polar-sat').exists()).toBe(false)
  })

  it('renders the live marker and halo at the projected position', () => {
    // az 0 / el 0 → due-north horizon point (100, 12).
    const wrapper = mountPlot({ track: [], live: { az: 0, el: 0 } })
    const sat = wrapper.find('circle.spp-polar-sat')
    const halo = wrapper.find('circle.spp-polar-sat-halo')
    expect(sat.exists()).toBe(true)
    expect(halo.exists()).toBe(true)
    expect(sat.attributes('cx')).toBe(String(CENTRE))
    expect(sat.attributes('cy')).toBe(String(CENTRE - HORIZON_R))
  })

  it('clamps elevation below the horizon up to the horizon radius', () => {
    // el −5 clamps to 0 → same radius as the horizon (full R from centre).
    const wrapper = mountPlot({ track: [], live: { az: 0, el: -5 } })
    expect(wrapper.find('circle.spp-polar-sat').attributes('cy')).toBe(String(CENTRE - HORIZON_R))
  })

  it('clamps elevation above the zenith down to the centre', () => {
    // el 120 clamps to 90 → radius 0 → the centre point.
    const wrapper = mountPlot({ track: [], live: { az: 200, el: 120 } })
    const sat = wrapper.find('circle.spp-polar-sat')
    expect(sat.attributes('cx')).toBe(String(CENTRE))
    expect(sat.attributes('cy')).toBe(String(CENTRE))
  })
})

describe('SatPolarPlot accessibility', () => {
  it('exposes the plot as a labelled image and has no axe violations', async () => {
    const wrapper = mountPlot({
      track: [
        { az: 0, el: 0 },
        { az: 90, el: 90 },
      ],
      live: { az: 45, el: 45 },
    })
    expect(wrapper.find('svg[role="img"]').attributes('aria-label')).toBe(
      'Satellite sky track polar plot',
    )
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
