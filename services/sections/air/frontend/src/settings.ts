import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import AdsbSdrSourceControl from './settings/AdsbSdrSourceControl.vue'
import AdsbTagFieldsControl from './settings/AdsbTagFieldsControl.vue'
import MapLayersControl from './settings/MapLayersControl.vue'
import OnlineDailyCallLimitControl from './settings/OnlineDailyCallLimitControl.vue'
import OnlineQuotaUsageControl from './settings/OnlineQuotaUsageControl.vue'
import OnlineRefreshIntervalControl from './settings/OnlineRefreshIntervalControl.vue'
import OnlineSourceControl from '@sentinel/shell-api/settings/OnlineSourceControl.vue'
import OverheadAlertsControl from './settings/OverheadAlertsControl.vue'
import SourceOverrideControl from '@sentinel/shell-api/settings/SourceOverrideControl.vue'
import SquawkWatchIntervalControl from './settings/SquawkWatchIntervalControl.vue'

/**
 * AIR's Settings section (F3): data sources, map layers, aircraft labels and overhead alerts.
 * Each data source setting shows only in the mode it belongs to (`sourceMode`).
 */
export function registerAirSettings(): void {
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
      sourceMode: 'offgrid',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-offgrid-squawk-watch-interval',
      label: 'Off Grid Squawk Checks',
      desc: 'Seconds between background checks of the Off Grid ADS-B SDR for emergency squawks while no AIR map is open',
      searchTerms: 'squawk emergency 7700 7600 7500 alerts background check interval off grid',
      control: {
        component: SquawkWatchIntervalControl,
        props: { mode: 'offgrid' },
        emits: ['stage', 'commit'],
      },
      sourceMode: 'offgrid',
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
      sourceMode: 'online',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-online-quota-usage',
      label: 'Online API Usage',
      desc: 'Calls made to the Online Data Source today (UTC), against its daily limit. Warns as the limit approaches and once it is reached',
      searchTerms: 'quota usage calls requests rate limit daily 500 adsb.lol remaining online api',
      control: { component: OnlineQuotaUsageControl, layout: 'full', naturalHeight: true },
      sourceMode: 'online',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-online-refresh-interval',
      label: 'Online Refresh Interval',
      desc: 'Seconds between calls to the Online Data Source, 5 to 280. Lower uses the daily limit faster',
      searchTerms: 'refresh interval rate limit quota daily requests 429 adsb.lol poll online',
      control: { component: OnlineRefreshIntervalControl, emits: ['stage', 'commit'] },
      sourceMode: 'online',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-online-daily-call-limit',
      label: 'Daily Call Limit',
      desc: "For a feed that doesn't state its daily limit. 0 uses the feed's own",
      searchTerms: 'daily call limit quota requests rate limit override online api',
      control: { component: OnlineDailyCallLimitControl, emits: ['stage', 'commit'] },
      sourceMode: 'online',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-online-squawk-watch-interval',
      label: 'Online Squawk Checks',
      desc: 'Seconds between background emergency checks while AIR is closed. Each uses one daily call',
      searchTerms: 'squawk emergency 7700 7600 7500 alerts background check interval online',
      control: {
        component: SquawkWatchIntervalControl,
        props: { mode: 'online' },
        emits: ['stage', 'commit'],
      },
      sourceMode: 'online',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'map-layers',
      label: 'Map Layers',
      desc: 'Which overlays the maps draw. The rails keep the few worth flipping mid-task; toggling one there updates it here.',
      searchTerms:
        'range rings a2a refuelling refueling awacs ground vehicles towers terrain contours contour lines elevation airports military bases overlays',
      control: {
        component: MapLayersControl,
        emits: ['stage'],
        layout: 'half',
        naturalHeight: true,
      },
      groupLabel: 'MAP',
    },
    {
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-tag-fields',
      label: 'Aircraft Label Fields',
      desc: '',
      // Keeps the setting findable by the words the removed description and the
      // old label ("Label Data Points") carried.
      searchTerms: 'data points fields aircraft labels civil military',
      control: { component: AdsbTagFieldsControl, emits: ['stage'], layout: 'half' },
      groupLabel: 'LABELS',
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
  ])
}
