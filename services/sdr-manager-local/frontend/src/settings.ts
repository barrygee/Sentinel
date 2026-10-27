import {
  registerSettingItems,
  registerSettingsSection,
} from '@sentinel/shell-api/shell/settingsRegistry'
import { SDR_MANAGER_SETTINGS_SECTION } from '@sentinel/shell-api/shell/sdrManagerSettingsSection'
import type { SettingItem } from '@sentinel/shell-api/types/settings'
import ConsolePasswordControl from './components/auth/ConsolePasswordControl.vue'
import ConfigTransferControl from './components/config/ConfigTransferControl.vue'
import LocalDevicesControl from './components/devices/LocalDevicesControl.vue'
import HotspotControl from './components/hotspot/HotspotControl.vue'

const THIS_MACHINE_GROUP = 'THIS MACHINE'

/** What every THIS MACHINE item shares: the section and its group. */
const COMMON = {
  section: SDR_MANAGER_SETTINGS_SECTION.key,
  sectionLabel: SDR_MANAGER_SETTINGS_SECTION.label,
  groupLabel: THIS_MACHINE_GROUP,
} as const

/**
 * sdr-manager-local's part of Settings › SDR Manager: the THIS MACHINE group —
 * the RTL-SDRs plugged into this machine, its console password, its Wi-Fi
 * hotspot and its configuration file.
 */
export function registerSdrManagerLocalSettings(): void {
  registerSettingsSection({ ...SDR_MANAGER_SETTINGS_SECTION })
  const items: SettingItem[] = [
    {
      ...COMMON,
      id: 'sdr-manager-local-devices',
      label: 'Devices',
      desc: 'The RTL-SDRs plugged into this machine: name each one, give it a port to stream on, and switch it on.',
      searchTerms:
        'rtl-sdr dongle usb this machine local devices port stream serial flash eeprom forget sdr manager',
      docPath: 'use/sdr-manager#set-up-a-dongle',
      control: {
        component: LocalDevicesControl,
        emits: ['stage'],
        layout: 'full',
        naturalHeight: true,
      },
    },
    {
      ...COMMON,
      id: 'sdr-manager-local-console-password',
      label: 'Console Password',
      desc: 'Protects this machine’s SDR Manager, here and for other Sentinels that manage it.',
      searchTerms: 'console password sign in sign out login security sdr manager',
      docPath: 'use/sdr-manager#the-other-cards',
      control: { component: ConsolePasswordControl, layout: 'half', naturalHeight: true },
    },
    {
      ...COMMON,
      id: 'sdr-manager-local-configuration',
      label: 'Configuration',
      desc: 'Back up this machine’s SDR settings to a file, or set it up from one.',
      searchTerms: 'configuration export import backup restore file json sdr manager',
      docPath: 'use/sdr-manager#the-other-cards',
      control: { component: ConfigTransferControl, layout: 'half', naturalHeight: true },
    },
    {
      ...COMMON,
      id: 'sdr-manager-local-hotspot',
      label: 'Hotspot',
      desc: 'A Wi-Fi network this machine offers, so a phone or laptop can reach Sentinel where there is no other network.',
      searchTerms: 'hotspot wifi wi-fi access point ap network ssid off grid field sdr manager',
      docPath: 'use/sdr-manager#the-other-cards',
      control: { component: HotspotControl, layout: 'full', naturalHeight: true },
    },
  ]
  registerSettingItems(items)
}
