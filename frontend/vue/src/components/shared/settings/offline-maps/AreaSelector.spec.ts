import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import AreaSelector from './AreaSelector.vue'

const SAMPLE_BOUNDS = { west: -1, south: 50, east: 1, north: 52 }

function mountSelector(
  props: {
    armed?: boolean
    getCurrentViewBounds?: () => typeof SAMPLE_BOUNDS | null
    hasArea?: boolean
  } = {},
) {
  return mount(AreaSelector, {
    props: {
      armed: props.armed ?? false,
      getCurrentViewBounds: props.getCurrentViewBounds ?? (() => SAMPLE_BOUNDS),
      hasArea: props.hasArea ?? false,
    },
  })
}

function clearButton(wrapper: ReturnType<typeof mountSelector>) {
  return wrapper.findAll('button').find((button) => button.text() === 'CLEAR AREA')
}

describe('AreaSelector', () => {
  it('keeps DRAW AREA while drawing, and shows CLEAR AREA only once a box exists', async () => {
    const wrapper = mountSelector({ armed: false, hasArea: false })
    expect(wrapper.findAll('button')[0]!.text()).toBe('DRAW AREA')
    await wrapper.setProps({ armed: true })
    expect(wrapper.findAll('button')[0]!.text()).toBe('DRAW AREA')
    await wrapper.setProps({ armed: false, hasArea: true })
    expect(wrapper.findAll('button')[0]!.text()).toBe('CLEAR AREA')
  })

  it('emits toggle-draw when DRAW AREA is clicked, armed or not', async () => {
    const wrapper = mountSelector()
    await wrapper.findAll('button')[0]!.trigger('click')
    await wrapper.setProps({ armed: true })
    await wrapper.findAll('button')[0]!.trigger('click')
    expect(wrapper.emitted('toggle-draw')).toHaveLength(2)
    expect(wrapper.emitted('clear')).toBeUndefined()
  })

  it('shows DRAW AREA as pressed (highlighted, aria-pressed) while drawing is armed', async () => {
    const wrapper = mountSelector({ armed: false })
    expect(wrapper.findAll('button')[0]!.attributes('aria-pressed')).toBe('false')
    await wrapper.setProps({ armed: true })
    const button = wrapper.findAll('button')[0]!
    expect(button.classes()).toContain('ba-btn--active')
    expect(button.attributes('aria-pressed')).toBe('true')
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

  it('shows no CLEAR AREA until an area is selected, then the draw button becomes it', async () => {
    const wrapper = mountSelector({ hasArea: false })
    expect(clearButton(wrapper)).toBeUndefined()
    expect(wrapper.findAll('button')).toHaveLength(2)
    await wrapper.setProps({ hasArea: true })
    expect(wrapper.findAll('button')).toHaveLength(2)
    expect(wrapper.findAll('button')[0]!.text()).toBe('CLEAR AREA')
    expect(wrapper.text()).not.toContain('DRAW AREA')
  })

  it('emits clear, not toggle-draw, when CLEAR AREA is pressed', async () => {
    const wrapper = mountSelector({ hasArea: true })
    await clearButton(wrapper)!.trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
    expect(wrapper.emitted('toggle-draw')).toBeUndefined()
  })

  it('drops the toggle semantics and keyboard note while it reads CLEAR AREA', () => {
    const button = mountSelector({ hasArea: true }).findAll('button')[0]!
    expect(button.attributes('aria-pressed')).toBeUndefined()
    expect(button.attributes('aria-describedby')).toBeUndefined()
  })

  it('shows no visible drawing instructions, armed or not', async () => {
    const wrapper = mountSelector({ armed: false })
    await wrapper.setProps({ armed: true })
    expect(wrapper.text()).not.toContain('Drag from one corner')
    expect(wrapper.find('.oma-area-selector-hint').exists()).toBe(false)
  })

  it('disables USE CURRENT VIEW while drawing or while an area exists, enabling it otherwise', async () => {
    const wrapper = mountSelector({ armed: false, hasArea: false })
    const currentViewButton = () => wrapper.findAll('button')[1]!
    expect(currentViewButton().attributes('disabled')).toBeUndefined()
    await wrapper.setProps({ armed: true })
    expect(currentViewButton().attributes('disabled')).toBeDefined()
    await wrapper.setProps({ armed: false, hasArea: true })
    expect(currentViewButton().attributes('disabled')).toBeDefined()
    // Cleared (or saved, which clears it): available again.
    await wrapper.setProps({ hasArea: false })
    expect(currentViewButton().attributes('disabled')).toBeUndefined()
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
