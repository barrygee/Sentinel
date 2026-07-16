import { describe, it, expect, vi, afterEach } from 'vitest'
import { useRadioGroupKeyboard } from './useRadioGroupKeyboard'

/**
 * Builds a real DOM radiogroup of three radios and returns a keydown-event
 * factory whose `currentTarget` is the radio at the given index — the shape
 * the composable's DOM-driven focus movement expects.
 */
function buildRadioGroupDom() {
  const group = document.createElement('div')
  group.setAttribute('role', 'radiogroup')
  const radios = [0, 1, 2].map(() => {
    const radio = document.createElement('button')
    radio.setAttribute('role', 'radio')
    group.appendChild(radio)
    return radio
  })
  document.body.appendChild(group)

  function keydownEventFrom(radioIndex: number, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, cancelable: true })
    Object.defineProperty(event, 'currentTarget', { value: radios[radioIndex] })
    return event
  }

  return { group, radios, keydownEventFrom }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useRadioGroupKeyboard', () => {
  function makeGroup(selected = 0) {
    const select = vi.fn()
    const state = { selected }
    const keyboard = useRadioGroupKeyboard({
      optionCount: () => 3,
      selectedIndex: () => state.selected,
      select,
    })
    return { keyboard, select, state }
  }

  describe('radioTabindex (roving tabindex)', () => {
    it('makes only the selected radio tabbable', () => {
      const { keyboard } = makeGroup(1)
      expect(keyboard.radioTabindex(0)).toBe(-1)
      expect(keyboard.radioTabindex(1)).toBe(0)
      expect(keyboard.radioTabindex(2)).toBe(-1)
    })

    it('anchors the tab stop on the first radio when nothing is selected', () => {
      const { keyboard } = makeGroup(-1)
      expect(keyboard.radioTabindex(0)).toBe(0)
      expect(keyboard.radioTabindex(1)).toBe(-1)
    })
  })

  describe('onRadioKeydown (arrow-key selection)', () => {
    it.each([
      ['ArrowRight', 1, 2],
      ['ArrowDown', 1, 2],
      ['ArrowLeft', 1, 0],
      ['ArrowUp', 1, 0],
    ])('%s from index %i selects index %i', (key, fromIndex, expectedIndex) => {
      const { keyboard, select } = makeGroup(fromIndex)
      const { keydownEventFrom } = buildRadioGroupDom()
      const event = keydownEventFrom(fromIndex, key)
      keyboard.onRadioKeydown(event, fromIndex)
      expect(select).toHaveBeenCalledWith(expectedIndex)
      expect(event.defaultPrevented).toBe(true)
    })

    it('wraps forward from the last radio to the first', () => {
      const { keyboard, select } = makeGroup(2)
      const { keydownEventFrom } = buildRadioGroupDom()
      keyboard.onRadioKeydown(keydownEventFrom(2, 'ArrowRight'), 2)
      expect(select).toHaveBeenCalledWith(0)
    })

    it('wraps backward from the first radio to the last', () => {
      const { keyboard, select } = makeGroup(0)
      const { keydownEventFrom } = buildRadioGroupDom()
      keyboard.onRadioKeydown(keydownEventFrom(0, 'ArrowLeft'), 0)
      expect(select).toHaveBeenCalledWith(2)
    })

    it('moves focus to the newly selected radio', () => {
      const { keyboard } = makeGroup(0)
      const { radios, keydownEventFrom } = buildRadioGroupDom()
      const focusSpy = vi.spyOn(radios[1]!, 'focus')
      keyboard.onRadioKeydown(keydownEventFrom(0, 'ArrowRight'), 0)
      expect(focusSpy).toHaveBeenCalledTimes(1)
    })

    it('ignores non-arrow keys without selecting or cancelling', () => {
      const { keyboard, select } = makeGroup(0)
      const { keydownEventFrom } = buildRadioGroupDom()
      const event = keydownEventFrom(0, 'Enter')
      keyboard.onRadioKeydown(event, 0)
      expect(select).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    })

    it('still selects when the radio has no radiogroup ancestor (focus is skipped)', () => {
      const { keyboard, select } = makeGroup(0)
      const orphanRadio = document.createElement('button')
      document.body.appendChild(orphanRadio)
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true })
      Object.defineProperty(event, 'currentTarget', { value: orphanRadio })
      keyboard.onRadioKeydown(event, 0)
      expect(select).toHaveBeenCalledWith(1)
    })
  })
})
