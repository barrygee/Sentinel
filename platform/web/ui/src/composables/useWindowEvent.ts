import { onMounted, onUnmounted } from 'vue'

/**
 * Registers a window-level event listener on mount and removes it on unmount.
 * The window counterpart to useDocumentEvent, for events that only fire on the
 * window (e.g. `resize`) rather than the document.
 *
 * @param options - Standard addEventListener options (e.g. `{ capture: true }`).
 */
export function useWindowEvent(
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (e: any) => void,
  options?: AddEventListenerOptions,
): void {
  onMounted(() => window.addEventListener(eventName, handler, options))
  onUnmounted(() => window.removeEventListener(eventName, handler, options))
}
