import { describe, it, expect, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { registerAirSettings } from '@sentinel/section-air/settings'
import { registerSdrSettings } from '@sentinel/section-sdr/settings'
import { mountWithRouter } from '@/test/docsHarness'
import DocsGroupRail from './DocsGroupRail.vue'

// The Settings sections the rail offers come from the settings registry, as at boot.
registerAirSettings()
registerSdrSettings()

let pinia: Pinia

async function mountRail() {
  return mountWithRouter(DocsGroupRail, { plugins: [pinia] })
}

const settingsNav = '[aria-label="Settings sections"]'

describe('DocsGroupRail', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  describe('the Settings buttons', () => {
    it('shows the same section buttons as Settings, then Docs', async () => {
      const { wrapper } = await mountRail()
      const names = wrapper
        .get(settingsNav)
        .findAll('a')
        .map((link) => link.attributes('aria-label'))
      expect(names).toEqual(['App Settings', 'AIR', 'SDR', 'Docs (documentation)'])
    })

    it("links each section button to that section's settings, and Docs to the docs home", async () => {
      const { wrapper } = await mountRail()
      const hrefs = wrapper
        .get(settingsNav)
        .findAll('a')
        .map((link) => link.attributes('href'))
      expect(hrefs).toEqual(['/settings/app', '/settings/air', '/settings/sdr', '/doc/'])
    })

    it('marks Docs as the area on screen and no section button', async () => {
      const { wrapper } = await mountRail()
      const active = wrapper.get(settingsNav).findAll('a.ba-btn--active')
      expect(active).toHaveLength(1)
      expect(active[0]?.attributes('aria-label')).toBe('Docs (documentation)')
    })

    it('leaves out a section whose domain is switched off', async () => {
      useAppStore().enabledDomains = ['air']
      const { wrapper } = await mountRail()
      const names = wrapper
        .get(settingsNav)
        .findAll('a')
        .map((link) => link.attributes('aria-label'))
      expect(names).toEqual(['App Settings', 'AIR', 'Docs (documentation)'])
    })

    it("goes to a section's settings when its button is clicked", async () => {
      const { wrapper, router } = await mountRail()
      await wrapper.get(`${settingsNav} a[href="/settings/air"]`).trigger('click')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(router.currentRoute.value.path).toBe('/settings/air')
    })
  })

  it('holds nothing but the Settings buttons and Docs: no docs groups', async () => {
    const { wrapper } = await mountRail()
    expect(wrapper.findAll('nav').map((nav) => nav.attributes('aria-label'))).toEqual([
      'Settings sections',
    ])
    expect(wrapper.findAll('a')).toHaveLength(4)
  })

  it('draws a decorative icon in every button', async () => {
    const { wrapper } = await mountRail()
    expect(wrapper.findAll('a svg[aria-hidden="true"]')).toHaveLength(4)
  })

  it('goes to the docs home when Docs is clicked', async () => {
    const { wrapper, router } = await mountRail()
    await wrapper.get('a[href="/doc/"]').trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(router.currentRoute.value.path).toBe('/doc/')
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountRail()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
