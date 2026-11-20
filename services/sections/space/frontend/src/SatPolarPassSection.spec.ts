import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatPolarPassSection from './SatPolarPassSection.vue'
import SatPolarPlot from './SatPolarPlot.vue'
import type { AccPass, SkyPoint } from './spacePassesUtils'
import { formatPassDate, formatPassTime } from './utils/satelliteUtils'

// The section is mounted on its own, outside the page landmarks its hosts sit in.
const NO_REGION_RULE = { rules: { region: { enabled: false } } }

const NOW_MS = Date.UTC(2026, 10, 20, 9, 0)
const MINUTE_MS = 60_000
const TRACK: SkyPoint[] = [
  { az: 10, el: 0 },
  { az: 90, el: 45 },
  { az: 170, el: 0 },
]
const LIVE: SkyPoint = { az: 90, el: 45 }

function accPass(
  startOffsetMinutes: number,
  maxElevationDeg: number,
  track: SkyPoint[] | null = TRACK,
): AccPass {
  const aosMs = NOW_MS + startOffsetMinutes * MINUTE_MS
  const losMs = aosMs + 10 * MINUTE_MS
  return {
    aos_utc: new Date(aosMs).toISOString(),
    los_utc: new Date(losMs).toISOString(),
    aos_unix_ms: aosMs,
    los_unix_ms: losMs,
    duration_s: 600,
    max_elevation_deg: maxElevationDeg,
    max_el_utc: new Date(aosMs).toISOString(),
    ...(track ? { sky_track: track } : {}),
  }
}

const isActiveAtNow = (pass: AccPass) => NOW_MS >= pass.aos_unix_ms && NOW_MS <= pass.los_unix_ms

function mountSection(
  props: Partial<{
    passes: AccPass[]
    now: number
    isPassActive: (pass: AccPass) => boolean
    liveAzEl: SkyPoint | null
    loading: boolean
  }> = {},
) {
  return mount(SatPolarPassSection, {
    props: {
      passes: [],
      now: NOW_MS,
      isPassActive: isActiveAtNow,
      liveAzEl: LIVE,
      loading: false,
      ...props,
    },
  })
}

const heading = (pass: AccPass) => `${formatPassDate(pass.aos_utc)} ${formatPassTime(pass.aos_utc)}`

describe('SatPolarPassSection', () => {
  describe('with no passes', () => {
    it('titles the section NEXT PASS and says there is nothing to plot', () => {
      const wrapper = mountSection()
      expect(wrapper.get('.sat-acc-polar-title').text()).toBe('NEXT PASS')
      expect(wrapper.find('.sat-acc-polar-maxel').exists()).toBe(false)
      expect(wrapper.get('.sat-acc-polar-empty').text()).toBe('NO UPCOMING PASS TO PLOT')
      expect(wrapper.findComponent(SatPolarPlot).exists()).toBe(false)
    })

    it('says the arc is being computed while loading', () => {
      const wrapper = mountSection({ loading: true })
      expect(wrapper.get('.sat-acc-polar-empty').text()).toBe('COMPUTING ARC…')
    })
  })

  it('plots the next pass, without the live marker, while none is in progress', () => {
    const next = accPass(30, 61.6)
    const wrapper = mountSection({ passes: [accPass(-60, 10), next, accPass(90, 20)] })
    expect(wrapper.get('.sat-acc-polar-title').text()).toBe(`NEXT PASS · ${heading(next)}MAX 62°`)
    const plot = wrapper.getComponent(SatPolarPlot)
    expect(plot.props('track')).toEqual(TRACK)
    expect(plot.props('live')).toBeNull()
  })

  it('plots the pass in progress with the live marker on it', () => {
    const current = accPass(-5, 40)
    const wrapper = mountSection({ passes: [current, accPass(30, 61)] })
    expect(wrapper.get('.sat-acc-polar-title').text()).toBe(
      `CURRENT PASS · ${heading(current)}MAX 40°`,
    )
    expect(wrapper.getComponent(SatPolarPlot).props('live')).toEqual(LIVE)
  })

  it('passes a missing live position through as no marker', () => {
    const wrapper = mountSection({ passes: [accPass(-5, 40)], liveAzEl: null })
    expect(wrapper.getComponent(SatPolarPlot).props('live')).toBeNull()
  })

  it("judges 'in progress' with the pane's own rule, not the now prop", () => {
    const isPassActive = vi.fn(() => false)
    const wrapper = mountSection({ passes: [accPass(-5, 40), accPass(30, 61)], isPassActive })
    expect(isPassActive).toHaveBeenCalled()
    expect(wrapper.get('.sat-acc-polar-title').text()).toMatch(/^NEXT PASS · .*MAX 61°$/)
  })

  it('counts a pass starting exactly now as past, not next', () => {
    const wrapper = mountSection({ passes: [accPass(0, 40)], isPassActive: () => false })
    expect(wrapper.get('.sat-acc-polar-title').text()).toBe('NEXT PASS')
    expect(wrapper.find('.sat-acc-polar-empty').exists()).toBe(true)
  })

  it('titles a pass with no sky track but plots nothing', () => {
    const next = accPass(30, 61, null)
    const wrapper = mountSection({ passes: [next] })
    expect(wrapper.get('.sat-acc-polar-title').text()).toBe(`NEXT PASS · ${heading(next)}MAX 61°`)
    expect(wrapper.findComponent(SatPolarPlot).exists()).toBe(false)
    expect(wrapper.get('.sat-acc-polar-empty').text()).toBe('NO UPCOMING PASS TO PLOT')
  })

  it('needs at least two track points to plot', () => {
    const wrapper = mountSection({ passes: [accPass(30, 61, [{ az: 10, el: 0 }])] })
    expect(wrapper.findComponent(SatPolarPlot).exists()).toBe(false)
  })

  it('moves on when the next pass starts', async () => {
    const first = accPass(1, 30)
    const second = accPass(60, 50)
    const wrapper = mountSection({ passes: [first, second], isPassActive: () => false })
    await wrapper.setProps({ now: first.aos_unix_ms })
    expect(wrapper.get('.sat-acc-polar-title').text()).toBe(`NEXT PASS · ${heading(second)}MAX 50°`)
  })

  it('has no axe violations with a plot or without one', async () => {
    const plotted = mountSection({ passes: [accPass(-5, 40)] })
    expect(await axe(plotted.element, NO_REGION_RULE)).toHaveNoViolations()
    const empty = mountSection()
    expect(await axe(empty.element, NO_REGION_RULE)).toHaveNoViolations()
  })
})
