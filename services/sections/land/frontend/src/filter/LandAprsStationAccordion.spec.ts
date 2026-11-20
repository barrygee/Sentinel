import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LandAprsStationAccordion from './LandAprsStationAccordion.vue'
import LandStationRawFrame from './LandStationRawFrame.vue'
import type { AprsStation } from '../stores/land'
import { formatHeardTime } from '../controls/aprs/AprsStationsControl'

const HEARD_MS = new Date(2026, 10, 20, 9, 5, 7).getTime()

function station(overrides: Partial<AprsStation> = {}): AprsStation {
  return {
    callsign: 'M0ABC-9',
    latitude: 54.970123,
    longitude: -1.613456,
    symbol: '/>',
    comment: 'Rolling north',
    course: 12.4,
    speed: 63.6,
    altitude: 120.2,
    path: 'WIDE1-1,WIDE2-1',
    raw: 'M0ABC-9>APRS:!x',
    last_heard_ms: HEARD_MS,
    ...overrides,
  }
}

/** The value shown under a data cell's label, by the label's text. */
function cellValue(wrapper: ReturnType<typeof mount>, label: string): string {
  const cell = wrapper
    .findAll('.ba-data-cell')
    .find((candidate) => candidate.find('.ba-data-cell-label').text() === label)
  if (!cell) throw new Error(`no ${label} cell`)
  return cell.find('.ba-data-cell-value').text()
}

describe('LandAprsStationAccordion', () => {
  it('lays the beacon out in STATION, POSITION, MOVEMENT and PACKET grids', () => {
    const wrapper = mount(LandAprsStationAccordion, { props: { station: station() } })
    expect(wrapper.findAll('.ba-data-grid-title').map((title) => title.text())).toEqual([
      'STATION',
      'POSITION',
      'MOVEMENT',
      'PACKET',
    ])
  })

  it('shows every field the beacon carried, formatted for reading', () => {
    const wrapper = mount(LandAprsStationAccordion, { props: { station: station() } })
    expect(cellValue(wrapper, 'CALLSIGN')).toBe('M0ABC-9')
    expect(cellValue(wrapper, 'TIME')).toBe(formatHeardTime(HEARD_MS))
    expect(cellValue(wrapper, 'LATITUDE')).toBe('54.97012')
    expect(cellValue(wrapper, 'LONGITUDE')).toBe('-1.61346')
    expect(cellValue(wrapper, 'ALTITUDE')).toBe('120 M')
    expect(cellValue(wrapper, 'COURSE')).toBe('12°')
    expect(cellValue(wrapper, 'SPEED')).toBe('64 KM/H')
    expect(cellValue(wrapper, 'PATH')).toBe('WIDE1-1,WIDE2-1')
    expect(cellValue(wrapper, 'COMMENT')).toBe('Rolling north')
  })

  it('shows the symbol as the map glyph, named by its type', () => {
    const wrapper = mount(LandAprsStationAccordion, { props: { station: station() } })
    expect(wrapper.get('[role="img"]').attributes('aria-label')).toBe('Car')
  })

  it('shows a dash for every field the beacon left out', () => {
    const wrapper = mount(LandAprsStationAccordion, {
      props: {
        station: station({ altitude: null, course: null, speed: null, path: null, comment: null }),
      },
    })
    for (const label of ['ALTITUDE', 'COURSE', 'SPEED', 'PATH', 'COMMENT']) {
      expect(cellValue(wrapper, label)).toBe('—')
    }
  })

  it('hands the raw frame to the RAW disclosure', () => {
    const wrapper = mount(LandAprsStationAccordion, { props: { station: station() } })
    expect(wrapper.getComponent(LandStationRawFrame).props('raw')).toBe('M0ABC-9>APRS:!x')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(LandAprsStationAccordion, { props: { station: station() } })
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
