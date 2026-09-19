import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import LandRepeaterFrequencyCell from './LandRepeaterFrequencyCell.vue'

/**
 * `LandRepeaterFrequencyCell` is one tunable repeater frequency in the Land
 * FILTER pane: the cell itself asks the parent to tune the SDR, and the
 * bookmark beside it saves the frequency to the Frequency Manager — or, once
 * stored, removes it again. The tests care that the two actions stay distinct
 * (a save must never tune), that the bookmark's name and pressed state say
 * which way it will go, and that the frequency reads as a rig displays it.
 */

type CellProps = {
  label: string
  mhz: number
  mode: string
  sdrConnected: boolean
  saved: boolean
  tooltipSide?: 'top' | 'left'
}

function mountCell(overrides: Partial<CellProps> = {}) {
  return mount(LandRepeaterFrequencyCell, {
    props: {
      label: 'OUTPUT',
      mhz: 145.675,
      mode: 'NFM',
      sdrConnected: true,
      saved: false,
      ...overrides,
    },
  })
}

/** The tune button is the cell; the bookmark is the icon action beside it. */
function tuneButton(wrapper: ReturnType<typeof mountCell>) {
  return wrapper.get('.lrfc-tune')
}
function bookmarkButton(wrapper: ReturnType<typeof mountCell>) {
  return wrapper.get('.lrfc-save')
}

describe('LandRepeaterFrequencyCell', () => {
  it('shows the frequency to four places with the mode in the cell label', () => {
    const wrapper = mountCell({ label: 'INPUT', mhz: 145.075, mode: 'NFM' })
    expect(wrapper.get('.ba-data-cell-label').text()).toBe('INPUT · NFM')
    expect(wrapper.get('.ba-data-cell-value').text()).toBe('145.0750')
  })

  it('pads and rounds an awkward frequency rather than showing raw float noise', () => {
    expect(mountCell({ mhz: 51.5 }).get('.ba-data-cell-value').text()).toBe('51.5000')
    expect(mountCell({ mhz: 430.02501 }).get('.ba-data-cell-value').text()).toBe('430.0250')
  })

  it('offers to tune when an SDR is connected', () => {
    const wrapper = mountCell({ sdrConnected: true, mhz: 145.675, mode: 'NFM' })
    expect(tuneButton(wrapper).attributes('title')).toBe('Tune to 145.6750 NFM')
  })

  it('says why tuning will not work when no SDR is connected', () => {
    const wrapper = mountCell({ sdrConnected: false })
    expect(tuneButton(wrapper).attributes('title')).toBe('Connect an SDR to tune')
  })

  it('emits tune from the cell, and only tune', async () => {
    const wrapper = mountCell()
    await tuneButton(wrapper).trigger('click')
    expect(wrapper.emitted('tune')).toHaveLength(1)
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.emitted('unsave')).toBeUndefined()
  })

  it('still emits tune with no SDR connected — the parent decides what to say', async () => {
    // The cell is not disabled while disconnected: the pane answers with its
    // "connect an SDR" notice, which would never appear if the click were eaten.
    const wrapper = mountCell({ sdrConnected: false })
    await tuneButton(wrapper).trigger('click')
    expect(wrapper.emitted('tune')).toHaveLength(1)
  })

  describe('the bookmark', () => {
    it('offers to save an unsaved frequency and emits save', async () => {
      const wrapper = mountCell({ saved: false, mhz: 145.675, mode: 'NFM' })
      const bookmark = bookmarkButton(wrapper)
      expect(bookmark.attributes('aria-label')).toBe('Save 145.6750 NFM to the frequency manager')
      expect(bookmark.attributes('data-tooltip')).toBe('SAVE FREQUENCY')
      expect(bookmark.attributes('aria-pressed')).toBe('false')
      expect(bookmark.classes()).not.toContain('lrfc-save--saved')
      expect(wrapper.get('svg').attributes('fill')).toBe('none')

      await bookmark.trigger('click')
      expect(wrapper.emitted('save')).toHaveLength(1)
      expect(wrapper.emitted('unsave')).toBeUndefined()
      expect(wrapper.emitted('tune')).toBeUndefined()
    })

    it('offers to remove a saved frequency and emits unsave', async () => {
      const wrapper = mountCell({ saved: true, mhz: 145.675, mode: 'NFM' })
      const bookmark = bookmarkButton(wrapper)
      expect(bookmark.attributes('aria-label')).toBe(
        'Remove 145.6750 NFM from the frequency manager',
      )
      expect(bookmark.attributes('data-tooltip')).toBe('REMOVE FREQUENCY')
      expect(bookmark.attributes('aria-pressed')).toBe('true')
      expect(bookmark.classes()).toContain('lrfc-save--saved')
      expect(wrapper.get('svg').attributes('fill')).toBe('currentColor')

      await bookmark.trigger('click')
      expect(wrapper.emitted('unsave')).toHaveLength(1)
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('flips which way it goes as soon as the parent reports it saved', async () => {
      const wrapper = mountCell({ saved: false })
      await bookmarkButton(wrapper).trigger('click')
      await wrapper.setProps({ saved: true })
      await bookmarkButton(wrapper).trigger('click')
      expect(wrapper.emitted('save')).toHaveLength(1)
      expect(wrapper.emitted('unsave')).toHaveLength(1)
    })

    it('opens its tooltip above by default and to the left when told to', () => {
      expect(bookmarkButton(mountCell()).classes()).toContain('ba-icon-action--tip-top')
      expect(bookmarkButton(mountCell({ tooltipSide: 'left' })).classes()).toContain(
        'ba-icon-action--tip-left',
      )
    })

    it('hides its glyph from assistive tech, leaving the label to name it', () => {
      expect(mountCell().get('svg').attributes('aria-hidden')).toBe('true')
    })
  })

  it('keeps both actions as separately focusable native buttons', () => {
    const wrapper = mountCell()
    document.body.appendChild(wrapper.element)
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      const element = button.element as HTMLButtonElement
      expect(element.type).toBe('button')
      expect(element.tabIndex).toBe(0)
      element.focus()
      expect(document.activeElement).toBe(element)
    }
    wrapper.unmount()
  })

  it('has no accessibility violations, saved or unsaved', async () => {
    // `region` is off: the cell always renders inside the FILTER pane's
    // landmark, never as a bare page fragment as it does here.
    const axeOptions = { rules: { region: { enabled: false } } }
    expect(await axe(mountCell().element, axeOptions)).toHaveNoViolations()
    expect(await axe(mountCell({ saved: true }).element, axeOptions)).toHaveNoViolations()
  })
})
