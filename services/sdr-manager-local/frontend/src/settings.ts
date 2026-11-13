import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { SDR_MANAGER_SETTINGS_SECTION } from '@sentinel/shell-api/shell/sdrManagerSettingsSection'
import {
  SDR_SETTINGS_POSITIONS,
  SDR_SETTINGS_SECTION,
} from '@sentinel/shell-api/shell/sdrSettingsSection'
import type { AppMode } from '@sentinel/shell-api/types/appMode'
import type { SettingItem } from '@sentinel/shell-api/types/settings'
import ConsolePasswordControl from './components/auth/ConsolePasswordControl.vue'
import CertificateFingerprintControl from './components/certificate/CertificateFingerprintControl.vue'
import ConfigTransferControl from './components/config/ConfigTransferControl.vue'
import LocalDevicesControl from './components/devices/LocalDevicesControl.vue'
import HotspotControl from './components/hotspot/HotspotControl.vue'
import PrivateAccessControl from './components/privateAccess/PrivateAccessControl.vue'
import { useLocalAuthStore } from './stores/localAuthStore'

const THIS_MACHINE_GROUP = 'THIS MACHINE'

/** Core's App Settings section (frontend/vue's appSettings.ts registers it). */
const APP_SETTINGS_SECTION_KEY = 'app'
const APP_SETTINGS_SECTION_LABEL = 'App Settings'
const AFTER_APP_SETTINGS_OWN_GROUPS = 1
const DEVICES_GROUP = 'DEVICES'

/**
 * sdr-manager-local's settings: this machine's RTL-SDRs, and its THIS MACHINE
 * group — console password, certificate, private access, configuration file
 * and Wi-Fi hotspot.
 *
 * THIS MACHINE is in App Settings, in both modes: it is about this computer,
 * not about radios, and the full app and SDR Manager-only mode keep it in the
 * same place. The SDRs themselves stay with the radios: the full app lists
 * them in Settings › SDR's SENTINEL HOSTS › This machine (the
 * `thisMachineSdrs` capability); SDR Manager-only mode, which has no SDR
 * section, lists them as the first card of its own page, Settings › SDR Manager.
 */
export function registerSdrManagerLocalSettings(appMode: AppMode = 'full'): void {
  const sdrManagerOnly = appMode === 'sdr-manager-local-only'
  const section = sdrManagerOnly ? SDR_MANAGER_SETTINGS_SECTION : SDR_SETTINGS_SECTION
  registerSettingsSection({ ...section })
  // What every THIS MACHINE item shares: App Settings, its group, and a place
  // after App Settings' own groups (they sit at the default position, 0).
  const sharedFields = {
    section: APP_SETTINGS_SECTION_KEY,
    sectionLabel: APP_SETTINGS_SECTION_LABEL,
    groupLabel: THIS_MACHINE_GROUP,
    position: AFTER_APP_SETTINGS_OWN_GROUPS,
  } as const
  // SDR Manager-only mode's page lists this machine's SDRs as a card of their
  // own. The full app lists them in Settings › SDR's SENTINEL HOSTS › This
  // machine instead (the `thisMachineSdrs` capability, see register.ts).
  const devicesCard: SettingItem[] = sdrManagerOnly
    ? [
        {
          section: section.key,
          sectionLabel: section.label,
          position: SDR_SETTINGS_POSITIONS.thisMachine,
          groupLabel: DEVICES_GROUP,
          id: 'sdr-manager-local-devices',
          label: 'SDRs on This Machine',
          desc: '',
          searchTerms:
            'rtl-sdr dongle usb this machine local devices port stream serial flash eeprom forget sdr manager',
          control: {
            component: LocalDevicesControl,
            emits: ['stage'],
            layout: 'full',
            naturalHeight: true,
          },
        },
      ]
    : []
  const items: SettingItem[] = [
    ...devicesCard,
    {
      ...sharedFields,
      id: 'sdr-manager-local-console-password',
      label: 'Console Password',
      desc: 'Protects this machine’s SDR Manager, here and for other Sentinels that manage it.',
      searchTerms: 'console password sign in sign out login security sdr manager',
      control: {
        component: ConsolePasswordControl,
        layout: 'half',
        naturalHeight: true,
        // Open while there is no password: setting one is what needs doing.
        collapsible: { openWhen: () => useLocalAuthStore().isUnprotected },
      },
    },
    {
      ...sharedFields,
      id: 'sdr-manager-local-certificate',
      label: 'Certificate',
      desc: 'The fingerprint other Sentinels check before they trust this machine.',
      searchTerms:
        'certificate fingerprint tls https sha-256 trust security encryption sdr manager',
      control: {
        component: CertificateFingerprintControl,
        layout: 'half',
        naturalHeight: true,
        collapsible: {},
      },
    },
    {
      ...sharedFields,
      id: 'sdr-manager-local-private-access',
      label: 'Private Access',
      desc: 'The other Sentinels allowed to use this machine’s private dongles.',
      searchTerms: 'private access whitelist allow list ip address sentinel security sdr manager',
      control: {
        component: PrivateAccessControl,
        layout: 'half',
        naturalHeight: true,
        collapsible: {},
      },
    },
    {
      ...sharedFields,
      id: 'sdr-manager-local-configuration',
      label: 'Configuration',
      desc: 'Back up this machine’s SDR settings to a file, or set it up from one.',
      searchTerms: 'configuration export import backup restore file json sdr manager',
      control: {
        component: ConfigTransferControl,
        // Its inline JSON editor stages an import for APPLY CHANGES.
        emits: ['stage'],
        layout: 'half',
        naturalHeight: true,
        collapsible: {},
      },
    },
    {
      ...sharedFields,
      id: 'sdr-manager-local-hotspot',
      label: 'Hotspot',
      desc: 'A Wi-Fi network this machine offers, so a phone or laptop can reach Sentinel where there is no other network.',
      searchTerms: 'hotspot wifi wi-fi access point ap network ssid off grid field sdr manager',
      control: { component: HotspotControl, layout: 'full', naturalHeight: true, collapsible: {} },
    },
  ]
  registerSettingItems(items)
}
