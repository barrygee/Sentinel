import { ref, type Ref } from 'vue'

/**
 * Minimal open/closed state for a disclosure widget (e.g. the air rail's FILTER
 * and LOCATIONS accordions). Bind `toggle` to the trigger button's click and
 * gate the expandable panel on `open`.
 *
 * @param initiallyOpen whether the panel starts expanded.
 */
export function useDisclosure(initiallyOpen = false): {
  open: Ref<boolean>
  toggle: () => void
} {
  const open = ref(initiallyOpen)

  function toggle(): void {
    open.value = !open.value
  }

  return { open, toggle }
}
