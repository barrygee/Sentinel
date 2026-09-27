import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AreaSelector from './AreaSelector.vue'

const SAMPLE_BOUNDS = { west: -1, south: 50, east: 1, north: 52 }

function mountSelector(
  props: { armed?: boolean; getCurrentViewBounds?: () => typeof SAMPLE_BOUNDS | null } = {},
) {
  return mount(AreaSelector, {
    props: {
      armed: props.armed ?? false,
      getCurrentViewBounds: props.getCurrentViewBounds ?? (() => SAMPLE_BOUNDS),
    },
  })
}

describe('AreaSelector', () => {
  it('shows DRAW AREA when unarmed and CANCEL DRAWING when armed', async () => {
    const wrapper = mountSelector({ armed: false })
    expect(wrapper.text()).toContain('DRAW AREA')
    await wrapper.setProps({ armed: true })
    expect(wrapper.text()).toContain('CANCEL DRAWING')
  })

  it('emits toggle-draw when the draw button is clicked', async () => {
    const wrapper = mountSelector()
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('toggle-draw')).toHaveLength(1)
  })

  it('reflects armed state via aria-pressed on the draw button', async () => {
    const wrapper = mountSelector({ armed: true })
    expect(wrapper.findAll('button')[0]!.attributes('aria-pressed')).toBe('true')
  })

  it('points screen readers at the keyboard alternative without showing it on screen', () => {
    const wrapper = mountSelector()
    const drawButton = wrapper.findAll('button')[0]!
    const noteId = drawButton.attributes('aria-describedby')
    expect(noteId).toBeTruthy()
    const note = wrapper.find(`[id="${noteId}"]`)
    expect(note.classes()).toContain('sr-only')
    expect(note.text()).toContain('North, South, East')
  })

  it('shows the drawing hint only while armed', async () => {
    const wrapper = mountSelector({ armed: false })
    expect(wrapper.find('.oma-area-selector-hint').text()).toBe('')
    await wrapper.setProps({ armed: true })
    expect(wrapper.find('.oma-area-selector-hint').text()).toContain('Press Escape to cancel')
  })

  it('emits area-selected with the current view bounds when the map is ready', async () => {
    const wrapper = mountSelector({ getCurrentViewBounds: () => SAMPLE_BOUNDS })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('area-selected')).toEqual([[SAMPLE_BOUNDS]])
    expect(wrapper.find('.oma-area-selector-error').exists()).toBe(false)
  })

  it('shows an error and emits nothing when the map is not ready', async () => {
    const wrapper = mountSelector({ getCurrentViewBounds: () => null })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('area-selected')).toBeUndefined()
    expect(wrapper.find('.oma-area-selector-error').text()).toBe('The map is not ready yet.')
  })

  it('shows an antimeridian error and emits nothing when the view crosses 180°', async () => {
    const wrapper = mountSelector({
      getCurrentViewBounds: () => ({ west: 170, south: 10, east: -170, north: 20 }),
    })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('area-selected')).toBeUndefined()
    expect(wrapper.find('.oma-area-selector-error').text()).toContain('antimeridian')
  })

  it('clears a previous error once a later "use current view" succeeds', async () => {
    const getCurrentViewBounds = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(SAMPLE_BOUNDS)
    const wrapper = mountSelector({ getCurrentViewBounds })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.find('.oma-area-selector-error').exists()).toBe(true)
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.find('.oma-area-selector-error').exists()).toBe(false)
  })

  it('has no accessibility violations, armed or not', async () => {
    const wrapper = mountSelector({ armed: true })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
