import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'
import BaseInlineConfirm from './BaseInlineConfirm.vue'

let mounted: VueWrapper | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

function mountConfirm(props: Record<string, unknown> = {}) {
  mounted = mount(BaseInlineConfirm, {
    props: { label: 'DELETE?', ...props },
    attachTo: document.body,
  })
  return mounted
}

const buttons = (wrapper: VueWrapper) => wrapper.findAll('button')

describe('BaseInlineConfirm', () => {
  it('shows the question and YES / NO buttons by default', () => {
    const wrapper = mountConfirm()
    expect(wrapper.get('.base-inline-confirm-label').text()).toBe('DELETE?')
    const [confirm, cancel] = buttons(wrapper)
    expect(confirm!.text()).toBe('YES')
    expect(confirm!.attributes('type')).toBe('button')
    expect(confirm!.classes()).toContain('base-inline-confirm-btn--confirm')
    expect(cancel!.text()).toBe('NO')
    expect(cancel!.attributes('type')).toBe('button')
    expect(cancel!.classes()).not.toContain('base-inline-confirm-btn--confirm')
  })

  it('uses custom button text', () => {
    const wrapper = mountConfirm({ label: 'FORGET?', confirmText: 'FORGET', cancelText: 'KEEP' })
    expect(buttons(wrapper).map((button) => button.text())).toEqual(['FORGET', 'KEEP'])
  })

  it('emits confirm from the confirming button and cancel from the other', async () => {
    const wrapper = mountConfirm()
    const [confirm, cancel] = buttons(wrapper)
    await confirm!.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
    await cancel!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toHaveLength(1)
  })

  it('names the buttons from their text unless accessible names are given', () => {
    const plain = mountConfirm()
    for (const button of buttons(plain)) expect(button.attributes('aria-label')).toBeUndefined()
    plain.unmount()
    mounted = null
    const named = mountConfirm({
      confirmAccessibleName: 'Remove Kitchen from radios',
      cancelAccessibleName: 'Keep Kitchen',
    })
    const [confirm, cancel] = buttons(named)
    expect(confirm!.attributes('aria-label')).toBe('Remove Kitchen from radios')
    expect(cancel!.attributes('aria-label')).toBe('Keep Kitchen')
  })

  it('moves focus to NO when it appears with initialFocus="cancel"', async () => {
    const wrapper = mountConfirm({ initialFocus: 'cancel' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(buttons(wrapper)[1]!.element)
  })

  it('moves focus to YES when it appears with initialFocus="confirm"', async () => {
    const wrapper = mountConfirm({ initialFocus: 'confirm' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(buttons(wrapper)[0]!.element)
  })

  it('leaves focus where it was without initialFocus', async () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    mountConfirm()
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('has no axe violations', async () => {
    const wrapper = mountConfirm({ confirmAccessibleName: 'Delete Lake District' })
    expect(await axe(wrapper.element)).toHaveNoViolations()
  })
})
