import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import DepthPicker from './DepthPicker.vue'

function mountPicker(modelValue: number, terrainMaxZoom = 12) {
  return mount(DepthPicker, {
    props: { modelValue, minZoom: 6, maxZoom: 14, terrainMaxZoom },
  })
}

describe('DepthPicker', () => {
  it.each([
    [14, 'z14 · building level'],
    [12, 'z12 · street level'],
    [10, 'z10 · town level'],
    [8, 'z8 · city level'],
    [6, 'z6 · region level'],
  ])('labels zoom %i as "%s"', (zoom, expectedReadout) => {
    const wrapper = mountPicker(zoom)
    expect(wrapper.text()).toContain(expectedReadout)
  })

  it('emits update:modelValue with the new numeric zoom on slider input', async () => {
    const wrapper = mountPicker(10)
    await wrapper.find('input[type="range"]').setValue('12')
    expect(wrapper.emitted('update:modelValue')).toEqual([[12]])
  })

  it('shows the terrain-ceiling note only once the depth exceeds terrainMaxZoom', async () => {
    const wrapper = mountPicker(12, 12)
    expect(wrapper.find('.oma-depth-terrain-note').exists()).toBe(false)
    await wrapper.setProps({ modelValue: 14 })
    expect(wrapper.find('.oma-depth-terrain-note').text()).toContain('z12')
  })

  it('falls back to "region level" for a depth outside every labelled band (defensive default)', () => {
    // The lowest labelled band covers zoom >= 0; a negative zoom isn't
    // clamp-produceable in practice (the store clamps to 6-14), but the
    // component itself does not enforce that, so exercise the fallback
    // directly rather than leaving it an untested dead branch.
    const wrapper = mountPicker(-1)
    expect(wrapper.text()).toContain('region level')
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountPicker(14, 12)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
