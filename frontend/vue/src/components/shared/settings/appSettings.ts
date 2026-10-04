import { registerSettingItems, registerSettingsSection } from '@/shell/settingsRegistry'
import ConfigCurrentControl from './ConfigCurrentControl.vue'
import ConnectivityToggle from './ConnectivityToggle.vue'
import ExportAllControl from './ExportAllControl.vue'
import LocationControl from './LocationControl.vue'
import MapBasemapLayersControl from './MapBasemapLayersControl.vue'
import MapThemeControl from './MapThemeControl.vue'
import NotificationSoundControl from './NotificationSoundControl.vue'
import NotificationSubscriptionsControl from './NotificationSubscriptionsControl.vue'
import OfflineMapsSettings from './offline-maps/OfflineMapsSettings.vue'
import RangeRingOriginControl from './RangeRingOriginControl.vue'

/**
 * Core's own Settings section (F3): general, alerts, location, map, offline maps and the configuration file. Registered by core, like every section registers its own.
 */
registerSettingsSection({ key: 'app', label: 'App Settings', order: 0, domain: false })

registerSettingItems([
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'connectivity-mode',
    label: 'Connectivity Mode',
    desc: 'Sets every section to this mode, replacing any section overrides',
    control: { component: ConnectivityToggle, emits: ['stage'] },
    groupLabel: 'GENERAL',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'notification-sound',
    label: 'Alert Sound',
    desc: '',
    control: { component: NotificationSoundControl, emits: ['stage'] },
    groupLabel: 'ALERTS',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'notification-subscriptions',
    label: 'Alerts',
    // The description is rendered by the control itself, so it can hide with the list.
    desc: '',
    searchTerms:
      'notifications alerts bell aircraft landing departure satellite pass overhead clear cancel turn off disable',
    control: { component: NotificationSubscriptionsControl, emits: ['stage'] },
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'location',
    label: 'Sentinel Location',
    desc: '',
    // Keeps the setting findable by the words the removed description carried.
    searchTerms: 'fixed latitude longitude position',
    control: { component: LocationControl, emits: ['stage'], layout: 'half', naturalHeight: true },
    groupLabel: 'LOCATION',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'map-theme',
    label: 'Map Style',
    desc: '',
    searchTerms:
      'theme light dark colour color mode palette appearance basemap map style cartographic',
    control: { component: MapThemeControl, emits: ['stage'] },
    groupLabel: 'MAP',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'map-basemap-layers',
    label: 'Map Layers',
    desc: '',
    searchTerms:
      'roads streets motorways highways location place city town names labels borders boundaries countries show hide map layers',
    control: {
      component: MapBasemapLayersControl,
      emits: ['stage'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'MAP',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'range-ring-origin',
    label: 'Range Ring Origin',
    desc: 'The point on the map range rings are drawn',
    searchTerms: 'range rings sentry centre center origin',
    control: {
      component: RangeRingOriginControl,
      emits: ['stage'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'MAP',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'offline-maps',
    label: 'Offline Maps',
    desc: 'Download basemap and terrain tiles for an area so it works with no internet connection',
    searchTerms:
      'offline download area region pmtiles terrain basemap dark light colour cartographic',
    control: { component: OfflineMapsSettings, layout: 'full', naturalHeight: true },
    groupLabel: 'MAP',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'config-current',
    label: 'Application Config',
    desc: '',
    searchTerms: 'settings currently stored in the database raw json',
    control: { component: ConfigCurrentControl, emits: ['stage'], layout: 'full' },
    // Export All carries no groupLabel of its own, so it stays under this
    // heading — the same way the AIR/SPACE sections continue a group.
    groupLabel: 'CONFIGURATION',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'export-all',
    label: 'Export All Configuration',
    desc: 'Back up your full configuration (sentinel_config.json, sdr_frequencies.json and sdr_bandplan.json) to a single folder you choose',
    control: { component: ExportAllControl },
  },
])
