import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { axe } from 'jest-axe'
import SdrRangeForm from './SdrRangeForm.vue'
import SdrStepPicker from './SdrStepPicker.vue'
import { SEARCH_MODES, blankRangeEditor, type RangeEditorState } from './sdrRangeEditor'

enableAutoUnmount(afterEach)

// A lone form has no page landmarks around it, as in the repo's other component specs.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

afterEach(() => {
  document.querySelectorAll('.sdr-step-menu').forEach((node) => node.remove())
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function mountForm(overrides: Partial<RangeEditorState> = {}, error = '') {
  // reactive(), as the tab's ref() makes it, so in-place edits re-render.
  const editor = reactive({ ...blankRangeEditor(), ...overrides })
  const wrapper: VueWrapper = mount(SdrRangeForm, {
    props: { modelValue: editor, error },
    attachTo: document.body,
  })
  return { wrapper, editor }
}

function inputByLabel(wrapper: VueWrapper, accessibleName: string) {
  return wrapper.find(`[aria-label="${accessibleName}"]`)
}

function modePills(wrapper: VueWrapper) {
  return wrapper.findAll('.sdr-mode-pills .sdr-mode-pill')
}

// =============================================================================
describe('SdrRangeForm — fields', () => {
  it('shows the bound state in every field', () => {
    const { wrapper } = mountForm({
      label: 'Air Band',
      low_mhz: '118',
      high_mhz: '137',
      step_khz: '25',
      dwell_ms: '300',
      threshold_dbfs: '-65',
      notes: 'busy',
    })
    expect((inputByLabel(wrapper, 'Range label').element as HTMLInputElement).value).toBe(
      'Air Band',
    )
    expect(
      (inputByLabel(wrapper, 'Range low frequency in MHz').element as HTMLInputElement).value,
    ).toBe('118')
    expect(
      (inputByLabel(wrapper, 'Range high frequency in MHz').element as HTMLInputElement).value,
    ).toBe('137')
    expect(
      (inputByLabel(wrapper, 'Dwell time in milliseconds').element as HTMLInputElement).value,
    ).toBe('300')
    expect((inputByLabel(wrapper, 'Threshold in dBFS').element as HTMLInputElement).value).toBe(
      '-65',
    )
    expect((inputByLabel(wrapper, 'Range notes').element as HTMLTextAreaElement).value).toBe('busy')
    expect(wrapper.findComponent(SdrStepPicker).props('modelValue')).toBe('25')
  })

  it('writes every edit back into the bound state', async () => {
    const { wrapper, editor } = mountForm()
    await inputByLabel(wrapper, 'Range label').setValue('UHF CB')
    await inputByLabel(wrapper, 'Range low frequency in MHz').setValue('476.4')
    await inputByLabel(wrapper, 'Range high frequency in MHz').setValue('477.4')
    await inputByLabel(wrapper, 'Dwell time in milliseconds').setValue('500')
    await inputByLabel(wrapper, 'Threshold in dBFS').setValue('-60')
    await inputByLabel(wrapper, 'Range notes').setValue('weekends')
    wrapper.findComponent(SdrStepPicker).vm.$emit('update:modelValue', '8.33')
    expect(editor.label).toBe('UHF CB')
    // Number inputs hand v-model a number; the tab parses either form on save.
    expect(String(editor.low_mhz)).toBe('476.4')
    expect(String(editor.high_mhz)).toBe('477.4')
    expect(String(editor.dwell_ms)).toBe('500')
    expect(String(editor.threshold_dbfs)).toBe('-60')
    expect(editor.notes).toBe('weekends')
    expect(editor.step_khz).toBe('8.33')
  })
})

describe('SdrRangeForm — mode', () => {
  it('renders one radio per search mode with the bound one checked', () => {
    const { wrapper } = mountForm({ mode: 'AM' })
    const pills = modePills(wrapper)
    expect(pills.map((pill) => pill.text())).toEqual(SEARCH_MODES)
    const checked = pills.filter((pill) => pill.attributes('aria-checked') === 'true')
    expect(checked.map((pill) => pill.text())).toEqual(['AM'])
    expect(checked[0]!.attributes('tabindex')).toBe('0')
    expect(pills[1]!.attributes('tabindex')).toBe('-1')
  })

  it('sets the mode when a pill is clicked', async () => {
    const { wrapper, editor } = mountForm()
    await modePills(wrapper)
      .find((pill) => pill.text() === 'CW')!
      .trigger('click')
    expect(editor.mode).toBe('CW')
  })

  it('moves the choice with the arrow keys, wrapping at the ends', async () => {
    const { wrapper, editor } = mountForm({ mode: 'NFM' })
    await modePills(wrapper)[1]!.trigger('keydown', { key: 'ArrowRight' })
    expect(editor.mode).toBe('WFM')
    await modePills(wrapper)[2]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(editor.mode).toBe('NFM')
    editor.mode = 'AM'
    await modePills(wrapper)[0]!.trigger('keydown', { key: 'ArrowLeft' })
    expect(editor.mode).toBe('CW')
  })
})

describe('SdrRangeForm — error', () => {
  it('shows no error line when the error is empty', () => {
    const { wrapper } = mountForm()
    expect(wrapper.find('.sdr-field-error').exists()).toBe(false)
  })

  it('shows the error above the buttons', () => {
    const { wrapper } = mountForm({}, 'High must be above low')
    const errorLine = wrapper.find('.sdr-field-error')
    expect(errorLine.text()).toBe('High must be above low')
    expect(errorLine.element.nextElementSibling?.classList).toContain('sdr-editfreq-actions')
  })
})

describe('SdrRangeForm — actions', () => {
  it('emits save, and nothing else, when SAVE is pressed', async () => {
    const { wrapper } = mountForm()
    await wrapper.find('.sdr-editfreq-save-btn').trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('emits cancel, and nothing else, when CANCEL is pressed', async () => {
    const { wrapper } = mountForm()
    await wrapper
      .findAll('.sdr-editfreq-actions button')
      .find((button) => button.text() === 'CANCEL')!
      .trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })
})

describe('SdrRangeForm — accessibility', () => {
  it('has no axe violations, with or without an error', async () => {
    const withoutError = mountForm().wrapper
    expect(
      await axe(withoutError.element.parentElement as HTMLElement, AXE_OPTIONS),
    ).toHaveNoViolations()
    withoutError.unmount()
    const withError = mountForm({}, 'Save failed').wrapper
    expect(
      await axe(withError.element.parentElement as HTMLElement, AXE_OPTIONS),
    ).toHaveNoViolations()
  })

  it('exposes the MODE pills as a named radio group', () => {
    const { wrapper } = mountForm()
    const radioGroup = wrapper.find('[role="radiogroup"]')
    expect(radioGroup.attributes('aria-label')).toBe('Demodulation mode')
    expect(radioGroup.findAll('[role="radio"]')).toHaveLength(SEARCH_MODES.length)
  })
})
