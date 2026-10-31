import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import JsonDataControl from '@sentinel/shell-api/settings/JsonDataControl.vue'
import {
  SDR_SETTINGS_POSITIONS,
  SDR_SETTINGS_SECTION,
} from '@sentinel/shell-api/shell/sdrSettingsSection'
import SdrDevicesControl from './settings/SdrDevicesControl.vue'
import SdrOptionsControl from './settings/SdrOptionsControl.vue'

/**
 * SDR's Settings section (F3): radios, receiver options and the frequency / band-plan files.
 * The Radios card lists the SDR hosts too, through sdr-manager-remote's
 * `radioSites` capability; sdr-manager-local adds this machine's own cards
 * below it (SDRs on This Machine, then its THIS MACHINE group).
 */
export function registerSdrSettings(): void {
  registerSettingsSection({ ...SDR_SETTINGS_SECTION })

  registerSettingItems([
    {
      section: 'sdr',
      sectionLabel: 'SDR',
      id: 'sdr-devices',
      label: 'Radios',
      // No title or description: the DEVICES heading above says what it is,
      // and each SDR host's own row says where its SDRs come from. The words
      // stay as search terms so the card is still findable.
      desc: '',
      hideLabel: true,
      searchTerms:
        'radios sdr devices manual radios rtl_tcp address add sdr mirror sdr hosts remote sdr hosts register raspberry pi sentry sdr manager this machine computer shares',
      // `stage`: a host's edits, staged by its title row, saved by APPLY CHANGES.
      control: { component: SdrDevicesControl, emits: ['stage'], layout: 'half' },
      groupLabel: 'DEVICES',
      position: SDR_SETTINGS_POSITIONS.devices,
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
      position: SDR_SETTINGS_POSITIONS.options,
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
      position: SDR_SETTINGS_POSITIONS.frequencyData,
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
      position: SDR_SETTINGS_POSITIONS.frequencyData,
    },
  ])
}
