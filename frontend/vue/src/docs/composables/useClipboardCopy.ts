/**
 * Copies text to the clipboard, with a fallback for pages served over plain
 * HTTP (a LAN address), where `navigator.clipboard` does not exist.
 *
 * @returns True when the text was copied; false when the browser refused both
 *   ways, in which case the caller should select the text for the reader to
 *   copy by hand.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or not focused: try the legacy path below.
    }
  }
  // select() below moves focus into the scratch field; put it back afterwards
  // so a keyboard user does not land on <body> after pressing COPY.
  const previouslyFocused = document.activeElement
  const scratchField = document.createElement('textarea')
  scratchField.value = text
  scratchField.setAttribute('readonly', '')
  scratchField.style.position = 'fixed'
  scratchField.style.opacity = '0'
  document.body.appendChild(scratchField)
  scratchField.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    scratchField.remove()
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
  }
}
