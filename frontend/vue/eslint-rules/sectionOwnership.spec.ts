import { describe, it, expect } from 'vitest'
import { COMPOSITION_ROOTS, ownerOf } from './sectionOwnership'

describe('ownerOf', () => {
  it.each([
    ['components/air/AirView', 'air'],
    ['components/space/settings/SpaceTleOnlineControl', 'space'],
    ['components/sea/section', 'sea'],
    ['components/land/LandFilter', 'land'],
    ['components/sdr/SdrPanel', 'sdr'],
  ] as const)('gives %s to its section folder (%s)', (srcPath, section) => {
    expect(ownerOf(srcPath)).toBe(section)
  })

  it.each([
    ['stores/air', 'air'],
    ['stores/airNotif', 'air'],
    ['composables/useOverheadAlertZones', 'air'],
    ['services/adsbSourceApi', 'air'],
    ['utils/satelliteUtils', 'space'],
    ['composables/useOffgridAisDecode', 'sea'],
    ['utils/marineVhf', 'sea'],
    ['stores/repeaters', 'land'],
    ['composables/useSdrAudio', 'sdr'],
    ['services/sentryApi', 'sdr'],
  ] as const)('gives the flat-folder file %s to %s', (srcPath, section) => {
    expect(ownerOf(srcPath)).toBe(section)
  })

  it.each([
    'components/shared/AppFooter',
    'components/base/BaseToggleSetting',
    'shell/sections',
    'stores/notifications',
    'stores/sentrySites',
    'utils/aprsSymbols',
    'composables/useSdram',
    'main',
  ])('treats %s as core', (srcPath) => {
    expect(ownerOf(srcPath)).toBe('core')
  })

  it('matches whole names, not prefixes, for flat-folder files', () => {
    // stores/air must not swallow a core store whose name merely starts with "air".
    expect(ownerOf('stores/airport')).toBe('core')
  })

  it('names the composition root', () => {
    expect(COMPOSITION_ROOTS).toEqual(['shell/sections'])
  })
})
