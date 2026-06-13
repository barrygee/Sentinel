import { watch, nextTick, type Ref } from 'vue'

/**
 * Implements the modal-dialog keyboard/focus contract (WCAG 2.4.3 Focus Order,
 * 2.1.2 No Keyboard Trap — the inverse: focus is *contained* while open, then
 * released). Drive it from a reactive `isOpen` flag and the dialog's container
 * element; bind the returned `onKeydown` to that container.
 *
 * On open it remembers the previously-focused element and moves focus into the
 * dialog; on close it restores focus to that element. While open, `Tab`/
 * `Shift+Tab` wrap within the dialog and `Escape` requests a close.
 */
export interface UseDialogOptions {
  /** Reactive open/closed state of the dialog. */
  isOpen: Ref<boolean>
  /** The dialog container element (focus is trapped within it). */
  container: Ref<HTMLElement | null>
  /** Called when the user requests a close (Escape). */
  onClose: () => void
  /**
   * Optional explicit first-focus target resolved on open. Falls back to the
   * first focusable descendant, then the container itself.
   */
  initialFocus?: () => HTMLElement | null
}

// Elements that can receive keyboard focus. `[tabindex="-1"]` is excluded: such
// elements are focusable programmatically but not part of the Tab sequence.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialog(options: UseDialogOptions): {
  onKeydown: (event: KeyboardEvent) => void
} {
  const { isOpen, container, onClose, initialFocus } = options
  let previouslyFocused: HTMLElement | null = null

  function focusableElements(): HTMLElement[] {
    const root = container.value
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  }

  watch(isOpen, (open) => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement | null
      void nextTick(() => {
        const target = initialFocus?.() ?? focusableElements()[0] ?? container.value
        target?.focus()
      })
    } else {
      previouslyFocused?.focus()
      previouslyFocused = null
    }
  })

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return

    const focusables = focusableElements()
    if (focusables.length === 0) {
      // Nothing tabbable inside — keep focus on the dialog itself.
      event.preventDefault()
      return
    }
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    const active = document.activeElement
    if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return { onKeydown }
}
