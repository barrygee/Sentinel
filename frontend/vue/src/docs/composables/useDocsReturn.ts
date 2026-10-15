import { useRouter } from 'vue-router'
import { docsReturn } from '@/router/docsRoute'

/**
 * Closing the docs page: back to where it was opened from.
 *
 * Mirrors how Settings closes: when the browser's previous entry *is* the
 * return path, go back (so Back and close agree and history does not grow);
 * otherwise replace the docs entry with it. Afterwards focus goes to whatever
 * opened Docs if it is still on screen, else to the main region.
 */
export function useDocsReturn(): { closeDocs: () => void } {
  const router = useRouter()

  function restoreFocus(): void {
    const opener = docsReturn.opener
    if (opener?.isConnected && opener.getClientRects().length > 0) {
      opener.focus()
      return
    }
    document.getElementById('main')?.focus()
  }

  // A second Escape (or Escape plus a click on close) before the first
  // navigation lands would otherwise call router.back() twice and leave the app.
  let closing = false

  function closeDocs(): void {
    if (closing) return
    closing = true
    const returnPath = docsReturn.path ?? '/'
    // Once, after the navigation lands; the timeout lets the route's own
    // focus handling (App, the Settings dialog) run first.
    const stopWaiting = router.afterEach(() => {
      stopWaiting()
      closing = false
      setTimeout(restoreFocus, 0)
    })
    if ((window.history.state as { back?: unknown } | null)?.back === returnPath) router.back()
    else void router.replace(returnPath)
  }

  return { closeDocs }
}
