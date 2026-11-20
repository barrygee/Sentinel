import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LandStationRawFrame from './LandStationRawFrame.vue'

const RAW = 'M0ABC-9>APDR16,WIDE1-1:=5458.20N/00136.60W>012/034'

function mountFrame(raw: string | null = RAW) {
  return mount(LandStationRawFrame, { props: { raw } })
}

describe('LandStationRawFrame', () => {
  it('starts folded away, with the toggle pointing at the body it controls', () => {
    const wrapper = mountFrame()
    const toggle = wrapper.get('button')
    expect(toggle.text()).toBe('RAW')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('land-filter-raw-body')
    expect(wrapper.find('#land-filter-raw-body').exists()).toBe(false)
    expect(wrapper.get('.land-filter-raw-chevron').classes()).not.toContain('open')
  })

  it('shows the frame exactly as received when opened', async () => {
    const wrapper = mountFrame()
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#land-filter-raw-body').text()).toBe(RAW)
    expect(wrapper.get('.land-filter-raw-chevron').classes()).toContain('open')
  })

  it('folds away again on a second click', async () => {
    const wrapper = mountFrame()
    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#land-filter-raw-body').exists()).toBe(false)
  })

  it('shows a dash for a station that carried no raw frame', async () => {
    const wrapper = mountFrame(null)
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('#land-filter-raw-body').text()).toBe('—')
  })

  it('keeps the click from reaching the row, so toggling never shuts the accordion', async () => {
    const rowClick = vi.fn()
    const wrapper = mount(
      defineComponent({
        setup: () => () => h('div', { onClick: rowClick }, [h(LandStationRawFrame, { raw: RAW })]),
      }),
    )
    await wrapper.get('button').trigger('click')
    expect(rowClick).not.toHaveBeenCalled()
  })

  it('starts folded again on every mount, as each newly opened station does', async () => {
    const first = mountFrame()
    await first.get('button').trigger('click')
    first.unmount()
    expect(mountFrame().get('button').attributes('aria-expanded')).toBe('false')
  })

  it('has no accessibility violations folded or open', async () => {
    const axeOptions = { rules: { region: { enabled: false } } }
    const wrapper = mountFrame()
    expect(await axe(wrapper.element, axeOptions)).toHaveNoViolations()
    await wrapper.get('button').trigger('click')
    expect(await axe(wrapper.element, axeOptions)).toHaveNoViolations()
  })
})
