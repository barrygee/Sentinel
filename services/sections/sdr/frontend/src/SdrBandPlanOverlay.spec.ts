import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrBandPlanOverlay, { type VisibleBand } from './SdrBandPlanOverlay.vue'

enableAutoUnmount(afterEach)

const BANDS: VisibleBand[] = [
  { key: 'mw', name: 'Medium Wave', label: 'MW', leftPct: 10, widthPct: 25.5 },
  { key: 'tiny', name: 'Tiny Allocation', label: '', leftPct: 60, widthPct: 1 },
]

function mountOverlay(bands: VisibleBand[] = BANDS) {
  return mount(SdrBandPlanOverlay, {
    props: { bands, overlayStyle: { left: '56px', right: '12px', bottom: '30px' } },
    attachTo: document.body,
  })
}

describe('SdrBandPlanOverlay', () => {
  it('insets itself to the data box', () => {
    const style = mountOverlay().find('.sdr-wf-band-overlay').attributes('style')
    expect(style).toContain('left: 56px')
    expect(style).toContain('right: 12px')
    expect(style).toContain('bottom: 30px')
  })

  it('draws one box per band, positioned and sized by percentage', () => {
    const bands = mountOverlay().findAll('.sdr-wf-band')
    expect(bands).toHaveLength(2)
    expect(bands[0]!.attributes('style')).toContain('left: 10%')
    expect(bands[0]!.attributes('style')).toContain('width: 25.5%')
    expect(bands[1]!.attributes('style')).toContain('left: 60%')
  })

  it('titles each box with the full name and shows the label only when it fits', () => {
    const bands = mountOverlay().findAll('.sdr-wf-band')
    expect(bands[0]!.attributes('title')).toBe('Medium Wave')
    expect(bands[0]!.find('span').text()).toBe('MW')
    expect(bands[1]!.attributes('title')).toBe('Tiny Allocation')
    expect(bands[1]!.find('span').exists()).toBe(false)
  })

  it('renders an empty strip when no band is in view', () => {
    const wrapper = mountOverlay([])
    expect(wrapper.find('.sdr-wf-band-overlay').exists()).toBe(true)
    expect(wrapper.findAll('.sdr-wf-band')).toHaveLength(0)
  })

  it('has no axe violations', async () => {
    const wrapper = mountOverlay()
    expect(await axe(wrapper.element as HTMLElement)).toHaveNoViolations()
  })
})
