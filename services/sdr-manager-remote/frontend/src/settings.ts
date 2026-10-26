import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { SDR_MANAGER_SETTINGS_SECTION } from '@sentinel/shell-api/shell/sdrManagerSettingsSection'
import RemoteHostsControl from './components/RemoteHostsControl.vue'

/** sdr-manager-remote's part of Settings › SDR Manager: the REMOTE SDR HOSTS group. */
export function registerSdrManagerRemoteSettings(): void {
  registerSettingsSection({ ...SDR_MANAGER_SETTINGS_SECTION })
  registerSettingItems([
    {
      section: SDR_MANAGER_SETTINGS_SECTION.key,
      sectionLabel: SDR_MANAGER_SETTINGS_SECTION.label,
      id: 'sdr-manager-remote-hosts',
      label: 'Remote SDR Hosts',
      // No description: the REMOTE SDR HOSTS group heading already names the
      // card. The blurb stays as search terms so the card is still findable.
      desc: '',
      searchTerms:
        'register raspberry pi sentry sdr manager remote host this machine sdr devices rtl_tcp',
      docPath: 'use/sdr-manager#remote-sdr-hosts',
      control: { component: RemoteHostsControl, emits: ['stage'], layout: 'half' },
      // The group heading already reads REMOTE SDR HOSTS directly above the
      // card; the title stays in the registry for screen readers and search.
      hideLabel: true,
      groupLabel: 'REMOTE SDR HOSTS',
    },
  ])
}
