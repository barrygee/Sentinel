import { defineComponent, h } from 'vue'

/**
 * Stand-in section routes and Settings sections for the router specs, so they
 * exercise the real vue-router without loading the real section views (maps).
 * Each view is lazy, like a real section's, and records when it was loaded.
 */
export const loadedViews: string[] = []

function lazyView(domain: string) {
  return () => {
    loadedViews.push(domain)
    return Promise.resolve(
      defineComponent({
        name: `${domain}-view`,
        setup: () => () => h('div', { class: `${domain}-view` }),
      }),
    )
  }
}

export const FIXTURE_SECTION_ROUTES = ['air', 'space', 'sdr'].map((domain) => ({
  path: `/${domain}/`,
  component: lazyView(domain),
  meta: { domain },
}))

export const FIXTURE_SETTINGS_SECTIONS = [
  { key: 'app', label: 'App Settings', order: 0, domain: false },
  { key: 'air', label: 'AIR', order: 10, domain: true },
  { key: 'space', label: 'SPACE', order: 20, domain: true },
  { key: 'sdr', label: 'SDR', order: 50, domain: true },
]
