import { getActivePinia } from 'pinia'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { createRadioSitesCapability } from './radioSitesCapability'
import { registerSdrManagerRemoteSettings } from './settings'

/**
 * sdr-manager-remote's `./register` entry: the shell calls it once at boot,
 * statically in dev and tests and through Module Federation in the built app.
 *
 * It adds settings only, never a map section: the REMOTE SDR HOSTS group of
 * Settings › SDR Manager, and the `radioSites` capability — the hosts, their
 * positions and devices — that the maps, Air's receiver picker and the SDR
 * section's DEVICES list read.
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'sdr-manager-remote')
  registerSdrManagerRemoteSettings()
  provideCapability('radioSites', createRadioSitesCapability())
}
