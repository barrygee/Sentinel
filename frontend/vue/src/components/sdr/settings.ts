import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import JsonDataControl from '@sentinel/shell-api/settings/JsonDataControl.vue'
import SdrDevicesControl from '@/components/sdr/settings/SdrDevicesControl.vue'
import SdrOptionsControl from '@/components/sdr/settings/SdrOptionsControl.vue'
import SentryHostsControl from '@/components/sdr/settings/SentryHostsControl.vue'

/**
 * SDR's Settings section (F3): Sentry hosts, devices, receiver options and the frequency / band-plan files.
 */
registerSettingsSection({ key: 'sdr', label: 'SDR', order: 50, domain: true })

registerSettingItems([
  {
    section: 'sdr',
    sectionLabel: 'SDR',
    id: 'sdr-sentry-hosts',
    label: 'Sentry Hosts',
    // No description: the SENTRY HOSTS group heading already names the card.
    // The former blurb stays as search terms so the card is still findable.
    desc: '',
    searchTerms: 'register raspberry pi sentry remote sdr devices',
    control: { component: SentryHostsControl, layout: 'half' },
    groupLabel: 'SENTRY HOSTS',
  },
  {
    section: 'sdr',
    sectionLabel: 'SDR',
    id: 'sdr-devices',
    label: 'SDR Devices',
    desc: 'Configure RTL-SDR devices reachable via rtl_tcp, or mirror one from a registered Sentry host',
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
      'auto-center waterfall on tune snap to known frequencies show band plan display known frequencies mute audio while decoding waterfall spectrum scan search resume delay seconds hold resume',
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
