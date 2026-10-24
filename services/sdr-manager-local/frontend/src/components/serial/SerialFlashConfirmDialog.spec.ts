import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SerialFlashConfirmDialog from './SerialFlashConfirmDialog.vue'

const PROPS = { serial: 'ROOF-01', deviceName: 'Roof', idPrefix: 'flash-test' }

let showModal: ReturnType<typeof vi.fn>
let closeDialog: ReturnType<typeof vi.fn>
const mounted: VueWrapper[] = []

function mountDialog(attachTo: HTMLElement = document.body): VueWrapper {
  const wrapper = mount(SerialFlashConfirmDialog, { props: PROPS, attachTo })
  mounted.push(wrapper)
  return wrapper
}

function byText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((candidate) => candidate.text() === text)!
}

describe('SerialFlashConfirmDialog', () => {
  beforeEach(() => {
    // jsdom has no <dialog> modal behaviour; these stand in for the browser's.
    showModal = vi.fn()
    closeDialog = vi.fn()
    HTMLDialogElement.prototype.showModal = showModal as unknown as () => void
    HTMLDialogElement.prototype.close = closeDialog as unknown as () => void
  })
  afterEach(() => {
    while (mounted.length > 0) mounted.pop()!.unmount()
    document.body.innerHTML = ''
  })

  it('opens as a modal dialog when it mounts', () => {
    mountDialog()
    expect(showModal).toHaveBeenCalledTimes(1)
  })

  it('names the serial and the device, and warns the write is permanent', () => {
    const wrapper = mountDialog()
    expect(wrapper.get('h3').text()).toBe('WRITE SERIAL ROOF-01?')
    expect(wrapper.get('p').text()).toContain(
      'writes permanently to Roof’s EEPROM and cannot be undone',
    )
  })

  it('is labelled and described by its heading and body', () => {
    const wrapper = mountDialog()
    const dialog = wrapper.get('dialog')
    expect(dialog.attributes('aria-labelledby')).toBe('flash-test-confirm-heading')
    expect(dialog.attributes('aria-describedby')).toBe('flash-test-confirm-body')
    expect(wrapper.get('#flash-test-confirm-heading').element.tagName).toBe('H3')
    expect(wrapper.get('#flash-test-confirm-body').element.tagName).toBe('P')
  })

  it('starts focus on CANCEL, the safe choice', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(document.activeElement).toBe(byText(wrapper, 'CANCEL').element)
  })

  it('emits cancel from CANCEL and confirm from WRITE SERIAL, and not the other way round', async () => {
    const wrapper = mountDialog()
    await byText(wrapper, 'CANCEL').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await byText(wrapper, 'WRITE SERIAL').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('turns the browser’s own cancel (Escape) into a cancel event and keeps the dialog from closing itself', async () => {
    const wrapper = mountDialog()
    const cancelEvent = new Event('cancel', { cancelable: true })
    wrapper.get('dialog').element.dispatchEvent(cancelEvent)
    expect(cancelEvent.defaultPrevented).toBe(true)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('stops keys at the dialog so Escape does not reach the Settings panel around it', async () => {
    const outerKeydown = vi.fn()
    const outer = document.createElement('div')
    outer.addEventListener('keydown', outerKeydown)
    document.body.append(outer)
    const wrapper = mountDialog(outer)
    byText(wrapper, 'CANCEL').element.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    wrapper
      .get('h3')
      .element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    expect(outerKeydown).not.toHaveBeenCalled()
  })

  it('closes and hands focus back to whatever opened it when it goes away', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const wrapper = mountDialog()
    await flushPromises()
    expect(document.activeElement).not.toBe(opener)
    wrapper.unmount()
    mounted.pop()
    expect(closeDialog).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(opener)
  })

  it('has nowhere to return focus to when nothing at all was focused', () => {
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(null)
    const wrapper = mountDialog()
    expect(() => {
      wrapper.unmount()
      mounted.pop()
    }).not.toThrow()
    expect(closeDialog).toHaveBeenCalledTimes(1)
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountDialog()
    // Opened by hand: jsdom does not apply showModal's `open` attribute.
    const markup = wrapper.html().replace('<dialog', '<dialog open')
    expect(await axe(markup, { rules: { region: { enabled: false } } })).toHaveNoViolations()
  })
})
