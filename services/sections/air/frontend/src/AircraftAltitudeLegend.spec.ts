import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AircraftAltitudeLegend from './AircraftAltitudeLegend.vue'

describe('AircraftAltitudeLegend', () => {
  const ticks = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('.altitude-legend-ticks li').map((tick) => tick.text())

  it('is titled ALT', () => {
    const wrapper = mount(AircraftAltitudeLegend, { props: { palette: 'dark' } })
    expect(wrapper.get('figcaption').text()).toBe('ALT')
  })

  it('marks the ground, thousands of feet, and the top of the ramp', () => {
    const wrapper = mount(AircraftAltitudeLegend, { props: { palette: 'dark' } })
    expect(ticks(wrapper)).toEqual(['0', '2k', '4k', '6k', '8k', '10k', '20k', '30k', '40k+'])
  })

  it('draws the bar in the map’s own colours', () => {
    const bar = (palette: 'dark' | 'light') =>
      mount(AircraftAltitudeLegend, { props: { palette } })
        .get('.altitude-legend-bar')
        .attributes('style')
    expect(bar('dark')).toContain('linear-gradient')
    expect(bar('dark')).not.toBe(bar('light'))
  })

  it.each([
    ['dark', 'rgb(26, 33, 48)'],
    ['light', 'rgb(39, 79, 96)'],
  ] as const)('sits on the same solid fill as the %s map’s airfield labels', (palette, fill) => {
    const wrapper = mount(AircraftAltitudeLegend, { props: { palette } })
    expect((wrapper.element as HTMLElement).style.background).toBe(fill)
  })

  it('spaces the gradient to match the evenly spaced labels', () => {
    const wrapper = mount(AircraftAltitudeLegend, { props: { palette: 'dark' } })
    const bar = wrapper.get('.altitude-legend-bar').attributes('style')
    expect(bar).toContain(' 0%')
    expect(bar).toContain(' 100%')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(AircraftAltitudeLegend, { props: { palette: 'dark' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
