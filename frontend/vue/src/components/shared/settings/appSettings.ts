import { defineAsyncComponent } from 'vue'
import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import ConfigCurrentControl from './ConfigCurrentControl.vue'
import ConnectivityToggle from './ConnectivityToggle.vue'
import ExportAllControl from './ExportAllControl.vue'
import HttpsControl from './HttpsControl.vue'
import LocationControl from './LocationControl.vue'
import MachineNameControl from './MachineNameControl.vue'
import MapThemeControl from './MapThemeControl.vue'
import NotificationSoundControl from './NotificationSoundControl.vue'
import NotificationSubscriptionsControl from './NotificationSubscriptionsControl.vue'

// The map's own settings use map-kit (and Offline Maps draws on a MapLibre
// map), so they load when their card first renders: SDR Manager-only mode
// never shows them, and so never downloads the map for them.
const MapBasemapLayersControl = defineAsyncComponent(() => import('./MapBasemapLayersControl.vue'))
const RangeRingOriginControl = defineAsyncComponent(() => import('./RangeRingOriginControl.vue'))
const OfflineMapsSettings = defineAsyncComponent(
  () => import('./offline-maps/OfflineMapsSettings.vue'),
)

/**
 * The App Settings that only mean something with the full app. SDR
 * Manager-only mode keeps the rest: Machine Name and Location (what other
 * Sentinels call this machine and where they show it), HTTPS and THIS MACHINE.
 */
const FULL_APP_ONLY = ['full'] as const

/**
 * Core's own Settings section (F3): general, alerts, location, map, offline maps and the configuration file. Registered by core, like every section registers its own.
 */
registerSettingsSection({ key: 'app', label: 'App Settings', order: 0, domain: false })

registerSettingItems([
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'connectivity-mode',
    modes: FULL_APP_ONLY,
    label: 'App Wide Connectivity Mode',
    desc: 'Sets every section to this mode, replacing any section overrides',
    control: { component: ConnectivityToggle, emits: ['stage'] },
    groupLabel: 'GENERAL',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'notification-sound',
    modes: FULL_APP_ONLY,
    label: 'Alert Sound',
    desc: '',
    control: { component: NotificationSoundControl, emits: ['stage'] },
    groupLabel: 'ALERTS',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'notification-subscriptions',
    modes: FULL_APP_ONLY,
    label: 'Alerts',
    // The description is rendered by the control itself, so it can hide with the list.
    desc: '',
    searchTerms:
      'notifications alerts bell aircraft landing departure satellite pass overhead clear cancel turn off disable',
    control: { component: NotificationSubscriptionsControl, emits: ['stage'] },
  },
  {
    // Both modes: other Sentinels call this machine's SDR Manager by it.
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'machine-name',
    label: 'Machine Name',
    desc: 'One name for this machine. It reads “<name> (This machine)” here; other Sentinels see the name.',
    searchTerms:
      'machine name this machine sentinel name label identity call host site my location',
    control: {
      component: MachineNameControl,
      emits: ['stage'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'LOCATION',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'location',
    label: 'Location',
    desc: '',
    // Keeps the setting findable by the words the removed description carried.
    searchTerms: 'fixed latitude longitude position sentinel location this machine',
    control: { component: LocationControl, emits: ['stage'], layout: 'half', naturalHeight: true },
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'map-theme',
    modes: FULL_APP_ONLY,
    label: 'Map Style',
    desc: '',
    searchTerms: 'theme light dark mode palette appearance basemap map style openstreetmap osm',
    control: { component: MapThemeControl, emits: ['stage'] },
    groupLabel: 'MAP',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'map-basemap-layers',
    modes: FULL_APP_ONLY,
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
    modes: FULL_APP_ONLY,
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
    modes: FULL_APP_ONLY,
    label: 'Offline Maps',
    desc: 'Download basemap and terrain tiles for an area so it works with no internet connection',
    searchTerms: 'offline download area region pmtiles terrain basemap dark light openstreetmap',
    control: { component: OfflineMapsSettings, layout: 'full', naturalHeight: true },
    groupLabel: 'MAP',
  },
  {
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'config-current',
    // Full app only: SDR Manager-only mode's settings are THIS MACHINE's
    // Configuration (edited in place the same way); Machine Name, Location
    // and HTTPS keep their own cards.
    modes: FULL_APP_ONLY,
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
    modes: FULL_APP_ONLY,
    label: 'Export All Configuration',
    desc: 'Back up your full configuration (sentinel_config.json, sdr_frequencies.json and sdr_bandplan.json) to a single folder you choose',
    control: { component: ExportAllControl },
  },
  {
    // Both modes: an SDR Manager-only Pi is opened from other devices too.
    section: 'app',
    sectionLabel: 'App Settings',
    id: 'https',
    label: 'HTTPS',
    desc: 'Open Sentinel over an encrypted connection, once each device trusts this Sentinel’s certificate.',
    searchTerms: 'https tls ssl certificate encryption secure fingerprint trust install',
    control: { component: HttpsControl, layout: 'full', naturalHeight: true },
    groupLabel: 'SECURITY',
  },
])
