import { getActivePinia } from 'pinia'
import { provideCapability } from '@sentinel/shell-api/shell/capabilities'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import LocalDevicesControl from './components/devices/LocalDevicesControl.vue'
import { onUnauthorized } from './api/sdrManagerLocalApi'
import { registerSdrManagerLocalSettings } from './settings'
import { useLocalAuthStore } from './stores/localAuthStore'

/**
 * sdr-manager-local's `./register` entry: the shell calls it once at boot,
 * statically in dev and tests and through Module Federation in the built app.
 *
 * It adds no map section. In the full app it adds the THIS MACHINE group of
 * Settings › SDR and provides the `thisMachineSdrs` capability, through which
 * the SDR section lists this machine's SDRs under SENTINEL HOSTS › This
 * machine. In SDR Manager-only mode its SDRs are a card of that mode's page,
 * Settings › SDR Manager. A request that comes back 401 (the session expired,
 * or the password changed in another browser) brings back the sign-in form.
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'sdr-manager-local')
  registerSdrManagerLocalSettings(shell.appMode)
  if (shell.appMode !== 'sdr-manager-local-only') {
    provideCapability('thisMachineSdrs', { DevicesPanel: LocalDevicesControl })
  }
  const auth = useLocalAuthStore(shell.pinia)
  onUnauthorized(() => auth.markSignedOut())
}
