import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseList from './BaseList.vue'

describe('BaseList', () => {
  it('renders the emptyText message when isEmpty=true and no #empty slot is given', () => {
    const wrapper = mount(BaseList, { props: { isEmpty: true, emptyText: 'No tracked items' } })
    expect(wrapper.find('.ba-list-empty').text()).toBe('No tracked items')
  })

  it('renders the #empty slot unwrapped (no ba-list-empty box) instead of emptyText when given', () => {
    const wrapper = mount(BaseList, {
      props: { isEmpty: true, emptyText: 'No tracked items' },
      slots: { empty: '<div id="custom-empty">Nothing here</div>' },
    })
    // No extra styled wrapper is added around a caller-supplied #empty slot —
    // it would double up the caller's own padding/styling.
    expect(wrapper.find('.ba-list-empty').exists()).toBe(false)
    expect(wrapper.find('#custom-empty').text()).toBe('Nothing here')
  })

  it('renders the default slot instead of the empty state when isEmpty=false', () => {
    const wrapper = mount(BaseList, {
      props: { isEmpty: false, emptyText: 'No tracked items' },
      slots: { default: '<div class="probe-row">Row 1</div>' },
    })
    expect(wrapper.find('.ba-list-empty').exists()).toBe(false)
    expect(wrapper.find('.probe-row').text()).toBe('Row 1')
  })

  it('has no accessibility violations when empty', async () => {
    const wrapper = mount(BaseList, { props: { isEmpty: true, emptyText: 'No tracked items' } })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations when populated', async () => {
    const wrapper = mount(BaseList, {
      props: { isEmpty: false, emptyText: 'No tracked items' },
      slots: { default: '<div class="probe-row">Row 1</div>' },
    })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('exposes its root element as scrollContainer', () => {
    const wrapper = mount(BaseList, { props: { isEmpty: false, emptyText: 'No tracked items' } })
    const exposed = wrapper.vm as unknown as { scrollContainer: HTMLDivElement | null }
    expect(exposed.scrollContainer).toBe(wrapper.find('.ba-list').element)
  })

  it('lets non-prop attributes (id, scroll listener) fall through to the root element', async () => {
    const onScroll = vi.fn()
    const wrapper = mount(BaseList, {
      props: { isEmpty: false, emptyText: 'No tracked items' },
      attrs: { id: 'probe-list-wrap', onScroll },
    })
    const root = wrapper.find('.ba-list')
    expect(root.attributes('id')).toBe('probe-list-wrap')
    await root.trigger('scroll')
    expect(onScroll).toHaveBeenCalledTimes(1)
  })
})
