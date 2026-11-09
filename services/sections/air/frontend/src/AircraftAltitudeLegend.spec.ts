import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AircraftAltitudeLegend from './AircraftAltitudeLegend.vue'

describe('AircraftAltitudeLegend', () => {
  const ticks = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('.altitude-legend-ticks li').map((tick) => tick.text())

  it('names the bar for assistive tech, with no visible title', () => {
    const wrapper = mount(AircraftAltitudeLegend, { props: { palette: 'dark' } })
    expect(wrapper.find('figcaption').exists()).toBe(false)
    expect(wrapper.attributes('aria-label')).toBe('Aircraft altitude, in feet')
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

  it('hands the footer groups’ measured widths to its stylesheet', async () => {
    const addCluster = (id: string, left: number, right: number) => {
      const cluster = document.createElement('div')
      cluster.id = id
      cluster.getBoundingClientRect = () => ({ left, right }) as DOMRect
      document.body.appendChild(cluster)
    }
    addCluster('footer-left', 0, 44)
    addCluster('footer-right', window.innerWidth - 150, window.innerWidth)
    try {
      const wrapper = mount(AircraftAltitudeLegend, { props: { palette: 'dark' } })
      // Measured once mounted, so the style catches up on the next render.
      await nextTick()
      const style = (wrapper.element as HTMLElement).style
      expect(style.getPropertyValue('--altitude-legend-footer-left')).toBe('44px')
      expect(style.getPropertyValue('--altitude-legend-footer-right')).toBe('150px')
      wrapper.unmount()
    } finally {
      document.body.innerHTML = ''
    }
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
