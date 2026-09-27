import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BboxFields from './BboxFields.vue'

const PRISTINE = { west: 0, south: 0, east: 0, north: 0 }
const VALID = { west: -3.2, south: 54.3, east: -2.9, north: 54.6 }

function mountFields(bounds = VALID) {
  // attachTo: a real focus/blur cycle (used by the Enter-key test) only fires
  // jsdom's native blur() when the element is connected to the document.
  return mount(BboxFields, { props: { bounds }, attachTo: document.body })
}

function inputFor(wrapper: ReturnType<typeof mountFields>, label: string) {
  const field = wrapper.findAll('.oma-bbox-field').find((node) => node.text().startsWith(label))!
  return field.find('input')
}

describe('BboxFields', () => {
  it('renders all four fields pre-filled to five decimal places', () => {
    const wrapper = mountFields()
    expect((inputFor(wrapper, 'NORTH').element as HTMLInputElement).value).toBe('54.60000')
    expect((inputFor(wrapper, 'SOUTH').element as HTMLInputElement).value).toBe('54.30000')
    expect((inputFor(wrapper, 'EAST').element as HTMLInputElement).value).toBe('-2.90000')
    expect((inputFor(wrapper, 'WEST').element as HTMLInputElement).value).toBe('-3.20000')
  })

  it('does not reformat the text of a focused field while multi-digit typing is in progress', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('5')
    await north.setValue('54')
    await north.setValue('54.9')
    expect((north.element as HTMLInputElement).value).toBe('54.9')
  })

  it('emits update:bounds as soon as a typed value parses to a new number', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('55')
    expect(wrapper.emitted('update:bounds')).toEqual([[{ ...VALID, north: 55 }]])
  })

  it('does not emit again for a value that parses the same as the current bound', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue(String(VALID.north))
    expect(wrapper.emitted('update:bounds')).toBeUndefined()
  })

  it('does not emit while the typed text does not yet parse to a number', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('-')
    expect(wrapper.emitted('update:bounds')).toBeUndefined()
  })

  it('reformats to five decimal places on blur', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('55')
    await north.trigger('blur')
    expect((north.element as HTMLInputElement).value).toBe('55.00000')
  })

  it('commits and reformats on Enter (blurring the field)', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    // A real (not synthetic) focus is needed here: the Enter handler calls the
    // native `.blur()`, which jsdom only turns into a 'blur' event when the
    // element is genuinely the active element.
    ;(north.element as HTMLInputElement).focus()
    await north.setValue('55')
    await north.trigger('keydown.enter')
    expect((north.element as HTMLInputElement).value).toBe('55.00000')
  })

  it('reverts an unparseable draft back to the last good value on blur', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('not a number')
    await north.trigger('blur')
    expect((north.element as HTMLInputElement).value).toBe('54.60000')
    // Reverting must not have emitted a bogus update.
    expect(wrapper.emitted('update:bounds')).toBeUndefined()
  })

  it('reverts an empty draft back to the last good value on blur', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('')
    await north.trigger('blur')
    expect((north.element as HTMLInputElement).value).toBe('54.60000')
  })

  it('does not emit on blur when the reformatted value is unchanged from the current bound', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue(String(VALID.north))
    await north.trigger('blur')
    expect(wrapper.emitted('update:bounds')).toBeUndefined()
  })

  it('resyncs an unfocused field text when props.bounds changes', async () => {
    const wrapper = mountFields()
    await wrapper.setProps({ bounds: { ...VALID, north: 60 } })
    expect((inputFor(wrapper, 'NORTH').element as HTMLInputElement).value).toBe('60.00000')
  })

  it('does not resync the field the operator is currently typing in', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('12.3')
    await wrapper.setProps({ bounds: { ...VALID, north: 60 } })
    expect((north.element as HTMLInputElement).value).toBe('12.3')
  })

  it('renders an empty field for a non-finite bound rather than "NaN"/"Infinity"', () => {
    const wrapper = mountFields({ ...VALID, north: NaN })
    expect((inputFor(wrapper, 'NORTH').element as HTMLInputElement).value).toBe('')
  })

  it('reformats correctly on blur even without a preceding focus event (focusedField already null)', async () => {
    const wrapper = mountFields()
    const north = inputFor(wrapper, 'NORTH')
    await north.setValue('55') // no focus trigger first
    await north.trigger('blur')
    expect((north.element as HTMLInputElement).value).toBe('55.00000')
  })

  it('shows no errors and no aria-invalid for the pristine default box before any interaction', () => {
    const wrapper = mountFields(PRISTINE)
    expect(wrapper.find('.oma-bbox-error').exists()).toBe(false)
    for (const input of wrapper.findAll('input')) {
      expect(input.attributes('aria-invalid')).toBe('false')
      expect(input.attributes('aria-describedby')).toBeUndefined()
    }
  })

  it('shows a validation error and links it via aria-describedby once the operator interacts', async () => {
    const wrapper = mountFields(PRISTINE)
    const north = inputFor(wrapper, 'NORTH')
    await north.trigger('focus')
    await north.setValue('0')
    const errorParagraph = wrapper.find('.oma-bbox-error')
    expect(errorParagraph.exists()).toBe(true)
    expect(north.attributes('aria-invalid')).toBe('true')
    expect(north.attributes('aria-describedby')).toBe(errorParagraph.attributes('id'))
  })

  it('validates even before interaction once a real (non-degenerate) area exists', () => {
    const wrapper = mountFields({ west: -1, south: 90, east: 1, north: 95 })
    expect(wrapper.find('.oma-bbox-error').exists()).toBe(true)
  })

  it('has no accessibility violations, valid or with errors showing', async () => {
    const validWrapper = mountFields()
    expect(
      await axe(validWrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()

    const invalidWrapper = mountFields({ west: -1, south: 90, east: 1, north: 95 })
    expect(
      await axe(invalidWrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
