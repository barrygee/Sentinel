/**
 * Tells whoever listens that the host list changed — a host added, edited or
 * removed in Settings › SDR. The SDR section's DEVICES list groups radios by host, so it
 * subscribes through the `radioSites` capability's `onHostsChanged` and
 * reloads its hosts without polling this package's state.
 */

const listeners = new Set<() => void>()

/**
 * Calls `listener` after every host change.
 *
 * @returns a function that stops the calls.
 */
export function onHostsChanged(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Calls every listener; a listener that throws does not stop the others. */
export function announceHostsChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch (error) {
      console.error('[sdr-manager-remote] a hosts-changed listener failed:', error)
    }
  }
}
