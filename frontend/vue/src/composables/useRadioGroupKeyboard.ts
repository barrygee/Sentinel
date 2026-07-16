/**
 * `useRadioGroupKeyboard` — the keyboard model for a `role="radiogroup"` of
 * pill buttons (the segmented single-select groups: MODE pills, device
 * ENABLED/DISABLED, source override, playback speed…).
 *
 * Implements the WAI-ARIA radio-group pattern for buttons that carry
 * `role="radio"`: the group is one tab stop (roving tabindex — only the
 * selected radio is tabbable) and Arrow keys move the selection, wrapping at
 * the ends, with selection following focus. Half-done radio semantics are
 * worse than none: a caller that sets `role="radio"` on its pills MUST also
 * bind both helpers returned here, or keyboard users can neither reach nor
 * change the unselected options.
 *
 * The composable is deliberately DOM-driven and stateless: the next radio to
 * focus is found from the event target's closest `[role="radiogroup"]`
 * ancestor, so one instance serves every group bound to the same state (the
 * frequency-manager edit and add forms share one `efMode`) and no template
 * refs are needed.
 */
export interface RadioGroupKeyboardOptions {
  /** Number of radio options currently rendered in the group. */
  optionCount: () => number
  /** Index of the currently selected option (-1 when none is selected yet). */
  selectedIndex: () => number
  /** Select the option at this index — the same action as clicking its pill. */
  select: (optionIndex: number) => void
}

export interface RadioGroupKeyboard {
  /** `tabindex` for the radio at this index (roving: selected radio only). */
  radioTabindex: (optionIndex: number) => 0 | -1
  /** Arrow-key handler; bind as `@keydown` on the radio at this index. */
  onRadioKeydown: (event: KeyboardEvent, optionIndex: number) => void
}

/** Create the roving-tabindex + arrow-key bindings for one radio-group state. */
export function useRadioGroupKeyboard(options: RadioGroupKeyboardOptions): RadioGroupKeyboard {
  function radioTabindex(optionIndex: number): 0 | -1 {
    const selected = options.selectedIndex()
    // With no selection yet, the first radio anchors the group's tab stop.
    if (selected < 0) return optionIndex === 0 ? 0 : -1
    return optionIndex === selected ? 0 : -1
  }

  function onRadioKeydown(event: KeyboardEvent, optionIndex: number): void {
    let step: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        step = 1
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        step = -1
        break
      default:
        return
    }
    // The handler can only fire from a rendered radio, so the count is ≥ 1.
    const count = options.optionCount()
    const nextIndex = (optionIndex + step + count) % count
    event.preventDefault()
    options.select(nextIndex)
    // Move focus to the newly selected radio (selection follows focus). Found
    // via the DOM rather than refs so the composable stays caller-agnostic.
    const group = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]')
    const radios = group?.querySelectorAll<HTMLElement>('[role="radio"]')
    radios?.[nextIndex]?.focus()
  }

  return { radioTabindex, onRadioKeydown }
}
