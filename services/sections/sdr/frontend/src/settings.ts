import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import JsonDataControl from '@sentinel/shell-api/settings/JsonDataControl.vue'
import SdrDevicesControl from './settings/SdrDevicesControl.vue'
import SdrOptionsControl from './settings/SdrOptionsControl.vue'

/**
 * SDR's Settings section (F3): devices, receiver options and the frequency / band-plan files.
 * The SDR hosts themselves are Settings › SDR Manager's (`@sentinel/sdr-manager-remote`).
 */
export function registerSdrSettings(): void {
  registerSettingsSection({ key: 'sdr', label: 'SDR', order: 50, domain: true })

  registerSettingItems([
    {
      section: 'sdr',
      sectionLabel: 'SDR',
      id: 'sdr-devices',
      label: 'SDR Devices',
      desc: 'Configure RTL-SDR devices reachable via rtl_tcp, or mirror one from an SDR host in SDR Manager',
      control: { component: SdrDevicesControl, layout: 'half' },
      groupLabel: 'DEVICES',
    },
    {
      section: 'sdr',
      sectionLabel: 'SDR',
      id: 'sdr-options',
      label: 'SDR Options',
      desc: '',
      // The options box shows names and checkboxes only, so its per-option prose
      // lives here instead — searchable without putting text back on the page.
      searchTerms:
        'auto-center waterfall on tune snap to known frequencies show band plan display known frequencies mute audio while decoding record raw iq capture u8 recordings large files waterfall spectrum scan search resume delay seconds hold resume',
      control: { component: SdrOptionsControl, emits: ['stage', 'commit'], layout: 'half' },
      // The group heading already reads SDR OPTIONS directly above the card, so
      // the card's own title only said it twice. Kept in the registry (screen
      // readers and search still need a name for the box) but hidden on screen.
      hideLabel: true,
      groupLabel: 'SDR OPTIONS',
    },
    {
      section: 'sdr',
      sectionLabel: 'SDR',
      id: 'sdr-frequencies-file',
      label: 'Frequencies & Groups (JSON)',
      desc: '',
      searchTerms:
        'bulk-edit frequency groups stored frequencies search ranges raw json backend/data/sdr_frequencies.json database',
      control: {
        component: JsonDataControl,
        props: {
          getUrl: '/api/sdr/data/frequencies',
          postUrl: '/api/sdr/data/frequencies',
          filename: 'sdr_frequencies.json',
        },
        emits: ['stage'],
        layout: 'half-stacked',
      },
      groupLabel: 'FREQUENCY DATA',
    },
    {
      section: 'sdr',
      sectionLabel: 'SDR',
      id: 'sdr-bandplan-file',
      label: 'Band Plan (JSON)',
      desc: '',
      searchTerms:
        'bulk-edit coloured rf band-plan strip raw json backend/data/sdr_bandplan.json database',
      control: {
        component: JsonDataControl,
        props: {
          getUrl: '/api/sdr/data/bandplan',
          postUrl: '/api/sdr/data/bandplan',
          filename: 'sdr_bandplan.json',
        },
        emits: ['stage'],
        layout: 'half-stacked',
      },
    },
  ])
}
