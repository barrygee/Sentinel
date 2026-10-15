import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { copyTextToClipboard } from './useClipboardCopy'

type ExecCommand = typeof document.execCommand

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText ? { writeText } : undefined,
  })
}

describe('copyTextToClipboard', () => {
  let originalExecCommand: ExecCommand | undefined

  beforeEach(() => {
    originalExecCommand = document.execCommand
    document.execCommand = vi.fn(() => true)
  })

  afterEach(() => {
    document.execCommand = originalExecCommand as ExecCommand
    setClipboard(undefined)
    document.body.innerHTML = ''
  })

  it('writes through the async clipboard when the browser offers it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setClipboard(writeText)
    await expect(copyTextToClipboard('docker compose up')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('docker compose up')
    expect(document.execCommand).not.toHaveBeenCalled()
  })

  it('falls back to the legacy copy when the async clipboard refuses', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    await expect(copyTextToClipboard('x')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('uses the legacy copy straight away when there is no clipboard API (plain-HTTP LAN)', async () => {
    setClipboard(undefined)
    await expect(copyTextToClipboard('x')).resolves.toBe(true)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
  })

  it('reports failure when the legacy copy is refused', async () => {
    document.execCommand = vi.fn(() => false)
    await expect(copyTextToClipboard('x')).resolves.toBe(false)
  })

  it('reports failure, not an error, when the legacy copy throws', async () => {
    document.execCommand = vi.fn(() => {
      throw new Error('not allowed')
    })
    await expect(copyTextToClipboard('x')).resolves.toBe(false)
  })

  it('copies the text it was given through a hidden scratch field and removes it again', async () => {
    let textAtCopyTime = ''
    document.execCommand = vi.fn(() => {
      const field = document.querySelector('textarea')
      textAtCopyTime = field?.value ?? ''
      expect(field?.hasAttribute('readonly')).toBe(true)
      expect(document.activeElement).toBe(field)
      return true
    })
    await copyTextToClipboard('line one\nline two')
    expect(textAtCopyTime).toBe('line one\nline two')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('puts focus back on the control that had it, so a keyboard user does not land on <body>', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    expect(document.activeElement).toBe(button)
    await copyTextToClipboard('x')
    expect(document.activeElement).toBe(button)
  })

  it('puts focus back even when the legacy copy fails', async () => {
    document.execCommand = vi.fn(() => false)
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    await copyTextToClipboard('x')
    expect(document.activeElement).toBe(button)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('does not touch focus when the async clipboard succeeds', async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined))
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    await copyTextToClipboard('x')
    expect(document.activeElement).toBe(button)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('copes with no previously focused HTML element (focus on a non-HTML element)', async () => {
    const svgNamespace = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(svgNamespace, 'svg')
    svg.setAttribute('tabindex', '0')
    document.body.appendChild(svg)
    ;(svg as unknown as HTMLElement).focus?.()
    await expect(copyTextToClipboard('x')).resolves.toBe(true)
  })
})
