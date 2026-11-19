import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrAdhocSearchRow from './SdrAdhocSearchRow.vue'
import SdrStepPicker from './SdrStepPicker.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

interface RowProps {
  inputsDisabled?: boolean
  searching?: boolean
  playDisabled?: boolean
}

function mountRow(props: RowProps = {}) {
  return mount(SdrAdhocSearchRow, {
    props: {
      lowMhz: '144',
      highMhz: '146',
      stepKhz: '12.5',
      inputsDisabled: props.inputsDisabled ?? false,
      searching: props.searching ?? false,
      playDisabled: props.playDisabled ?? false,
    },
    attachTo: document.body,
  })
}

const lowInput = (wrapper: ReturnType<typeof mountRow>) =>
  wrapper.find('input[aria-label="Search range low frequency in MHz"]')
const highInput = (wrapper: ReturnType<typeof mountRow>) =>
  wrapper.find('input[aria-label="Search range high frequency in MHz"]')
const playButton = (wrapper: ReturnType<typeof mountRow>) => wrapper.find('.sdr-search-adhoc-play')

describe('SdrAdhocSearchRow — models', () => {
  it('shows the LOW and HIGH models in their inputs', () => {
    const wrapper = mountRow()
    expect((lowInput(wrapper).element as HTMLInputElement).value).toBe('144')
    expect((highInput(wrapper).element as HTMLInputElement).value).toBe('146')
  })

  // Vue casts a type="number" v-model to a number, as the inline inputs did.
  it('emits each model update from its own input', async () => {
    const wrapper = mountRow()
    await lowInput(wrapper).setValue('430')
    await highInput(wrapper).setValue('440')
    expect(wrapper.emitted('update:lowMhz')).toEqual([[430]])
    expect(wrapper.emitted('update:highMhz')).toEqual([[440]])
  })

  it('binds the step picker to the step model both ways', async () => {
    const wrapper = mountRow()
    const stepPicker = wrapper.findComponent(SdrStepPicker)
    expect(stepPicker.props('modelValue')).toBe('12.5')
    stepPicker.vm.$emit('update:modelValue', '25')
    expect(wrapper.emitted('update:stepKhz')).toEqual([['25']])
  })
})

describe('SdrAdhocSearchRow — states', () => {
  it('locks the inputs and step picker when inputsDisabled', () => {
    const wrapper = mountRow({ inputsDisabled: true })
    expect(lowInput(wrapper).attributes('disabled')).toBeDefined()
    expect(highInput(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.findComponent(SdrStepPicker).props('disabled')).toBe(true)
    expect(playButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('locks only the play button when playDisabled', () => {
    const wrapper = mountRow({ playDisabled: true })
    expect(playButton(wrapper).attributes('disabled')).toBeDefined()
    expect(lowInput(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('names the button Start search while idle and Stop search while searching', () => {
    expect(playButton(mountRow()).attributes('aria-label')).toBe('Start search')
    expect(playButton(mountRow({ searching: true })).attributes('aria-label')).toBe('Stop search')
  })

  it('emits toggleSearch when the play button is clicked', async () => {
    const wrapper = mountRow()
    await playButton(wrapper).trigger('click')
    expect(wrapper.emitted('toggleSearch')).toHaveLength(1)
  })
})

describe('SdrAdhocSearchRow — accessibility', () => {
  it('has no axe violations idle and searching', async () => {
    expect(await axe(mountRow().html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountRow({ searching: true }).html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
