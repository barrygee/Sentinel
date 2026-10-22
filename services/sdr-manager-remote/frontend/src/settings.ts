import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import RemoteHostsControl from './components/RemoteHostsControl.vue'

/**
 * The SDR Manager Settings section both SDR Manager remotes share (ADR 0007).
 * sdr-manager-local registers the identical entry for its THIS MACHINE group;
 * whichever loads first creates it (`registerSettingsSection` accepts an
 * identical re-registration).
 */
export const SDR_MANAGER_SETTINGS_SECTION = {
  key: 'sdr-manager',
  label: 'SDR Manager',
  order: 15,
  domain: false,
} as const

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
      control: { component: RemoteHostsControl, layout: 'half' },
      // The group heading already reads REMOTE SDR HOSTS directly above the
      // card; the title stays in the registry for screen readers and search.
      hideLabel: true,
      groupLabel: 'REMOTE SDR HOSTS',
    },
  ])
}
