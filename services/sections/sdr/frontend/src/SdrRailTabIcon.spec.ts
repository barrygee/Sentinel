import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRailTabIcon from './SdrRailTabIcon.vue'
import type { SdrTab } from './stores/sdr'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

const DRAWN_TABS: SdrTab[] = ['frequency-manager', 'search-ranges', 'groups', 'recordings']

describe('SdrRailTabIcon', () => {
  it('renders the shared radio icon for the RADIO tab', () => {
    const wrapper = mount(SdrRailTabIcon, { props: { tabId: 'radio' } })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it.each(DRAWN_TABS)('draws one hidden 19px glyph for the %s tab', (tabId) => {
    const wrapper = mount(SdrRailTabIcon, { props: { tabId } })
    const svgs = wrapper.findAll('svg')
    expect(svgs).toHaveLength(1)
    expect(svgs[0]!.attributes('aria-hidden')).toBe('true')
    expect(svgs[0]!.attributes('width')).toBe('19')
  })

  it('draws a different glyph for every tab', () => {
    const markup = (['radio', ...DRAWN_TABS] as SdrTab[]).map((tabId) =>
      mount(SdrRailTabIcon, { props: { tabId } }).html(),
    )
    expect(new Set(markup).size).toBe(markup.length)
  })

  it('renders nothing for an unknown tab id', () => {
    const wrapper = mount(SdrRailTabIcon, { props: { tabId: 'unknown' as SdrTab } })
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('has no axe violations inside a named button', async () => {
    const wrapper = mount(
      {
        components: { SdrRailTabIcon },
        template:
          '<button type="button" aria-label="GROUPS"><SdrRailTabIcon tab-id="groups" /></button>',
      },
      { attachTo: document.body },
    )
    expect(await axe(wrapper.html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
