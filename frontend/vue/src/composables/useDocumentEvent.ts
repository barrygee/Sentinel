import { onMounted, onUnmounted } from 'vue'

/**
 * Registers a document-level event listener on mount and removes it on unmount.
 * Eliminates the boilerplate of manual addEventListener/removeEventListener pairs.
 * Accepts both standard DOM event names and custom event names.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDocumentEvent(eventName: string, handler: (e: any) => void): void {
  onMounted(() => document.addEventListener(eventName, handler))
  onUnmounted(() => document.removeEventListener(eventName, handler))
}
