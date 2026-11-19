import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrRecordingsFilter from './SdrRecordingsFilter.vue'

enableAutoUnmount(afterEach)

// A fragment, not a page: the landmark comes from the shell around it.
const AXE_OPTIONS = { rules: { region: { enabled: false } } }

function mountFilter(modelValue = '') {
  return mount(SdrRecordingsFilter, { props: { modelValue }, attachTo: document.body })
}

describe('SdrRecordingsFilter', () => {
  it('shows the filter text in a named, unassisted text input', () => {
    const input = mountFilter('tower').find('input')
    expect((input.element as HTMLInputElement).value).toBe('tower')
    expect(input.attributes('aria-label')).toBe('Filter recordings by notes or mode')
    expect(input.attributes('placeholder')).toBe('NOTES · MODE')
    expect(input.attributes('autocomplete')).toBe('off')
    expect(input.attributes('spellcheck')).toBe('false')
  })

  it('emits update:modelValue as the operator types', async () => {
    const wrapper = mountFilter()
    await wrapper.find('input').setValue('marine')
    expect(wrapper.emitted('update:modelValue')).toEqual([['marine']])
  })

  it('hides the clear button while the filter is empty', () => {
    expect(mountFilter('').find('.sdr-recordings-search-clear').exists()).toBe(false)
  })

  it('shows a named clear button that empties the filter', async () => {
    const wrapper = mountFilter('tower')
    const clear = wrapper.find('.sdr-recordings-search-clear')
    expect(clear.attributes('aria-label')).toBe('Clear filter')
    await clear.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['']])
  })

  it('has no axe violations, empty or filtered', async () => {
    expect(await axe(mountFilter('').html(), AXE_OPTIONS)).toHaveNoViolations()
    expect(await axe(mountFilter('tower').html(), AXE_OPTIONS)).toHaveNoViolations()
  })
})
