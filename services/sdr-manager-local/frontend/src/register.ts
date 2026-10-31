import { getActivePinia } from 'pinia'
import { assertHostPinia, type ShellContext } from '@sentinel/shell-api/shell/shellContext'
import { onUnauthorized } from './api/sdrManagerLocalApi'
import { registerSdrManagerLocalSettings } from './settings'
import { useLocalAuthStore } from './stores/localAuthStore'

/**
 * sdr-manager-local's `./register` entry: the shell calls it once at boot,
 * statically in dev and tests and through Module Federation in the built app.
 *
 * It adds settings only, never a map section: the THIS MACHINE group of
 * Settings › SDR (Settings › SDR Manager in SDR Manager-only mode). A request
 * that comes back 401 (the session expired, or the password changed in another
 * browser) brings back the sign-in form.
 */
export default function register(shell: ShellContext): void {
  assertHostPinia(shell, getActivePinia(), 'sdr-manager-local')
  registerSdrManagerLocalSettings(shell.appMode)
  const auth = useLocalAuthStore(shell.pinia)
  onUnauthorized(() => auth.markSignedOut())
}
