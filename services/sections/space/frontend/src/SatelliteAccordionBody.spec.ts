import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatelliteAccordionBody from './SatelliteAccordionBody.vue'
import SatTelemetryGrids from './SatTelemetryGrids.vue'
import SatRadioInfoSection from './SatRadioInfoSection.vue'
import SatelliteActionRow from './SatelliteActionRow.vue'
import SatPolarPassSection from './SatPolarPassSection.vue'
import UpcomingPassesSection from './UpcomingPassesSection.vue'
import type { AccPass } from './spacePassesUtils'

// The body is mounted on its own, outside the page landmarks its hosts sit in.
const NO_REGION_RULE = { rules: { region: { enabled: false } } }

type BodyProps = InstanceType<typeof SatelliteAccordionBody>['$props']

const NOW_MS = Date.UTC(2026, 10, 20, 9, 0)
const PASS: AccPass = {
  aos_utc: new Date(NOW_MS + 600_000).toISOString(),
  los_utc: new Date(NOW_MS + 1_200_000).toISOString(),
  aos_unix_ms: NOW_MS + 600_000,
  los_unix_ms: NOW_MS + 1_200_000,
  duration_s: 600,
  max_elevation_deg: 42,
  max_el_utc: new Date(NOW_MS + 900_000).toISOString(),
  sky_track: [
    { az: 10, el: 0 },
    { az: 90, el: 42 },
    { az: 170, el: 0 },
  ],
}

const isPassActive = () => false

const PROPS: BodyProps = {
  satellite: { downlink_hz: 145_800_000, downlink_mode: 'FM' },
  telemetry: { lat: '54.9°', alt: '418 km' },
  liveAzEl: { az: 90, el: 42 },
  passes: [PASS],
  loading: false,
  status: 'NEXT 24H · UPDATED 09:00',
  now: NOW_MS,
  isPassActive,
  following: true,
  notifying: false,
  autoTuneArmed: true,
  recordArmed: false,
  conflictText: 'Overlaps AO-7 @ 09:15 — earlier pass keeps the radio',
}

function mountBody(overrides: Partial<BodyProps> = {}) {
  return mount(SatelliteAccordionBody, {
    props: { ...PROPS, ...overrides },
    attachTo: document.body,
  })
}

describe('SatelliteAccordionBody', () => {
  it('stacks telemetry, radio, actions, polar plot and upcoming passes in that order', () => {
    const wrapper = mountBody()
    const order = [
      SatTelemetryGrids,
      SatRadioInfoSection,
      SatelliteActionRow,
      SatPolarPassSection,
      UpcomingPassesSection,
    ].map((component) => wrapper.getComponent(component).element)
    for (let index = 1; index < order.length; index++) {
      const relation = order[index - 1]!.compareDocumentPosition(order[index]!)
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    wrapper.unmount()
  })

  it('hands each section its props', () => {
    const wrapper = mountBody()
    expect(wrapper.getComponent(SatTelemetryGrids).props('telemetry')).toEqual(PROPS.telemetry)
    expect(wrapper.getComponent(SatRadioInfoSection).props('radio')).toEqual(PROPS.satellite)
    expect(wrapper.getComponent(SatelliteActionRow).props()).toEqual({
      following: true,
      notifying: false,
      hasDownlink: true,
      autoTuneArmed: true,
      recordArmed: false,
      conflictText: PROPS.conflictText,
    })
    expect(wrapper.getComponent(SatPolarPassSection).props()).toEqual({
      passes: [PASS],
      now: NOW_MS,
      isPassActive,
      liveAzEl: PROPS.liveAzEl,
      loading: false,
    })
    expect(wrapper.getComponent(UpcomingPassesSection).props()).toEqual({
      passes: [PASS],
      loading: false,
      status: PROPS.status,
      now: NOW_MS,
    })
    wrapper.unmount()
  })

  it('offers auto-tune only for a satellite with a downlink', () => {
    const wrapper = mountBody({ satellite: { downlink_hz: null } })
    expect(wrapper.getComponent(SatelliteActionRow).props('hasDownlink')).toBe(false)
    expect(wrapper.find('button[aria-label="Auto-tune SDR"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([
    ['Untrack satellite', 'track'],
    ['Enable pass alerts', 'toggle-pass-notif'],
    ['Auto-tune SDR', 'toggle-auto-tune'],
    ['Record pass', 'toggle-record'],
  ])('re-emits a click on %s as %s', async (label, eventName) => {
    const wrapper = mountBody()
    await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
    expect(Object.keys(wrapper.emitted())).toContain(eventName)
    expect(wrapper.emitted(eventName)).toEqual([[]])
    wrapper.unmount()
  })

  it('has no axe violations', async () => {
    const wrapper = mountBody()
    expect(await axe(document.body, NO_REGION_RULE)).toHaveNoViolations()
    wrapper.unmount()
  })
})
