import { describe, it, expect, vi } from 'vitest'

// Same coverage-merge reasoning as SettingsPanel.spec: these two own large
// sub-trees covered by their own specs, so stand-ins keep a second,
// differently-offset coverage record out of this worker.
vi.mock('./ExportAllControl.vue', () => ({ default: { name: 'ExportAllControl' } }))
vi.mock('./offline-maps/OfflineMapsSettings.vue', () => ({
  default: { name: 'OfflineMapsSettings' },
}))

import type { SettingControl } from '@sentinel/shell-api/types/settings'
import { getSettingItems, getSettingsSections } from '@sentinel/shell-api/shell/settingsRegistry'
import './appSettings'
import '@/components/air/settings'
import '@/components/space/settings'
import '@/components/sea/settings'
import '@/components/land/settings'
import '@/components/sdr/settings'
import AdsbSdrSourceControl from '@/components/air/settings/AdsbSdrSourceControl.vue'
import AdsbTagFieldsControl from '@/components/air/settings/AdsbTagFieldsControl.vue'
import AprsLabelFieldsControl from '@/components/land/settings/AprsLabelFieldsControl.vue'
import AprsSdrSourceControl from '@/components/land/settings/AprsSdrSourceControl.vue'
import ConfigCurrentControl from './ConfigCurrentControl.vue'
import ConnectivityToggle from './ConnectivityToggle.vue'
import ExportAllControl from './ExportAllControl.vue'
import JsonDataControl from '@sentinel/shell-api/settings/JsonDataControl.vue'
import LandAprsChannelControl from '@/components/land/settings/LandAprsChannelControl.vue'
import LandAprsRetentionControl from '@/components/land/settings/LandAprsRetentionControl.vue'
import LocationControl from './LocationControl.vue'
import MapBasemapLayersControl from './MapBasemapLayersControl.vue'
import MapLayersControl from '@/components/air/settings/MapLayersControl.vue'
import MapThemeControl from './MapThemeControl.vue'
import NotificationSoundControl from './NotificationSoundControl.vue'
import NotificationSubscriptionsControl from './NotificationSubscriptionsControl.vue'
import OfflineMapsSettings from './offline-maps/OfflineMapsSettings.vue'
import OnlineSourceControl from '@sentinel/shell-api/settings/OnlineSourceControl.vue'
import OverheadAlertsControl from '@/components/air/settings/OverheadAlertsControl.vue'
import RangeRingOriginControl from './RangeRingOriginControl.vue'
import RepeaterLabelFieldsControl from '@/components/land/settings/RepeaterLabelFieldsControl.vue'
import SdrDevicesControl from '@/components/sdr/settings/SdrDevicesControl.vue'
import SdrOptionsControl from '@/components/sdr/settings/SdrOptionsControl.vue'
import SeaAisKeyControl from '@/components/sea/settings/SeaAisKeyControl.vue'
import SeaAisSdrSourceControl from '@/components/sea/settings/SeaAisSdrSourceControl.vue'
import SeaCoverageAreaControl from '@/components/sea/settings/SeaCoverageAreaControl.vue'
import SeaLabelFieldsControl from '@/components/sea/settings/SeaLabelFieldsControl.vue'
import SeaMapLayersControl from '@/components/sea/settings/SeaMapLayersControl.vue'
import SentryHostsControl from '@/components/sdr/settings/SentryHostsControl.vue'
import SourceOverrideControl from '@sentinel/shell-api/settings/SourceOverrideControl.vue'
import SpaceHoverPreviewControl from '@/components/space/settings/SpaceHoverPreviewControl.vue'
import SpaceTleDatabaseControl from '@/components/space/settings/SpaceTleDatabaseControl.vue'
import SpaceTleManualControl from '@/components/space/settings/SpaceTleManualControl.vue'
import SpaceTleOnlineControl from '@/components/space/settings/SpaceTleOnlineControl.vue'

/**
 * The full Settings catalogue as the sections register it (F3). This pins
 * which control edits each setting, with which props, which panel events it
 * uses and its card layout — what `SettingRow`'s type dispatch and layout
 * sets used to decide — so moving a setting between modules can't silently
 * change how it is edited.
 */
const EXPECTED: Array<[section: string, id: string, control: SettingControl]> = [
  ['app', 'connectivity-mode', { component: ConnectivityToggle, emits: ['stage'] }],
  ['app', 'notification-sound', { component: NotificationSoundControl, emits: ['stage'] }],
  [
    'app',
    'notification-subscriptions',
    { component: NotificationSubscriptionsControl, emits: ['stage'] },
  ],
  [
    'app',
    'location',
    { component: LocationControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  ['app', 'map-theme', { component: MapThemeControl, emits: ['stage'] }],
  [
    'app',
    'map-basemap-layers',
    { component: MapBasemapLayersControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  [
    'app',
    'range-ring-origin',
    { component: RangeRingOriginControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  ['app', 'offline-maps', { component: OfflineMapsSettings, layout: 'full', naturalHeight: true }],
  ['app', 'config-current', { component: ConfigCurrentControl, emits: ['stage'], layout: 'full' }],
  ['app', 'export-all', { component: ExportAllControl }],
  [
    'air',
    'air-source-override',
    { component: SourceOverrideControl, props: { ns: 'air' }, emits: ['stage'] },
  ],
  ['air', 'air-offgrid-sdr-source', { component: AdsbSdrSourceControl, emits: ['stage'] }],
  [
    'air',
    'air-online-source',
    {
      component: OnlineSourceControl,
      props: { ns: 'air', defaultUrl: 'https://api.adsb.lol/v2' },
      emits: ['stage', 'commit'],
    },
  ],
  [
    'air',
    'map-layers',
    { component: MapLayersControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  [
    'air',
    'air-overhead-alerts',
    { component: OverheadAlertsControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  ['air', 'air-tag-fields', { component: AdsbTagFieldsControl, emits: ['stage'], layout: 'half' }],
  ['space', 'space-online-source', { component: SpaceTleOnlineControl, layout: 'half' }],
  ['space', 'space-manual-tle', { component: SpaceTleManualControl, layout: 'half' }],
  ['space', 'space-tle-database', { component: SpaceTleDatabaseControl, layout: 'half' }],
  [
    'space',
    'space-sat-radio-file',
    {
      component: JsonDataControl,
      props: {
        getUrl: '/api/space/radio/file',
        postUrl: '/api/space/radio/file',
        filename: 'satellite_radio.json',
      },
      emits: ['stage'],
      layout: 'full',
    },
  ],
  [
    'space',
    'space-filter-hover-preview',
    { component: SpaceHoverPreviewControl, emits: ['stage'], layout: 'half' },
  ],
  [
    'sea',
    'sea-source-override',
    { component: SourceOverrideControl, props: { ns: 'sea' }, emits: ['stage'] },
  ],
  ['sea', 'sea-ais-sdr-source', { component: SeaAisSdrSourceControl, emits: ['stage'] }],
  [
    'sea',
    'sea-online-source',
    {
      component: OnlineSourceControl,
      props: { ns: 'sea', defaultUrl: 'wss://stream.aisstream.io/v0/stream' },
      emits: ['stage', 'commit'],
    },
  ],
  [
    'sea',
    'sea-ais-key',
    {
      component: SeaAisKeyControl,
      emits: ['stage', 'commit'],
      layout: 'half',
      naturalHeight: true,
    },
  ],
  [
    'sea',
    'sea-coverage-area',
    { component: SeaCoverageAreaControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  [
    'sea',
    'sea-map-layers',
    { component: SeaMapLayersControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  ],
  [
    'sea',
    'sea-label-fields',
    { component: SeaLabelFieldsControl, emits: ['stage'], layout: 'half' },
  ],
  ['land', 'land-aprs-sdr-source', { component: AprsSdrSourceControl, emits: ['stage'] }],
  ['land', 'land-aprs-channel', { component: LandAprsChannelControl, emits: ['stage', 'commit'] }],
  [
    'land',
    'land-aprs-label-fields',
    { component: AprsLabelFieldsControl, emits: ['stage'], layout: 'half' },
  ],
  [
    'land',
    'land-aprs-retention',
    { component: LandAprsRetentionControl, emits: ['stage', 'commit'] },
  ],
  [
    'land',
    'land-repeater-label-fields',
    { component: RepeaterLabelFieldsControl, emits: ['stage'], layout: 'half' },
  ],
  [
    'land',
    'land-repeaters-file',
    {
      component: JsonDataControl,
      props: {
        getUrl: '/api/land/repeaters/file',
        postUrl: '/api/land/repeaters/file',
        filename: 'uk_repeaters.json',
      },
      emits: ['stage'],
      layout: 'full',
    },
  ],
  ['sdr', 'sdr-sentry-hosts', { component: SentryHostsControl, layout: 'half' }],
  ['sdr', 'sdr-devices', { component: SdrDevicesControl, layout: 'half' }],
  [
    'sdr',
    'sdr-options',
    { component: SdrOptionsControl, emits: ['stage', 'commit'], layout: 'half' },
  ],
  [
    'sdr',
    'sdr-frequencies-file',
    {
      component: JsonDataControl,
      props: {
        getUrl: '/api/sdr/data/frequencies',
        postUrl: '/api/sdr/data/frequencies',
        filename: 'sdr_frequencies.json',
      },
      emits: ['stage'],
      layout: 'half-stacked',
    },
  ],
  [
    'sdr',
    'sdr-bandplan-file',
    {
      component: JsonDataControl,
      props: {
        getUrl: '/api/sdr/data/bandplan',
        postUrl: '/api/sdr/data/bandplan',
        filename: 'sdr_bandplan.json',
      },
      emits: ['stage'],
      layout: 'half-stacked',
    },
  ],
]

describe('Settings catalogue', () => {
  it('offers the core section then every domain section, in nav order', () => {
    expect(getSettingsSections()).toEqual([
      { key: 'app', label: 'App Settings', order: 0, domain: false },
      { key: 'air', label: 'AIR', order: 10, domain: true },
      { key: 'space', label: 'SPACE', order: 20, domain: true },
      { key: 'sea', label: 'SEA', order: 30, domain: true },
      { key: 'land', label: 'LAND', order: 40, domain: true },
      { key: 'sdr', label: 'SDR', order: 50, domain: true },
    ])
  })

  it('lists every setting, section by section, in order', () => {
    expect(getSettingItems().map((item) => [item.section, item.id])).toEqual(
      EXPECTED.map(([section, id]) => [section, id]),
    )
  })

  it.each(EXPECTED)('%s / %s is edited by the right control', (_section, id, control) => {
    const item = getSettingItems().find((candidate) => candidate.id === id)!
    expect(item.control).toEqual(control)
  })

  it('labels every item with its section’s nav label', () => {
    const labels = new Map(getSettingsSections().map((section) => [section.key, section.label]))
    for (const item of getSettingItems()) expect(item.sectionLabel).toBe(labels.get(item.section))
  })
})
