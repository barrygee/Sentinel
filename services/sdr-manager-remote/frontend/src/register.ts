import { getActivePinia } from 'pinia'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { createRadioSitesCapability } from './radioSitesCapability'

/**
 * sdr-manager-remote's `./register` entry: the shell calls it once at boot,
 * statically in dev and tests and through Module Federation in the built app.
 *
 * It adds no settings card and no map section of its own: it provides the
 * `radioSites` capability — the hosts, their positions and devices, and the
 * host title rows and add form — that the maps, Air's receiver picker and
 * Settings › SDR's Radios card use.
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'sdr-manager-remote')
  provideCapability('radioSites', createRadioSitesCapability())
}
