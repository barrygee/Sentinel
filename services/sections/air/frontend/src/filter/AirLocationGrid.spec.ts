import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AirLocationGrid from './AirLocationGrid.vue'

const cells = (wrapper: ReturnType<typeof mount>) =>
  wrapper
    .findAll('.ba-data-cell')
    .map((cell) => [cell.get('.ba-data-cell-label').text(), cell.get('.ba-data-cell-value').text()])

describe('AirLocationGrid', () => {
  it('titles the grid LOCATION and reads coords as [longitude, latitude]', () => {
    const wrapper = mount(AirLocationGrid, { props: { coords: [-0.4543, 51.47] } })
    expect(wrapper.get('.ba-data-grid-title').text()).toBe('LOCATION')
    expect(cells(wrapper)).toEqual([
      ['LATITUDE', '51.4700°N'],
      ['LONGITUDE', '0.4543°W'],
    ])
  })

  it('updates when the place changes', async () => {
    const wrapper = mount(AirLocationGrid, { props: { coords: [0, 0] } })
    await wrapper.setProps({ coords: [151.2, -33.9] })
    expect(cells(wrapper)).toEqual([
      ['LATITUDE', '33.9000°S'],
      ['LONGITUDE', '151.2000°E'],
    ])
  })

  it('has no axe violations', async () => {
    const wrapper = mount(AirLocationGrid, { props: { coords: [-1.7, 55.1] } })
    expect(
      await axe(wrapper.element, { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
