import { describe, it, expect, beforeEach } from 'vitest'
import { axe } from 'jest-axe'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { useAppStore } from '@sentinel/shell-api/stores/app'
import { registerAirSettings } from '@sentinel/section-air/settings'
import { registerSdrSettings } from '@sentinel/section-sdr/settings'
import { mountWithRouter } from '@/test/docsHarness'
import { buildFixtureDocsLibrary } from '@/test/docsFixtures'
import DocsGroupRail from './DocsGroupRail.vue'

// The Settings sections the rail offers come from the settings registry, as at boot.
registerAirSettings()
registerSdrSettings()

const library = buildFixtureDocsLibrary()
let pinia: Pinia

async function mountRail(activeGroupKey?: 'sdr') {
  return mountWithRouter(DocsGroupRail, {
    props: { groups: library.groups, activeGroupKey },
    plugins: [pinia],
  })
}

const settingsNav = '[aria-label="Settings sections"]'
const groupsNav = '[aria-label="Documentation sections"]'

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

  describe("Docs' sub-buttons", () => {
    it('lists one sub-button per docs group, in their own landmark under Docs', async () => {
      const { wrapper } = await mountRail()
      const groups = wrapper.get(groupsNav)
      expect(groups.element.tagName).toBe('NAV')
      expect(groups.findAll('li')).toHaveLength(3)
      // After the Settings buttons, so the groups read as children of Docs.
      const navs = wrapper.findAll('nav').map((nav) => nav.attributes('aria-label'))
      expect(navs).toEqual(['Settings sections', 'Documentation sections'])
    })

    it('names each sub-button after its group, because it holds only an icon', async () => {
      const { wrapper } = await mountRail()
      const names = wrapper
        .get(groupsNav)
        .findAll('a')
        .map((link) => link.attributes('aria-label'))
      expect(names).toEqual(['Get started', 'Use Sentinel', 'Develop'])
    })

    it("makes each sub-button a real link to its group's first page", async () => {
      const { wrapper } = await mountRail()
      const hrefs = wrapper
        .get(groupsNav)
        .findAll('a')
        .map((link) => link.attributes('href'))
      expect(hrefs).toEqual(['/doc/', '/doc/sections', '/doc/contributing'])
      expect(wrapper.find('button').exists()).toBe(false)
    })

    it('marks only the active group as current', async () => {
      const { wrapper } = await mountRail('sdr')
      const current = wrapper.findAll('a[aria-current="true"]')
      expect(current).toHaveLength(1)
      expect(current[0]?.attributes('aria-label')).toBe('Use Sentinel')
      expect(current[0]?.classes()).toContain('ba-btn--active')
      expect(wrapper.get(groupsNav).findAll('a.ba-btn--active')).toHaveLength(1)
    })

    it('marks no group as current when none is active (page not found)', async () => {
      const { wrapper } = await mountRail()
      expect(wrapper.findAll('[aria-current]')).toHaveLength(0)
    })

    it('shows a tooltip with the group title', async () => {
      const { wrapper } = await mountRail()
      const tooltips = wrapper
        .get(groupsNav)
        .findAll('a')
        .map((link) => link.attributes('data-tooltip'))
      expect(tooltips).toEqual(['Get started', 'Use Sentinel', 'Develop'])
    })

    it('draws a decorative icon in every button', async () => {
      const { wrapper } = await mountRail()
      expect(wrapper.findAll('a')).toHaveLength(7)
      expect(wrapper.findAll('a svg[aria-hidden="true"]')).toHaveLength(7)
    })

    it('navigates in the app when a sub-button is clicked', async () => {
      const { wrapper, router } = await mountRail()
      await wrapper.get(groupsNav).findAll('a')[1]?.trigger('click')
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(router.currentRoute.value.path).toBe('/doc/sections')
    })

    it('falls back to /doc/ for a group without pages', async () => {
      const { wrapper } = await mountWithRouter(DocsGroupRail, {
        props: { groups: [{ key: 'set-up-and-run', title: 'Reference', entries: [], pages: [] }] },
        plugins: [pinia],
      })
      expect(wrapper.get(`${groupsNav} a`).attributes('href')).toBe('/doc/')
    })
  })

  it('has no accessibility violations', async () => {
    const { wrapper } = await mountRail('sdr')
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
