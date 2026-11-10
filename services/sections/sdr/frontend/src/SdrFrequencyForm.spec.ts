import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { reactive } from 'vue'
import { axe } from 'jest-axe'
import SdrFrequencyForm from './SdrFrequencyForm.vue'
import SdrSampleRatePicker from './SdrSampleRatePicker.vue'
import { MODES } from './sdrPanelUtils'
import type { FrequencyEditorErrors, FrequencyEditorState } from './sdrFrequencyEditor'
import type { SdrFrequencyGroup } from './stores/sdr'

enableAutoUnmount(afterEach)

// A lone form has no page landmarks around it, as in the repo's other component specs.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

afterEach(() => {
  document.querySelectorAll('.sdr-device-menu').forEach((node) => node.remove())
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeEditorState(overrides: Partial<FrequencyEditorState> = {}): FrequencyEditorState {
  // reactive(), as the tab's ref() makes it, so in-place edits re-render.
  return reactive({
    label: 'Tower',
    frequencyMhz: '118.3800',
    mode: 'AM',
    groupIds: [],
    notes: 'ground control',
    gainDb: '28',
    gainAuto: false,
    bandwidthKhz: '12',
    squelchDbfs: '-55',
    volumePercent: '70',
    sampleRateHz: 1536000,
    zoom: '2',
    waterfallMinDb: '-100',
    waterfallMaxDb: '-20',
    ...overrides,
  })
}

const GROUPS: SdrFrequencyGroup[] = [
  { id: 1, name: 'Airband', slug: 'airband', color: '#c8ff00', sort_order: 0 },
  { id: 2, name: 'Marine', slug: 'marine', color: '#00c8ff', sort_order: 1 },
]

interface MountOptions {
  editor?: FrequencyEditorState
  errors?: FrequencyEditorErrors
  idPrefix?: string
  settingsExpanded?: boolean
  groups?: SdrFrequencyGroup[]
}

function mountForm(options: MountOptions = {}) {
  const editor = options.editor ?? makeEditorState()
  const wrapper: VueWrapper = mount(SdrFrequencyForm, {
    props: {
      modelValue: editor,
      settingsExpanded: options.settingsExpanded ?? false,
      'onUpdate:settingsExpanded': (expanded: boolean) =>
        wrapper.setProps({ settingsExpanded: expanded }),
      groups: options.groups ?? GROUPS,
      errors: options.errors ?? {},
      ...(options.idPrefix === undefined ? {} : { idPrefix: options.idPrefix }),
    },
    attachTo: document.body,
  })
  return { wrapper, editor }
}

function inputByLabel(wrapper: VueWrapper, accessibleName: string) {
  return wrapper.find(`[aria-label="${accessibleName}"]`)
}

function groupPills(wrapper: VueWrapper) {
  return wrapper.findAll('.sdr-ef-gpill')
}

function modePills(wrapper: VueWrapper) {
  return wrapper.findAll('.sdr-mode-pills .sdr-mode-pill')
}

// =============================================================================
describe('SdrFrequencyForm — ids', () => {
  it('gives every addressable control a prefixed id when idPrefix is set', () => {
    const { wrapper } = mountForm({ idPrefix: 'sdr-ef' })
    for (const controlName of [
      'label',
      'freq',
      'mode-pills',
      'groups',
      'notes',
      'cancel',
      'save',
    ]) {
      expect(wrapper.find(`#sdr-ef-${controlName}`).exists(), controlName).toBe(true)
    }
  })

  it('renders no prefixed ids without a prefix, only generated ones the labels need', () => {
    const { wrapper } = mountForm()
    expect(wrapper.find('[id^="undefined"]').exists()).toBe(false)
    for (const controlName of [
      'label',
      'freq',
      'mode-pills',
      'groups',
      'notes',
      'cancel',
      'save',
    ]) {
      expect(wrapper.find(`#sdr-ef-${controlName}`).exists(), controlName).toBe(false)
    }
    expect(inputByLabel(wrapper, 'Frequency label').attributes('id')).toMatch(/^ba-form-field-/)
    expect(wrapper.find('.sdr-editfreq-save-btn').attributes('id')).toBeUndefined()
  })

  it('treats an empty prefix as no prefix', () => {
    const { wrapper } = mountForm({ idPrefix: '' })
    expect(wrapper.find('[id^="-"]').exists()).toBe(false)
    expect(inputByLabel(wrapper, 'Frequency label').attributes('id')).toMatch(/^ba-form-field-/)
  })
})

describe('SdrFrequencyForm — fields', () => {
  it('shows the bound state in the text fields', () => {
    const { wrapper } = mountForm()
    expect((inputByLabel(wrapper, 'Frequency label').element as HTMLInputElement).value).toBe(
      'Tower',
    )
    expect((inputByLabel(wrapper, 'Frequency in MHz').element as HTMLInputElement).value).toBe(
      '118.3800',
    )
    expect((inputByLabel(wrapper, 'Frequency notes').element as HTMLTextAreaElement).value).toBe(
      'ground control',
    )
  })

  it('writes typed text back into the bound state', async () => {
    const { wrapper, editor } = mountForm()
    await inputByLabel(wrapper, 'Frequency label').setValue('Approach')
    await inputByLabel(wrapper, 'Frequency in MHz').setValue('119.1')
    await inputByLabel(wrapper, 'Frequency notes').setValue('north side')
    expect(editor.label).toBe('Approach')
    expect(editor.frequencyMhz).toBe('119.1')
    expect(editor.notes).toBe('north side')
  })
})

/** The controls marked invalid: text fields by BaseTextField, the MODE pills by the form. */
function markedInvalid(wrapper: ReturnType<typeof mountForm>['wrapper']) {
  return wrapper.findAll('.ba-text-field__input--invalid, .sdr-mode-pills.sdr-input-error')
}

describe('SdrFrequencyForm — errors', () => {
  it('renders no error messages or error styles when every field is valid', () => {
    const { wrapper } = mountForm()
    expect(wrapper.findAll('.ba-form-field__error')).toHaveLength(0)
    expect(markedInvalid(wrapper)).toHaveLength(0)
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false)
  })

  it('shows each field’s message under it and marks the field', () => {
    const { wrapper } = mountForm({
      idPrefix: 'sdr-ef',
      errors: {
        label: 'Label required',
        freq: 'Bad frequency',
        mode: 'Unknown mode',
        notes: 'Bad characters',
      },
    })
    expect(wrapper.findAll('.ba-form-field__error').map((message) => message.text())).toEqual([
      'Label required',
      'Bad frequency',
      'Unknown mode',
      'Bad characters',
    ])
    expect(markedInvalid(wrapper).map((marked) => marked.attributes('id'))).toEqual([
      'sdr-ef-label',
      'sdr-ef-freq',
      'sdr-ef-mode-pills',
      'sdr-ef-notes',
    ])
  })

  it.each([
    ['label', 'label'],
    ['freq', 'freq'],
    ['mode', 'mode-pills'],
    ['notes', 'notes'],
  ] as const)('shows a %s message alone, under its own field only', (field, controlName) => {
    const { wrapper } = mountForm({ idPrefix: 'sdr-ef', errors: { [field]: 'Invalid' } })
    const messages = wrapper.findAll('.ba-form-field__error')
    expect(messages).toHaveLength(1)
    const control = wrapper.get(`#sdr-ef-${controlName}`)
    // The message sits in the same field wrapper as the control it is about,
    // and the control names it as its description.
    expect(messages[0]!.element.parentElement).toBe(control.element.closest('.ba-form-field'))
    expect(control.attributes('aria-describedby')).toBe(messages[0]!.attributes('id'))
    expect(markedInvalid(wrapper).map((marked) => marked.attributes('id'))).toEqual([
      `sdr-ef-${controlName}`,
    ])
  })
})

describe('SdrFrequencyForm — mode', () => {
  it('renders one radio per mode with the bound one checked', () => {
    const { wrapper } = mountForm({ editor: makeEditorState({ mode: 'NFM' }) })
    const pills = modePills(wrapper)
    expect(pills.map((pill) => pill.text())).toEqual([...MODES])
    const checked = pills.filter((pill) => pill.attributes('aria-checked') === 'true')
    expect(checked.map((pill) => pill.text())).toEqual(['NFM'])
    expect(checked[0]!.attributes('tabindex')).toBe('0')
  })

  it('sets the mode when a pill is clicked', async () => {
    const { wrapper, editor } = mountForm()
    await modePills(wrapper)
      .find((pill) => pill.text() === 'USB')!
      .trigger('click')
    expect(editor.mode).toBe('USB')
  })

  it('moves the choice to the next mode with ArrowRight', async () => {
    const { wrapper, editor } = mountForm({ editor: makeEditorState({ mode: MODES[0] }) })
    await modePills(wrapper)[0]!.trigger('keydown', { key: 'ArrowRight' })
    expect(editor.mode).toBe(MODES[1])
  })

  it('keeps the first pill tabbable when the bound mode is not one of the options', () => {
    const { wrapper } = mountForm({ editor: makeEditorState({ mode: 'LEGACY' }) })
    const pills = modePills(wrapper)
    expect(pills.some((pill) => pill.attributes('aria-checked') === 'true')).toBe(false)
    expect(pills[0]!.attributes('tabindex')).toBe('0')
  })
})

describe('SdrFrequencyForm — groups', () => {
  it('shows Default first, then one pill per group, Default pressed when in no group', () => {
    const { wrapper } = mountForm()
    const pills = groupPills(wrapper)
    expect(pills.map((pill) => pill.text())).toEqual(['Default', 'Airband', 'Marine'])
    expect(pills.map((pill) => pill.attributes('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('renders only Default when there are no groups', () => {
    const { wrapper } = mountForm({ groups: [] })
    expect(groupPills(wrapper).map((pill) => pill.text())).toEqual(['Default'])
  })

  it('adds a group on its first click and takes it off on the second', async () => {
    const { wrapper, editor } = mountForm()
    await groupPills(wrapper)[2]!.trigger('click')
    expect(editor.groupIds).toEqual([2])
    expect(groupPills(wrapper)[0]!.attributes('aria-pressed')).toBe('false')
    expect(groupPills(wrapper)[2]!.attributes('aria-pressed')).toBe('true')
    await groupPills(wrapper)[1]!.trigger('click')
    expect(editor.groupIds).toEqual([2, 1])
    await groupPills(wrapper)[2]!.trigger('click')
    expect(editor.groupIds).toEqual([1])
  })

  it('clears every group when Default is clicked', async () => {
    const { wrapper, editor } = mountForm({ editor: makeEditorState({ groupIds: [1, 2] }) })
    await groupPills(wrapper)[0]!.trigger('click')
    expect(editor.groupIds).toEqual([])
    expect(groupPills(wrapper)[0]!.attributes('aria-pressed')).toBe('true')
  })
})

describe('SdrFrequencyForm — RADIO SETTINGS', () => {
  it('starts closed or open as the settingsExpanded model says', () => {
    expect(
      mountForm({ settingsExpanded: false }).wrapper.find('#sdr-ef-settings-section').isVisible(),
    ).toBe(false)
    expect(
      mountForm({ settingsExpanded: true }).wrapper.find('#sdr-ef-settings-section').isVisible(),
    ).toBe(true)
  })

  it('reports the open state through update:settingsExpanded when toggled', async () => {
    const { wrapper } = mountForm()
    await wrapper.find('.base-accordion-toggle--form').trigger('click')
    expect(wrapper.emitted('update:settingsExpanded')).toEqual([[true]])
    expect(wrapper.find('#sdr-ef-settings-section').isVisible()).toBe(true)
    await wrapper.find('.base-accordion-toggle--form').trigger('click')
    expect(wrapper.emitted('update:settingsExpanded')).toEqual([[true], [false]])
  })

  it('shows and writes back every numeric setting', async () => {
    const { wrapper, editor } = mountForm({ settingsExpanded: true })
    const settings: Array<[string, keyof FrequencyEditorState, string, string]> = [
      ['RF gain in dB', 'gainDb', '28', '31.5'],
      ['Demod bandwidth in kHz', 'bandwidthKhz', '12', '25'],
      ['Squelch threshold in dBFS', 'squelchDbfs', '-55', '-40'],
      ['Volume percent', 'volumePercent', '70', '35'],
      ['Waterfall zoom', 'zoom', '2', '4'],
      ['Waterfall minimum dB', 'waterfallMinDb', '-100', '-90'],
      ['Waterfall maximum dB', 'waterfallMaxDb', '-20', '-10'],
    ]
    for (const [accessibleName, field, shown, typed] of settings) {
      const input = inputByLabel(wrapper, accessibleName)
      expect((input.element as HTMLInputElement).value, accessibleName).toBe(shown)
      await input.setValue(typed)
      // Number inputs hand v-model a number; the tab parses either form on save.
      expect(String(editor[field]), accessibleName).toBe(typed)
    }
  })

  it('flips AGC with the switch and disables manual gain while it is on', async () => {
    const { wrapper, editor } = mountForm({ settingsExpanded: true })
    const agcSwitch = wrapper.find('[role="switch"]')
    expect(agcSwitch.attributes('aria-checked')).toBe('false')
    expect(inputByLabel(wrapper, 'RF gain in dB').attributes('disabled')).toBeUndefined()
    await agcSwitch.trigger('click')
    expect(editor.gainAuto).toBe(true)
    expect(agcSwitch.attributes('aria-checked')).toBe('true')
    expect(agcSwitch.classes()).toContain('is-on')
    expect(inputByLabel(wrapper, 'RF gain in dB').attributes('disabled')).toBeDefined()
    await agcSwitch.trigger('click')
    expect(editor.gainAuto).toBe(false)
  })

  it('passes the sample rate to the picker and stores the one it picks', async () => {
    const { wrapper, editor } = mountForm({ settingsExpanded: true })
    const picker = wrapper.findComponent(SdrSampleRatePicker)
    expect(picker.props('modelValue')).toBe(1536000)
    picker.vm.$emit('update:modelValue', 2048000)
    expect(editor.sampleRateHz).toBe(2048000)
  })
})

describe('SdrFrequencyForm — actions', () => {
  it('emits save, and nothing else, when SAVE is pressed', async () => {
    const { wrapper } = mountForm()
    await wrapper.find('.sdr-editfreq-save-btn').trigger('click')
    expect(wrapper.emitted('save')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('emits cancel, and nothing else, when CANCEL is pressed', async () => {
    const { wrapper } = mountForm({ idPrefix: 'sdr-ef' })
    await wrapper.find('#sdr-ef-cancel').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
  })

  it('focusLabel puts the cursor in LABEL', () => {
    const { wrapper } = mountForm()
    ;(wrapper.vm as unknown as { focusLabel(): void }).focusLabel()
    expect(document.activeElement).toBe(inputByLabel(wrapper, 'Frequency label').element)
  })
})

describe('SdrFrequencyForm — accessibility', () => {
  it('has no axe violations with settings open and every error shown', async () => {
    const { wrapper } = mountForm({
      idPrefix: 'sdr-ef',
      settingsExpanded: true,
      errors: { label: 'Label required', freq: 'Bad', mode: 'Unknown', notes: 'Bad' },
    })
    expect(
      await axe(wrapper.element.parentElement as HTMLElement, AXE_OPTIONS),
    ).toHaveNoViolations()
  })

  it('names every control so it can be found by role', () => {
    const { wrapper } = mountForm({ settingsExpanded: true })
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Demodulation mode')
    expect(wrapper.find('[role="switch"]').attributes('aria-label')).toBe('Auto gain (AGC)')
    expect(wrapper.find('.base-accordion-toggle--form').attributes('aria-controls')).toBe(
      'sdr-ef-settings-section',
    )
  })
})
