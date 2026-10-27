import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import { SdrManagerApiError, updateHost } from './api/sdrManagerRemoteApi'

/** What `RemoteHostForm` edits, as typed. */
export interface RemoteHostDraft {
  address: string
  name: string
  port: number
  /** Blank keeps the stored console password. */
  authToken: string
}

/** Thrown when a host's staged edit can't be saved; `message` is shown under its form. */
export class RemoteHostSaveError extends Error {
  override name = 'RemoteHostSaveError'
}

/**
 * Saves an existing host's staged edit (APPLY CHANGES).
 *
 * This machine's row (`is_local`) sends only its label: sdr-manager-remote
 * links it from core's registry and refuses any other change to it (409
 * `local_host_managed`). A blank label clears it. The console password is sent
 * only when one was typed, so a blank field keeps the stored one.
 *
 * @throws RemoteHostSaveError with the reason to show under the form
 */
export async function saveRemoteHostDraft(
  host: SdrManagerHost,
  draft: RemoteHostDraft,
): Promise<void> {
  const name = draft.name.trim() || null
  const address = draft.address.trim()
  if (!host.is_local && !address) throw new RemoteHostSaveError('IP address is required.')
  try {
    await updateHost(
      host.id,
      host.is_local
        ? { name }
        : {
            name,
            address,
            port: draft.port || 8000,
            ...(draft.authToken ? { auth_token: draft.authToken } : {}),
          },
    )
  } catch (error) {
    throw new RemoteHostSaveError(
      error instanceof SdrManagerApiError ? error.message : 'Save failed.',
    )
  }
}
