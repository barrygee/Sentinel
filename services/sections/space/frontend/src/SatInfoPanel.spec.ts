import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SatInfoPanel from './SatInfoPanel.vue'

enableAutoUnmount(afterEach)

function mountPanel() {
  // satelliteControl is an inert prop here; null exercises the typed-null path.
  return mount(SatInfoPanel, { props: { satelliteControl: null } })
}

describe('SatInfoPanel iss-position rebroadcast', () => {
  let received: Array<{ noradId: string; position: Record<string, number> }>
  const capture = (event: Event) => {
    received.push((event as CustomEvent).detail)
  }

  beforeEach(() => {
    received = []
    document.addEventListener('sat-position-update', capture)
  })

  afterEach(() => {
    document.removeEventListener('sat-position-update', capture)
  })

  it('re-emits an iss-position-update as a sat-position-update split into id + position', () => {
    mountPanel()
    document.dispatchEvent(
      new CustomEvent('iss-position-update', {
        detail: {
          noradId: '25544',
          alt_km: 420,
          velocity_kms: 7.66,
          track_deg: 51,
          lat: 10,
          lon: 20,
        },
      }),
    )

    expect(received).toEqual([
      {
        noradId: '25544',
        position: { alt_km: 420, velocity_kms: 7.66, track_deg: 51, lat: 10, lon: 20 },
      },
    ])
  })

  it('stops rebroadcasting after the component unmounts', () => {
    const wrapper = mountPanel()
    wrapper.unmount()
    document.dispatchEvent(
      new CustomEvent('iss-position-update', {
        detail: { noradId: '1', alt_km: 0, velocity_kms: 0, track_deg: 0, lat: 0, lon: 0 },
      }),
    )
    expect(received).toHaveLength(0)
  })
})

describe('SatInfoPanel accessibility', () => {
  it('renders the hidden compatibility container without axe violations', async () => {
    const wrapper = mountPanel()
    expect(wrapper.find('#sat-info-panel').exists()).toBe(true)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
