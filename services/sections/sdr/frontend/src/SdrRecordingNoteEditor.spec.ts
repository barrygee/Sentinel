import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingNoteEditor from './SdrRecordingNoteEditor.vue'

enableAutoUnmount(afterEach)

const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountEditor(props: { modelValue?: string; focusOnMount?: boolean } = {}) {
  return mount(SdrRecordingNoteEditor, {
    props: { modelValue: props.modelValue ?? '', focusOnMount: props.focusOnMount ?? false },
    attachTo: document.body,
  })
}

describe('SdrRecordingNoteEditor — the note input', () => {
  it('shows the draft in a named two-row textarea capped at 250 characters', () => {
    const textarea = mountEditor({ modelValue: 'draft' }).find('textarea')
    expect((textarea.element as HTMLTextAreaElement).value).toBe('draft')
    expect(textarea.attributes('aria-label')).toBe('Recording note')
    expect(textarea.attributes('rows')).toBe('2')
    expect(textarea.attributes('maxlength')).toBe('250')
    expect(textarea.attributes('placeholder')).toBe('Add a note…')
  })

  it('emits update:modelValue as the operator types', async () => {
    const wrapper = mountEditor()
    await wrapper.find('textarea').setValue('new note')
    expect(wrapper.emitted('update:modelValue')).toEqual([['new note']])
  })

  it('captions the input NOTES only while the draft has text', () => {
    expect(mountEditor({ modelValue: 'n' }).find('.sdr-recording-note-label').exists()).toBe(true)
    expect(mountEditor({ modelValue: '' }).find('.sdr-recording-note-label').exists()).toBe(false)
    expect(mountEditor({ modelValue: '   ' }).find('.sdr-recording-note-label').exists()).toBe(
      false,
    )
  })

  it('closes on Escape', async () => {
    const wrapper = mountEditor()
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('does not close on other keys', async () => {
    const wrapper = mountEditor()
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('close')).toBeUndefined()
  })
})

describe('SdrRecordingNoteEditor — focus', () => {
  it('focuses the input on mount when asked, and reports it', () => {
    const wrapper = mountEditor({ focusOnMount: true })
    expect(document.activeElement).toBe(wrapper.find('textarea').element)
    expect(wrapper.emitted('focused')).toHaveLength(1)
  })

  it('leaves focus alone on a mount that did not ask (a filtered row coming back)', () => {
    const elsewhere = document.createElement('input')
    document.body.append(elsewhere)
    elsewhere.focus()
    const wrapper = mountEditor({ focusOnMount: false })
    expect(document.activeElement).toBe(elsewhere)
    expect(wrapper.emitted('focused')).toBeUndefined()
    elsewhere.remove()
  })
})

describe('SdrRecordingNoteEditor — buttons', () => {
  it('emits close from CANCEL and save from SAVE', async () => {
    const wrapper = mountEditor()
    await wrapper.find('.sdr-recording-edit-cancel').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
    await wrapper.find('.sdr-recording-edit-save').trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
  })

  it('keeps its clicks (buttons and panel) from reaching the row', async () => {
    const parentClicks: string[] = []
    const wrapper = mountEditor()
    wrapper.element.parentElement!.addEventListener('click', () => parentClicks.push('parent'))
    await wrapper.find('.sdr-recording-edit-cancel').trigger('click')
    await wrapper.find('.sdr-recording-edit-save').trigger('click')
    await wrapper.find('textarea').trigger('click')
    expect(parentClicks).toEqual([])
  })

  it('has no axe violations, empty or with a draft', async () => {
    expect(await axe(mountEditor().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountEditor({ modelValue: 'n' }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
