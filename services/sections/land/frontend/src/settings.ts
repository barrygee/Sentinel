import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import AprsLabelFieldsControl from './settings/AprsLabelFieldsControl.vue'
import AprsSdrSourceControl from './settings/AprsSdrSourceControl.vue'
import JsonDataControl from '@sentinel/shell-api/settings/JsonDataControl.vue'
import LandAprsChannelControl from './settings/LandAprsChannelControl.vue'
import LandAprsRetentionControl from './settings/LandAprsRetentionControl.vue'
import RepeaterLabelFieldsControl from './settings/RepeaterLabelFieldsControl.vue'

/**
 * LAND's Settings section (F3): the APRS receiver and channel, station/repeater labels, APRS retention and the repeater directory file.
 */
registerSettingsSection({ key: 'land', label: 'LAND', order: 40, domain: true })

registerSettingItems([
  {
    section: 'land',
    sectionLabel: 'LAND',
    id: 'land-aprs-sdr-source',
    label: 'Off Grid APRS SDR',
    desc: 'Which SDR radio decodes APRS. Decode runs in the background on it and keeps it on the APRS channel; until one is set, the map\u2019s APRS layer stays off',
    searchTerms: 'aprs radio receiver direwolf packet land map layer',
    control: { component: AprsSdrSourceControl, emits: ['stage'] },
    groupLabel: 'APRS',
  },
  {
    section: 'land',
    sectionLabel: 'LAND',
    id: 'land-aprs-channel',
    label: 'APRS Channel',
    desc: 'Frequency the APRS radio is kept on \u2014 144.800 MHz in Europe/UK, 144.390 MHz in North America. The decoder retunes the radio here if anything moves it off',
    searchTerms: 'aprs channel frequency mhz 144.800 144.390 packet',
    control: { component: LandAprsChannelControl, emits: ['stage', 'commit'] },
    groupLabel: 'APRS',
  },
  {
    section: 'land',
    sectionLabel: 'LAND',
    id: 'land-aprs-label-fields',
    label: 'APRS Label Fields',
    desc: 'Choose which data fields appear on APRS station labels on the map',
    control: { component: AprsLabelFieldsControl, emits: ['stage'], layout: 'half' },
    groupLabel: 'APRS',
  },
  {
    section: 'land',
    sectionLabel: 'LAND',
    id: 'land-aprs-retention',
    label: 'APRS Retention',
    desc: 'Minutes a heard APRS station stays on the map after its last signal',
    control: { component: LandAprsRetentionControl, emits: ['stage', 'commit'] },
    groupLabel: 'APRS',
  },
  {
    section: 'land',
    sectionLabel: 'LAND',
    id: 'land-repeater-label-fields',
    label: 'Repeater Label Fields',
    desc: 'Choose which data fields appear on amateur-radio repeater labels on the map',
    searchTerms: 'repeater label callsign band frequency mode ctcss locator keeper',
    control: { component: RepeaterLabelFieldsControl, emits: ['stage'], layout: 'half' },
    groupLabel: 'REPEATERS',
  },
  {
    section: 'land',
    sectionLabel: 'LAND',
    id: 'land-repeaters-file',
    label: 'Repeater Directory (JSON)',
    desc: 'The UK repeater directory the Land map plots — refreshed daily from ukrepeater.net, with a bundled copy for offline installs. Edit or replace it here; a replacement is kept for 30 days before the daily refresh resumes.',
    searchTerms: 'repeaters directory json ukrepeater etcc data file',
    control: {
      component: JsonDataControl,
      props: {
        getUrl: '/api/land/repeaters/file',
        postUrl: '/api/land/repeaters/file',
        filename: 'uk_repeaters.json',
      },
      emits: ['stage'],
      layout: 'full',
    },
    groupLabel: 'REPEATERS',
  },
])
