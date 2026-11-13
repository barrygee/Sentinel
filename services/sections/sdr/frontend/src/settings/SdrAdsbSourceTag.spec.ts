import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrAdsbSourceTag from './SdrAdsbSourceTag.vue'

describe('SdrAdsbSourceTag', () => {
  it('says the SDR is the ADS-B decoder’s, and where to pick another', () => {
    const tag = mount(SdrAdsbSourceTag).get('span')

    expect(tag.text()).toContain('ADS-B DECODER')
    expect(tag.attributes('title')).toContain('in use by the ADS-B decoder')
    expect(tag.attributes('title')).toContain('Settings › AIR')
  })

  it('gives a screen reader the same why, not just the title', () => {
    const why = mount(SdrAdsbSourceTag).get('.sdr-adsb-source-why')
    expect(why.text()).toContain('Pick another Off Grid ADS-B SDR in Settings › AIR')
  })

  it('has no accessibility violations', async () => {
    // `region` off, as in the other row specs: a lone row fragment sits in no
    // landmark here, but always inside the settings page's in the app.
    expect(
      await axe(mount(SdrAdsbSourceTag).html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
