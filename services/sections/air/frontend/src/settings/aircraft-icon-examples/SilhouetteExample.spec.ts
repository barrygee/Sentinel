import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SilhouetteExample from './SilhouetteExample.vue'
import {
  SILHOUETTE_COLOURS,
  silhouetteForShape,
  silhouetteIconSizePx,
} from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'

describe('SilhouetteExample', () => {
  it('draws the type at the size the map draws it', () => {
    const wrapper = mount(SilhouetteExample, { props: { shapeKey: 'type:A320' } })
    const svg = wrapper.find('svg')
    const sizePx = String(silhouetteIconSizePx('type:A320'))
    expect(svg.attributes('width')).toBe(sizePx)
    expect(svg.attributes('height')).toBe(sizePx)
  })

  it('draws the black outline under the body in the civil colour', () => {
    const wrapper = mount(SilhouetteExample, { props: { shapeKey: 'type:A320' } })
    const [outline, body] = wrapper.findAll('path')
    const pathData = silhouetteForShape('type:A320')!.pathData
    expect(outline!.attributes()).toMatchObject({ d: pathData, fill: '#000000', stroke: '#000000' })
    expect(body!.attributes()).toMatchObject({ d: pathData, fill: SILHOUETTE_COLOURS.civil })
  })

  it('turns the aircraft to its track', () => {
    const wrapper = mount(SilhouetteExample, { props: { shapeKey: 'type:A320', trackDeg: 60 } })
    expect(wrapper.find('g').attributes('transform')).toBe('rotate(60)')
  })

  it('points north when given no track', () => {
    const wrapper = mount(SilhouetteExample, { props: { shapeKey: 'type:A320' } })
    expect(wrapper.find('g').attributes('transform')).toBe('rotate(0)')
  })

  it('writes the callsign as plain text, as the map shows it on hover', () => {
    const wrapper = mount(SilhouetteExample, {
      props: { shapeKey: 'type:A320', callsign: 'BAW123' },
    })
    const callsign = wrapper.find('.silhouette-example-callsign')
    expect(callsign.text()).toBe('BAW123')
    expect(callsign.attributes('style')).not.toContain('text-shadow')
    // The map's silhouette-mode tag size, smaller than an arrow label's 14px.
    expect(callsign.attributes('style')).toContain('font-size: 12px')
  })

  it('puts the text on the left of an aircraft heading right, as the map does', () => {
    const wrapper = mount(SilhouetteExample, {
      props: { shapeKey: 'type:A320', trackDeg: 60, callsign: 'BAW123' },
    })
    expect(wrapper.classes()).toContain('silhouette-example--text-left')
  })

  it('puts the text on the right of an aircraft heading left', () => {
    const wrapper = mount(SilhouetteExample, {
      props: { shapeKey: 'type:A320', trackDeg: 270, callsign: 'BAW123' },
    })
    expect(wrapper.classes()).not.toContain('silhouette-example--text-left')
  })

  it('shows no text for an aircraft that is not hovered', () => {
    const wrapper = mount(SilhouetteExample, { props: { shapeKey: 'type:C172' } })
    expect(wrapper.find('.silhouette-example-callsign').exists()).toBe(false)
  })

  it('draws nothing for a shape it does not know', () => {
    const wrapper = mount(SilhouetteExample, { props: { shapeKey: 'type:NOPE' } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(SilhouetteExample, {
      props: { shapeKey: 'type:A320', callsign: 'BAW123' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
