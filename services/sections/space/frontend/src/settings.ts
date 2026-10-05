import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import JsonDataControl from '@sentinel/shell-api/settings/JsonDataControl.vue'
import SpaceHoverPreviewControl from './settings/SpaceHoverPreviewControl.vue'
import SpaceTleDatabaseControl from './settings/SpaceTleDatabaseControl.vue'
import SpaceTleManualControl from './settings/SpaceTleManualControl.vue'
import SpaceTleOnlineControl from './settings/SpaceTleOnlineControl.vue'

/**
 * SPACE's Settings section (F3): satellite (TLE) data, the satellite radio file and filter hover preview.
 */
export function registerSpaceSettings(): void {
  registerSettingsSection({ key: 'space', label: 'SPACE', order: 20, domain: true })

  registerSettingItems([
    {
      section: 'space',
      sectionLabel: 'SPACE',
      id: 'space-online-source',
      label: 'Online Data Source',
      desc: 'URL to fetch TLE data from — select a category and click UPDATE TLE',
      control: { component: SpaceTleOnlineControl, layout: 'half' },
      groupLabel: 'DATA SOURCES',
    },
    {
      section: 'space',
      sectionLabel: 'SPACE',
      id: 'space-manual-tle',
      label: 'TLE Import',
      desc: 'Upload a .txt file of TLE data',
      control: { component: SpaceTleManualControl, layout: 'half' },
    },
    {
      section: 'space',
      sectionLabel: 'SPACE',
      id: 'space-tle-database',
      label: 'TLE Database',
      desc: 'Satellite count, sources, and per-category last-updated times. Clear all data, or clear a single category (e.g. space station, amateur radio).',
      control: { component: SpaceTleDatabaseControl, layout: 'half' },
    },
    {
      section: 'space',
      sectionLabel: 'SPACE',
      id: 'space-sat-radio-file',
      label: 'Satellite Frequencies (JSON)',
      desc: '',
      searchTerms:
        'bulk-edit all satellite frequencies raw json backend/data/satellite_radio.json database',
      control: {
        component: JsonDataControl,
        props: {
          getUrl: '/api/space/radio/file',
          postUrl: '/api/space/radio/file',
          filename: 'satellite_radio.json',
        },
        emits: ['stage'],
        layout: 'full',
      },
      groupLabel: 'SATELLITE DATA',
    },
    {
      section: 'space',
      sectionLabel: 'SPACE',
      id: 'space-filter-hover-preview',
      label: 'Filter Hover Behaviour',
      desc: 'When hovering over a satellite in the search results, choose whether the map stays in place or flies to that satellite',
      control: { component: SpaceHoverPreviewControl, emits: ['stage'], layout: 'half' },
      groupLabel: 'FILTER HOVER',
    },
  ])
}
