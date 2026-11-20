import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatTelemetryGrids from './SatTelemetryGrids.vue'

// The grids are mounted on their own, outside the page landmarks their hosts sit in.
const NO_REGION_RULE = { rules: { region: { enabled: false } } }

function grids(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.ba-data-grid-section').map((grid) => ({
    title: grid.get('.ba-data-grid-title').text(),
    cells: grid
      .findAll('.ba-data-cell')
      .map((cell) => [
        cell.get('.ba-data-cell-label').text(),
        cell.get('.ba-data-cell-value').text(),
      ]),
  }))
}

describe('SatTelemetryGrids', () => {
  it('shows a dash in every field before the first update', () => {
    const wrapper = mount(SatTelemetryGrids, { props: { telemetry: {} } })
    expect(grids(wrapper)).toEqual([
      {
        title: 'POSITION DATA',
        cells: [
          ['LATITUDE', '—'],
          ['LONGITUDE', '—'],
          ['HEADING', '—'],
        ],
      },
      {
        title: 'ORBITAL DATA',
        cells: [
          ['ALTITUDE', '—'],
          ['VELOCITY', '—'],
        ],
      },
    ])
  })

  it('shows each live field in its cell, and updates', async () => {
    const wrapper = mount(SatTelemetryGrids, {
      props: { telemetry: { lat: '54.9°', lon: '-1.6°', hdg: '51°' } },
    })
    await wrapper.setProps({
      telemetry: { lat: '55°', lon: '-1.5°', hdg: '52°', alt: '418 km', vel: '7.66 km/s' },
    })
    expect(grids(wrapper).flatMap((grid) => grid.cells)).toEqual([
      ['LATITUDE', '55°'],
      ['LONGITUDE', '-1.5°'],
      ['HEADING', '52°'],
      ['ALTITUDE', '418 km'],
      ['VELOCITY', '7.66 km/s'],
    ])
  })

  it('has no axe violations', async () => {
    const wrapper = mount(SatTelemetryGrids, {
      props: { telemetry: { lat: '54.9°', alt: '418 km' } },
      attachTo: document.body,
    })
    expect(await axe(document.body, NO_REGION_RULE)).toHaveNoViolations()
    wrapper.unmount()
  })
})
