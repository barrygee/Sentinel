import { registerSettingItems, registerSettingsSection } from '@/shell/settingsRegistry'
import AdsbSdrSourceControl from '@/components/shared/settings/AdsbSdrSourceControl.vue'
import AdsbTagFieldsControl from '@/components/shared/settings/AdsbTagFieldsControl.vue'
import MapLayersControl from '@/components/shared/settings/MapLayersControl.vue'
import OnlineSourceControl from '@/components/shared/settings/OnlineSourceControl.vue'
import OverheadAlertsControl from '@/components/shared/settings/OverheadAlertsControl.vue'
import SourceOverrideControl from '@/components/shared/settings/SourceOverrideControl.vue'

/**
 * AIR's Settings section (F3): data sources, map layers, overhead alerts and aircraft labels.
 */
registerSettingsSection({ key: 'air', label: 'AIR', order: 10, domain: true })

registerSettingItems([
  {
    section: 'air',
    sectionLabel: 'AIR',
    id: 'air-source-override',
    label: 'Source Override',
    desc: 'Overrides the app-wide Connectivity Mode for this section',
    control: { component: SourceOverrideControl, props: { ns: 'air' }, emits: ['stage'] },
    groupLabel: 'DATA SOURCES',
  },
  {
    section: 'air',
    sectionLabel: 'AIR',
    id: 'air-offgrid-sdr-source',
    label: 'Off Grid ADS-B SDR',
    desc: 'Which Sentry SDR receives ADS-B. Held and tuned to 1090 MHz while AIR is open off grid',
    control: { component: AdsbSdrSourceControl, emits: ['stage'] },
  },
  {
    section: 'air',
    sectionLabel: 'AIR',
    id: 'air-online-source',
    label: 'Online Data Source',
    desc: 'URL for live air data feed',
    control: {
      component: OnlineSourceControl,
      props: { ns: 'air', defaultUrl: 'https://api.adsb.lol/v2' },
      emits: ['stage', 'commit'],
    },
  },
  {
    section: 'air',
    sectionLabel: 'AIR',
    id: 'map-layers',
    label: 'Map Layers',
    desc: 'Which overlays the maps draw. The rails keep the few worth flipping mid-task; toggling one there updates it here.',
    searchTerms:
      'range rings a2a refuelling refueling awacs ground vehicles towers terrain contours contour lines elevation airports military bases overlays',
    control: { component: MapLayersControl, emits: ['stage'], layout: 'half', naturalHeight: true },
    groupLabel: 'MAP',
  },
  {
    section: 'air',
    sectionLabel: 'AIR',
    id: 'air-overhead-alerts',
    label: 'Overhead Aircraft Alerts',
    desc: 'Notify when aircraft are overhead, per location',
    searchTerms: 'overhead alerts civil military radius sentry location zone',
    control: {
      component: OverheadAlertsControl,
      emits: ['stage'],
      layout: 'half',
      naturalHeight: true,
    },
    groupLabel: 'ALERTS',
  },
  {
    section: 'air',
    sectionLabel: 'AIR',
    id: 'air-tag-fields',
    label: 'Label Data Points',
    desc: '',
    // Keeps the setting findable by the words the removed description carried.
    searchTerms: 'data fields aircraft labels civil military',
    control: { component: AdsbTagFieldsControl, emits: ['stage'], layout: 'half' },
    groupLabel: 'LABELS',
  },
])
