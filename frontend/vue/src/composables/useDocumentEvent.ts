import { onMounted, onUnmounted } from 'vue'

/**
 * Registers a document-level event listener on mount and removes it on unmount.
 * Eliminates the boilerplate of manual addEventListener/removeEventListener pairs.
 * Accepts both standard DOM event names and custom event names.
 *
 * @param options - Standard addEventListener options. Pass `{ capture: true }`
 *   to catch non-bubbling events (e.g. `scroll`) fired by descendant elements,
 *   such as an inner scroll container inside the page.
 */
export function useDocumentEvent(
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (e: any) => void,
  options?: AddEventListenerOptions,
): void {
  onMounted(() => document.addEventListener(eventName, handler, options))
  onUnmounted(() => document.removeEventListener(eventName, handler, options))
}
