import { describe, it, expect, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { useDialog } from './useDialog'

// Build a container with the given inner HTML, connected to the document so that
// `document.activeElement` tracks focus changes (jsdom only tracks connected nodes).
function makeContainer(innerHTML: string): HTMLElement {
  const container = document.createElement('div')
  container.tabIndex = -1
  container.innerHTML = innerHTML
  document.body.appendChild(container)
  return container
}

function tabEvent(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Tab', shiftKey })
}

describe('useDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('focus management', () => {
    it('moves focus to the explicit initial target on open and restores it on close', async () => {
      const trigger = document.createElement('button')
      document.body.appendChild(trigger)
      trigger.focus()

      const container = makeContainer('<button id="first">A</button><button id="second">B</button>')
      const initial = container.querySelector<HTMLButtonElement>('#second')!
      const isOpen = ref(false)
      useDialog({
        isOpen,
        container: ref(container),
        onClose: () => {},
        initialFocus: () => initial,
      })

      isOpen.value = true
      await flushPromises()
      expect(document.activeElement).toBe(initial)

      isOpen.value = false
      await flushPromises()
      expect(document.activeElement).toBe(trigger)
    })

    it('falls back to the first focusable descendant when no initial target is given', async () => {
      const container = makeContainer('<button id="first">A</button><button id="second">B</button>')
      const isOpen = ref(false)
      useDialog({ isOpen, container: ref(container), onClose: () => {} })

      isOpen.value = true
      await flushPromises()
      expect(document.activeElement).toBe(container.querySelector('#first'))
    })

    it('falls back to the container itself when it has no focusable descendants', async () => {
      const container = makeContainer('<p>No controls here</p>')
      const isOpen = ref(false)
      useDialog({ isOpen, container: ref(container), onClose: () => {} })

      isOpen.value = true
      await flushPromises()
      expect(document.activeElement).toBe(container)
    })

    it('does not throw restoring focus when nothing was focused before opening', async () => {
      const container = makeContainer('<button>A</button>')
      const isOpen = ref(false)
      useDialog({ isOpen, container: ref(container), onClose: () => {} })

      isOpen.value = true
      await flushPromises()
      isOpen.value = false
      await expect(flushPromises()).resolves.not.toThrow()
    })
  })

  describe('keyboard handling', () => {
    it('requests close and prevents default on Escape', () => {
      const onClose = vi.fn()
      const container = makeContainer('<button>A</button>')
      const { onKeydown } = useDialog({ isOpen: ref(true), container: ref(container), onClose })
      const event = new KeyboardEvent('keydown', { key: 'Escape' })
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(onClose).toHaveBeenCalledOnce()
      expect(preventDefault).toHaveBeenCalledOnce()
    })

    it('ignores keys other than Tab and Escape', () => {
      const onClose = vi.fn()
      const container = makeContainer('<button>A</button>')
      const { onKeydown } = useDialog({ isOpen: ref(true), container: ref(container), onClose })
      const event = new KeyboardEvent('keydown', { key: 'a' })
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(onClose).not.toHaveBeenCalled()
      expect(preventDefault).not.toHaveBeenCalled()
    })

    it('wraps Tab from the last element back to the first', () => {
      const container = makeContainer('<button id="first">A</button><button id="last">B</button>')
      const { onKeydown } = useDialog({
        isOpen: ref(true),
        container: ref(container),
        onClose() {},
      })
      container.querySelector<HTMLButtonElement>('#last')!.focus()
      const event = tabEvent()
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(preventDefault).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(container.querySelector('#first'))
    })

    it('wraps Shift+Tab from the first element to the last', () => {
      const container = makeContainer('<button id="first">A</button><button id="last">B</button>')
      const { onKeydown } = useDialog({
        isOpen: ref(true),
        container: ref(container),
        onClose() {},
      })
      container.querySelector<HTMLButtonElement>('#first')!.focus()
      const event = tabEvent(true)
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(preventDefault).toHaveBeenCalledOnce()
      expect(document.activeElement).toBe(container.querySelector('#last'))
    })

    it('lets Tab pass through when focus is mid-sequence', () => {
      const container = makeContainer(
        '<button id="first">A</button><button id="mid">B</button><button id="last">C</button>',
      )
      const { onKeydown } = useDialog({
        isOpen: ref(true),
        container: ref(container),
        onClose() {},
      })
      container.querySelector<HTMLButtonElement>('#mid')!.focus()
      const event = tabEvent()
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(preventDefault).not.toHaveBeenCalled()
      expect(document.activeElement).toBe(container.querySelector('#mid'))
    })

    it('prevents Tab when the dialog has no focusable elements', () => {
      const container = makeContainer('<p>nothing</p>')
      const { onKeydown } = useDialog({
        isOpen: ref(true),
        container: ref(container),
        onClose() {},
      })
      const event = tabEvent()
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(preventDefault).toHaveBeenCalledOnce()
    })

    it('treats a null container as having no focusable elements', () => {
      const { onKeydown } = useDialog({
        isOpen: ref(true),
        container: ref(null),
        onClose() {},
      })
      const event = tabEvent()
      const preventDefault = vi.spyOn(event, 'preventDefault')

      onKeydown(event)
      expect(preventDefault).toHaveBeenCalledOnce()
    })
  })
})
