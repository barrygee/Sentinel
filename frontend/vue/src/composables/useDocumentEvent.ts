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
  // Only forward a third argument when the caller actually supplied one —
  // some existing specs assert the exact add/removeEventListener call shape,
  // and `addEventListener(name, handler, undefined)` is functionally
  // identical to the two-argument form but not call-shape-identical for spy
  // assertions.
  onMounted(() => {
    if (options === undefined) {
      document.addEventListener(eventName, handler)
    } else {
      document.addEventListener(eventName, handler, options)
    }
  })
  onUnmounted(() => {
    if (options === undefined) {
      document.removeEventListener(eventName, handler)
    } else {
      document.removeEventListener(eventName, handler, options)
    }
  })
}
