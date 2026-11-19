import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSignalMeter from './SdrSignalMeter.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountMeter(
  props: { segmentCount?: number; litSegments?: number; audible?: boolean } = {},
) {
  return mount(SdrSignalMeter, {
    props: {
      segmentCount: props.segmentCount ?? 10,
      litSegments: props.litSegments ?? 0,
      audible: props.audible ?? true,
    },
    attachTo: document.body,
  })
}

describe('SdrSignalMeter', () => {
  it('draws one segment per segmentCount', () => {
    expect(mountMeter({ segmentCount: 36 }).findAll('.sdr-signal-seg')).toHaveLength(36)
  })

  it('lights exactly the first litSegments segments', () => {
    const segments = mountMeter({ segmentCount: 10, litSegments: 4 }).findAll('.sdr-signal-seg')
    const litFlags = segments.map((segment) => segment.classes('sdr-signal-seg--on'))
    expect(litFlags).toEqual([true, true, true, true, false, false, false, false, false, false])
  })

  it('lights nothing at zero and everything at the full count', () => {
    expect(mountMeter({ litSegments: 0 }).findAll('.sdr-signal-seg--on')).toHaveLength(0)
    expect(
      mountMeter({ segmentCount: 10, litSegments: 10 }).findAll('.sdr-signal-seg--on'),
    ).toHaveLength(10)
  })

  it('mutes the meter only when the audio is not audible', () => {
    expect(mountMeter({ audible: true }).find('.sdr-signal-segments').classes()).not.toContain(
      'sdr-signal-segments--muted',
    )
    expect(mountMeter({ audible: false }).find('.sdr-signal-segments').classes()).toContain(
      'sdr-signal-segments--muted',
    )
  })

  it('shows the SIGNAL label', () => {
    expect(mountMeter().find('.sdr-field-label').text()).toBe('SIGNAL')
  })

  it('has no axe violations', async () => {
    expect(await axe(mountMeter({ litSegments: 5 }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
