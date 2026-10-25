import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  registerSettingsSection,
  resetSettingsRegistryForTests,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { SDR_MANAGER_SETTINGS_SECTION } from '@sentinel/shell-api/shell/sdrManagerSettingsSection'
import { createSdrManagerOnlyRouter } from './sdrManagerOnlyRouter'
import { SETTINGS_ROUTE_NAME, settingsReturn } from './settingsRoute'

const LANDING_PATH = '/settings/sdr-manager'

async function landOn(path: string, landingPath = LANDING_PATH): Promise<string> {
  const router = createSdrManagerOnlyRouter(landingPath)
  await router.push(path)
  return router.currentRoute.value.fullPath
}

describe('createSdrManagerOnlyRouter', () => {
  beforeEach(() => {
    resetSettingsRegistryForTests()
    registerSettingsSection({ key: 'app', label: 'App Settings', order: 0, domain: false })
    registerSettingsSection(SDR_MANAGER_SETTINGS_SECTION)
    window.history.replaceState(null, '', '/')
    settingsReturn.reset()
  })
  afterEach(() => {
    resetSettingsRegistryForTests()
    settingsReturn.reset()
  })

  it('has the Settings page and nothing else', () => {
    const routes = createSdrManagerOnlyRouter(LANDING_PATH).getRoutes()

    expect(routes.map((route) => route.name).filter(Boolean)).toEqual([SETTINGS_ROUTE_NAME])
  })

  it('opens / on the landing page', async () => {
    expect(await landOn('/')).toBe(LANDING_PATH)
  })

  it.each(['/air/', '/sdr/', '/docs/operations', '/no/such/page'])(
    'sends %s, which this mode has no page for, to the landing page',
    async (path) => {
      expect(await landOn(path)).toBe(LANDING_PATH)
    },
  )

  it.each(['/settings/app', '/settings/sdr-manager'])(
    'opens %s, a registered section',
    async (path) => {
      expect(await landOn(path)).toBe(path)
    },
  )

  it('sends a Settings section no remote registered to the landing page', async () => {
    expect(await landOn('/settings/air')).toBe(LANDING_PATH)
  })

  it('sends bare /settings/ (no section) to the landing page', async () => {
    expect(await landOn('/settings/')).toBe(LANDING_PATH)
  })

  it('still opens the landing page when its own section is not registered, rather than looping', async () => {
    resetSettingsRegistryForTests()

    expect(await landOn('/', LANDING_PATH)).toBe(LANDING_PATH)
  })

  it('closes Settings back to the landing page, since Settings is the whole app here', () => {
    settingsReturn.path = '/air/'

    createSdrManagerOnlyRouter(LANDING_PATH)

    expect(settingsReturn.path).toBe(LANDING_PATH)
  })
})
