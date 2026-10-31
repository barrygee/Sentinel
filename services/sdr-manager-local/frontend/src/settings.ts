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
import ConfigTransferControl from './components/config/ConfigTransferControl.vue'
import LocalDevicesControl from './components/devices/LocalDevicesControl.vue'
import HotspotControl from './components/hotspot/HotspotControl.vue'
import { useLocalAuthStore } from './stores/localAuthStore'

const THIS_MACHINE_GROUP = 'THIS MACHINE'
const DEVICES_GROUP = 'DEVICES'

/**
 * sdr-manager-local's THIS MACHINE group — the RTL-SDRs plugged into this
 * machine, its console password, its Wi-Fi hotspot and its configuration file.
 * In the full app it sits on Settings › SDR, its SDRs card in DEVICES below
 * the Sentinel hosts and remote SDR devices; in SDR Manager-only mode, which
 * has no SDR section, on that mode's own page, Settings › SDR Manager.
 */
export function registerSdrManagerLocalSettings(appMode: AppMode = 'full'): void {
  const sdrManagerOnly = appMode === 'sdr-manager-local-only'
  const section = sdrManagerOnly ? SDR_MANAGER_SETTINGS_SECTION : SDR_SETTINGS_SECTION
  registerSettingsSection({ ...section })
  // What every THIS MACHINE item shares: the section, its group and its place on the page.
  const sharedFields = {
    section: section.key,
    sectionLabel: section.label,
    groupLabel: THIS_MACHINE_GROUP,
    position: SDR_SETTINGS_POSITIONS.thisMachine,
  } as const
  const items: SettingItem[] = [
    {
      ...sharedFields,
      // In DEVICES with the Sentinel hosts and remote SDR devices: the third
      // place radios come from. Its console password, configuration and
      // hotspot follow under THIS MACHINE.
      groupLabel: DEVICES_GROUP,
      id: 'sdr-manager-local-devices',
      label: 'SDRs on This Machine',
      // SDR Manager-only mode has no Radios list above it, so its one page
      // says what the card is for; in the full app it needs no explaining.
      desc: sdrManagerOnly
        ? 'The SDRs plugged into this computer. Name each one, set its port and switch it on to share it.'
        : '',
      searchTerms:
        'rtl-sdr dongle usb this machine local devices port stream serial flash eeprom forget sdr manager',
      control: {
        component: LocalDevicesControl,
        emits: ['stage'],
        layout: 'full',
        naturalHeight: true,
      },
    },
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
      id: 'sdr-manager-local-configuration',
      label: 'Configuration',
      desc: 'Back up this machine’s SDR settings to a file, or set it up from one.',
      searchTerms: 'configuration export import backup restore file json sdr manager',
      control: {
        component: ConfigTransferControl,
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
