import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { SectionDefinition } from '@sentinel/shell-api/shell/sectionRegistry'

const registerSection = vi.hoisted(() => vi.fn())
vi.mock('@sentinel/shell-api/shell/sectionRegistry', () => ({ registerSection }))
const registerGlobeSettings = vi.hoisted(() => vi.fn())
vi.mock('./settings', () => ({ registerGlobeSettings }))

/** Runs the section's `./register` entry on a fresh, active Pinia. */
async function registerOnHostPinia(): Promise<void> {
  const { default: register } = await import('./section')
  const pinia = createPinia()
  setActivePinia(pinia)
  register({ pinia })
}

/** The one definition `registerSection` was called with. */
function registeredDefinition(): SectionDefinition {
  expect(registerSection).toHaveBeenCalledTimes(1)
  return registerSection.mock.calls[0]![0] as SectionDefinition
}

describe('globe section registration', () => {
  beforeEach(() => {
    registerSection.mockReset()
    registerGlobeSettings.mockReset()
  })

  it('registers GLOBE after every other section, off until its setting turns it on', async () => {
    await registerOnHostPinia()

    expect(registeredDefinition()).toMatchObject({
      id: 'globe',
      label: 'GLOBE',
      navOrder: 60,
      enabledByDefault: false,
      route: { path: '/globe/' },
    })
  })

  it('routes to its view lazily, so the view is not part of the register entry', async () => {
    await registerOnHostPinia()
    const { component } = registeredDefinition().route
    const { default: GlobeView } = await import('./GlobeView.vue')

    expect(typeof component).toBe('function')
    const loaded = await (component as () => Promise<{ default: unknown }>)()
    expect(loaded.default).toBe(GlobeView)
  })

  it('adds its on/off switch to Settings', async () => {
    await registerOnHostPinia()

    expect(registerGlobeSettings).toHaveBeenCalledTimes(1)
  })

  it('refuses to register on a Pinia other than the shell’s', async () => {
    const { default: register } = await import('./section')
    setActivePinia(createPinia())

    expect(() => register({ pinia: createPinia() })).toThrow(
      'Section "globe" is not using the shell\'s Pinia',
    )
    expect(registerSection).not.toHaveBeenCalled()
    expect(registerGlobeSettings).not.toHaveBeenCalled()
  })
})
