import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe, toHaveNoViolations } from 'jest-axe'
import UpcomingPassesSection from './UpcomingPassesSection.vue'
import type { AccPass } from './spacePassesUtils'
import { formatPassDate, formatPassTime } from './utils/satelliteUtils'

expect.extend(toHaveNoViolations)

// The section is mounted on its own, outside the page landmarks its hosts sit in.
const NO_REGION_RULE = { rules: { region: { enabled: false } } }

const NOW_MS = Date.UTC(2026, 10, 15, 12, 0, 0)

function makePass(aosOffsetMs: number, durationSeconds: number, maxElevationDeg: number): AccPass {
  const aosMs = NOW_MS + aosOffsetMs
  const losMs = aosMs + durationSeconds * 1000
  return {
    aos_utc: new Date(aosMs).toISOString(),
    los_utc: new Date(losMs).toISOString(),
    aos_unix_ms: aosMs,
    los_unix_ms: losMs,
    duration_s: durationSeconds,
    max_elevation_deg: maxElevationDeg,
    max_el_utc: new Date(aosMs + 1000).toISOString(),
  }
}

function mountSection(
  props: Partial<{ passes: AccPass[]; loading: boolean; status: string; now: number }> = {},
) {
  return mount(UpcomingPassesSection, {
    props: {
      passes: [],
      loading: false,
      status: 'NEXT 24H · UPDATED 12:00',
      now: NOW_MS,
      ...props,
    },
  })
}

describe('UpcomingPassesSection', () => {
  describe('title and status', () => {
    it('renders the UPCOMING PASSES title and the status text', () => {
      const wrapper = mountSection({ status: 'NETWORK ERROR' })
      expect(wrapper.find('.sat-acc-passes-title').text()).toContain('UPCOMING PASSES')
      expect(wrapper.find('.sat-acc-status').text()).toBe('NETWORK ERROR')
    })

    it('marks the status as loading only while loading', async () => {
      const wrapper = mountSection({ loading: true, status: 'COMPUTING PASSES…' })
      expect(wrapper.find('.sat-acc-status').classes()).toContain('sat-acc-status-loading')
      await wrapper.setProps({ loading: false })
      expect(wrapper.find('.sat-acc-status').classes()).not.toContain('sat-acc-status-loading')
    })
  })

  describe('empty state', () => {
    it('says there are no passes when a finished NEXT 24H load found none', () => {
      const wrapper = mountSection()
      expect(wrapper.find('.sat-acc-no-passes').text()).toBe('No passes in the next 24 hours.')
      expect(wrapper.findAll('.sat-acc-pass-card')).toHaveLength(0)
    })

    it('stays hidden while the passes are still loading', () => {
      expect(mountSection({ loading: true }).find('.sat-acc-no-passes').exists()).toBe(false)
    })

    it('stays hidden when the status is an error rather than a NEXT 24H result', () => {
      for (const status of [
        'COULD NOT LOAD PASSES',
        'NETWORK ERROR',
        'SET LOCATION TO CALCULATE PASSES',
      ]) {
        expect(mountSection({ status }).find('.sat-acc-no-passes').exists()).toBe(false)
      }
    })

    it('stays hidden when there are passes to show', () => {
      const wrapper = mountSection({ passes: [makePass(60_000, 600, 20)] })
      expect(wrapper.find('.sat-acc-no-passes').exists()).toBe(false)
    })
  })

  describe('pass cards', () => {
    it('renders one card per pass, in the order given', () => {
      const passes = [makePass(60_000, 600, 20), makePass(3_600_000, 300, 10)]
      const cards = mountSection({ passes }).findAll('.sat-acc-pass-card')
      expect(cards).toHaveLength(2)
      expect(cards[0]!.find('.sat-acc-pass-time').text()).toBe(formatPassTime(passes[0]!.aos_utc))
      expect(cards[1]!.find('.sat-acc-pass-time').text()).toBe(formatPassTime(passes[1]!.aos_utc))
    })

    it('shows the AOS date and time, the LOS time with duration, and the max elevation', () => {
      const pass = makePass(3_600_000, 754, 7.06)
      const card = mountSection({ passes: [pass] }).find('.sat-acc-pass-card')
      expect(card.find('.sat-acc-pass-date').text()).toBe(formatPassDate(pass.aos_utc))
      expect(card.find('.sat-acc-pass-time').text()).toBe(formatPassTime(pass.aos_utc))
      expect(card.find('.sat-acc-pass-los').text()).toBe(
        `LOS ${formatPassTime(pass.los_utc)} · 12m 34s`,
      )
      expect(card.find('.sat-acc-pass-maxel').text()).toBe('MAX 7.1°')
    })

    it('counts down to a future pass from the now prop', () => {
      const countdown = mountSection({ passes: [makePass(90_000, 600, 20)] }).find(
        '.sat-acc-pass-countdown',
      )
      expect(countdown.text()).toBe('IN 1m 30s')
      expect(countdown.classes()).not.toContain('sat-acc-pass-countdown--live')
    })

    it('shows NOW, styled live, from AOS through LOS inclusive', () => {
      const pass = makePass(0, 600, 20)
      for (const now of [pass.aos_unix_ms, pass.aos_unix_ms + 300_000, pass.los_unix_ms]) {
        const countdown = mountSection({ passes: [pass], now }).find('.sat-acc-pass-countdown')
        expect(countdown.text()).toBe('NOW')
        expect(countdown.classes()).toContain('sat-acc-pass-countdown--live')
      }
    })

    it('is no longer live one millisecond either side of the pass', () => {
      const pass = makePass(0, 600, 20)
      for (const now of [pass.aos_unix_ms - 1, pass.los_unix_ms + 1]) {
        const countdown = mountSection({ passes: [pass], now }).find('.sat-acc-pass-countdown')
        expect(countdown.text()).not.toBe('NOW')
        expect(countdown.classes()).not.toContain('sat-acc-pass-countdown--live')
      }
    })

    it('updates the countdown and flips to NOW as the host ticks now forward', async () => {
      const pass = makePass(5_000, 600, 20)
      const wrapper = mountSection({ passes: [pass] })
      expect(wrapper.find('.sat-acc-pass-countdown').text()).toBe('IN 5s')
      await wrapper.setProps({ now: NOW_MS + 2_000 })
      expect(wrapper.find('.sat-acc-pass-countdown').text()).toBe('IN 3s')
      await wrapper.setProps({ now: NOW_MS + 5_000 })
      expect(wrapper.find('.sat-acc-pass-countdown').text()).toBe('NOW')
    })
  })

  describe('accessibility', () => {
    it('has no violations with passes listed', async () => {
      const wrapper = mountSection({
        passes: [makePass(0, 600, 42.5), makePass(3_600_000, 300, 9)],
      })
      expect(await axe(wrapper.element, NO_REGION_RULE)).toHaveNoViolations()
    })

    it('has no violations in the empty state', async () => {
      expect(await axe(mountSection().element, NO_REGION_RULE)).toHaveNoViolations()
    })
  })
})
