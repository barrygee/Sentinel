import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrSearchRangesTab from './SdrSearchRangesTab.vue'
import type { SdrSearchRange } from '@/services/sdrSearchApi'

enableAutoUnmount(afterEach)

// ── sdrSearchApi double ───────────────────────────────────────────────────────
const { createMock, updateMock, deleteMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('@/services/sdrSearchApi', () => ({
  createSearchRange: createMock,
  updateSearchRange: updateMock,
  deleteSearchRange: deleteMock,
}))

beforeEach(() => {
  createMock.mockReset().mockResolvedValue({ id: 99 })
  updateMock.mockReset().mockResolvedValue({ id: 1 })
  deleteMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll('.sdr-step-menu').forEach((node) => node.remove())
})

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeRange(overrides: Partial<SdrSearchRange> = {}): SdrSearchRange {
  return {
    id: 1,
    label: 'Air Band',
    low_hz: 118_000_000,
    high_hz: 137_000_000,
    step_hz: 25_000,
    mode: 'AM',
    threshold_dbfs: -70,
    dwell_ms: 200,
    band_name: '',
    enabled: true,
    notes: '',
    sort_order: 0,
    ...overrides,
  }
}

function mountTab(ranges: SdrSearchRange[] = [makeRange()]): VueWrapper {
  return mount(SdrSearchRangesTab, {
    props: { ranges },
    attachTo: document.body,
  })
}

async function openAddForm(wrapper: VueWrapper) {
  await wrapper.find('.sdr-add-freq-btn').trigger('click')
  return wrapper.find('.sdr-addfreq-body')
}

function errText(wrapper: VueWrapper): string {
  return wrapper.find('.sdr-field-error').text()
}

// =============================================================================
describe('SdrSearchRangesTab — rendering', () => {
  it('renders one row per range with label and MHz span', () => {
    const wrapper = mountTab([
      makeRange(),
      makeRange({ id: 2, label: 'Marine', low_hz: 156_000_000, high_hz: 162_000_000 }),
    ])
    const rows = wrapper.findAll('#sdr-search-range-list .sdr-freq-row-item')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('.sdr-freq-row-label').text()).toBe('Air Band')
    expect(rows[0].find('.sdr-freq-row-hz').text()).toBe('118.000–137.000 MHz')
  })

  it('shows the empty message when there are no ranges', () => {
    const wrapper = mountTab([])
    expect(wrapper.find('.sdr-panel-empty').text()).toBe('No search ranges defined.')
  })
})

// =============================================================================
describe('SdrSearchRangesTab — add', () => {
  it('opens the add form, hides the Add Range button, and creates with the parsed body', async () => {
    const wrapper = mountTab([makeRange(), makeRange({ id: 2, label: 'Marine' })])
    const editor = await openAddForm(wrapper)
    expect(wrapper.find('.sdr-frequency-manager-add-freq-row').isVisible()).toBe(false)
    const inputs = editor.findAll('input.sdr-panel-input')
    await inputs[0].setValue('  UHF CB  ') // label
    await inputs[1].setValue('476.4') // low MHz
    await inputs[2].setValue('477.4') // high MHz
    await editor
      .findAll('.sdr-mode-pill')
      .find((pill) => pill.text() === 'NFM')!
      .trigger('click')
    await editor.find('.sdr-editfreq-save-btn').trigger('click')
    await flushPromises()
    expect(createMock).toHaveBeenCalledWith({
      label: 'UHF CB',
      low_hz: 476_400_000,
      high_hz: 477_400_000,
      step_hz: 12_500,
      mode: 'NFM',
      threshold_dbfs: -70,
      dwell_ms: 200,
      band_name: '',
      enabled: true,
      notes: '',
      sort_order: 2,
    })
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(wrapper.find('.sdr-addfreq-body').exists()).toBe(false)
  })

  it('exposes the MODE pills as a keyboard-operable radio group', async () => {
    const wrapper = mountTab([])
    const editor = await openAddForm(wrapper)

    const modeGroup = editor.find('.sdr-mode-pills')
    expect(modeGroup.attributes('role')).toBe('radiogroup')
    expect(modeGroup.attributes('aria-label')).toBe('Demodulation mode')

    // The blank editor defaults to NFM: it is checked and holds the tab stop.
    const modePills = editor.findAll('.sdr-mode-pill')
    const nfmPill = modePills.find((pill) => pill.text() === 'NFM')!
    expect(nfmPill.attributes('role')).toBe('radio')
    expect(nfmPill.attributes('aria-checked')).toBe('true')
    expect(nfmPill.attributes('tabindex')).toBe('0')
    const wfmPill = modePills.find((pill) => pill.text() === 'WFM')!
    expect(wfmPill.attributes('aria-checked')).toBe('false')
    expect(wfmPill.attributes('tabindex')).toBe('-1')

    // ArrowRight moves selection and the tab stop to WFM.
    await nfmPill.trigger('keydown', { key: 'ArrowRight' })
    expect(wfmPill.attributes('aria-checked')).toBe('true')
    expect(wfmPill.attributes('tabindex')).toBe('0')
    expect(nfmPill.attributes('aria-checked')).toBe('false')
    expect(nfmPill.attributes('tabindex')).toBe('-1')
  })

  it('reports each validation error without calling the API', async () => {
    const wrapper = mountTab([])
    const editor = await openAddForm(wrapper)
    const inputs = editor.findAll('input.sdr-panel-input')
    const save = () => editor.find('.sdr-editfreq-save-btn').trigger('click')

    await save()
    expect(errText(wrapper)).toBe('Label required')
    await inputs[0].setValue('R')
    await save()
    expect(errText(wrapper)).toBe('Low and high MHz required')
    await inputs[1].setValue('20')
    await inputs[2].setValue('10')
    await save()
    expect(errText(wrapper)).toBe('Low must be less than high')
    await inputs[1].setValue('10')
    await inputs[2].setValue('20')
    await inputs[4].setValue('abc') // threshold
    await save()
    expect(errText(wrapper)).toBe('Threshold must be a number')
    await inputs[4].setValue('-70')
    await inputs[3].setValue('0') // dwell
    await save()
    expect(errText(wrapper)).toBe('Dwell must be positive')
    expect(createMock).not.toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('shows a save error and keeps the form open when the create fails', async () => {
    createMock.mockResolvedValue(null)
    const wrapper = mountTab([])
    const editor = await openAddForm(wrapper)
    const inputs = editor.findAll('input.sdr-panel-input')
    await inputs[0].setValue('R')
    await inputs[1].setValue('10')
    await inputs[2].setValue('20')
    await editor.find('.sdr-editfreq-save-btn').trigger('click')
    await flushPromises()
    expect(errText(wrapper)).toBe('Save failed')
    expect(wrapper.find('.sdr-addfreq-body').exists()).toBe(true)
    expect(wrapper.emitted('changed')).toBeUndefined()
  })

  it('cancels the add form', async () => {
    const wrapper = mountTab([])
    const editor = await openAddForm(wrapper)
    await editor
      .findAll('.sdr-panel-btn')
      .find((b) => b.text() === 'CANCEL')!
      .trigger('click')
    expect(wrapper.find('.sdr-addfreq-body').exists()).toBe(false)
    expect(wrapper.find('.sdr-frequency-manager-add-freq-row').isVisible()).toBe(true)
  })
})

// =============================================================================
describe('SdrSearchRangesTab — edit', () => {
  it('drives the inline-edit MODE radio group with arrow keys', async () => {
    const wrapper = mountTab([makeRange({ id: 7 })])
    await wrapper.find('.sdr-freq-row-edit').trigger('click')
    const editor = wrapper.find('.sdr-freq-editing .sdr-editfreq-body')
    const modePills = editor.findAll('.sdr-mode-pills .sdr-mode-pill')
    const checkedIndex = modePills.findIndex((pill) => pill.attributes('aria-checked') === 'true')
    const nextPill = modePills[(checkedIndex + 1) % modePills.length]!
    await modePills[checkedIndex]!.trigger('keydown', { key: 'ArrowRight' })
    expect(nextPill.attributes('aria-checked')).toBe('true')
    expect(nextPill.attributes('tabindex')).toBe('0')
  })

  it('opens the inline editor prefilled from the range, updates, and preserves sort_order', async () => {
    const wrapper = mountTab([makeRange({ id: 7, sort_order: 3, notes: 'busy' })])
    await wrapper.find('.sdr-freq-row-edit').trigger('click')
    const editor = wrapper.find('.sdr-freq-editing .sdr-editfreq-body')
    const inputs = editor.findAll('input.sdr-panel-input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('Air Band')
    expect((inputs[1].element as HTMLInputElement).value).toBe('118')
    expect((inputs[2].element as HTMLInputElement).value).toBe('137')
    expect(editor.find('.sdr-device-dropdown-text').text()).toBe('25 kHz')
    expect((editor.find('textarea').element as HTMLTextAreaElement).value).toBe('busy')
    await inputs[0].setValue('Air Band EU')
    await editor.find('.sdr-editfreq-save-btn').trigger('click')
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ label: 'Air Band EU', sort_order: 3 }),
    )
    expect(wrapper.emitted('changed')).toHaveLength(1)
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(false)
  })

  it('picks a step inside the edit form via the step picker', async () => {
    const wrapper = mountTab([makeRange({ id: 7 })])
    await wrapper.find('.sdr-freq-row-edit').trigger('click')
    const editor = wrapper.find('.sdr-freq-editing .sdr-editfreq-body')
    await editor.find('.sdr-step-dropdown').trigger('click')
    const items = Array.from(document.querySelectorAll('.sdr-step-menu .sdr-device-menu-item'))
    ;(items.find((item) => item.textContent?.trim() === '8.33 kHz') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(editor.find('.sdr-device-dropdown-text').text()).toBe('8.33 kHz')
    await editor.find('.sdr-editfreq-save-btn').trigger('click')
    await flushPromises()
    expect(updateMock).toHaveBeenCalledWith(7, expect.objectContaining({ step_hz: 8330 }))
  })

  it('toggles the editor via the row body (click, Enter, space) and closes on re-click', async () => {
    const wrapper = mountTab([makeRange()])
    const body = wrapper.find('.sdr-search-range-row-body')
    await body.trigger('click')
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(true)
    await body.trigger('click')
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(false)
    await body.trigger('keydown.enter')
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(true)
    await body.trigger('keydown.space')
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(false)
  })

  it('cancels the inline editor', async () => {
    const wrapper = mountTab([makeRange()])
    await wrapper.find('.sdr-freq-row-edit').trigger('click')
    const editor = wrapper.find('.sdr-freq-editing .sdr-editfreq-body')
    await editor
      .findAll('.sdr-panel-btn')
      .find((b) => b.text() === 'CANCEL')!
      .trigger('click')
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(false)
    expect(updateMock).not.toHaveBeenCalled()
  })
})

// =============================================================================
describe('SdrSearchRangesTab — delete', () => {
  it('emits before-delete, deletes via the API, then emits changed', async () => {
    const events: string[] = []
    deleteMock.mockImplementation(async () => {
      events.push('api-delete')
    })
    const wrapper = mountTab([makeRange({ id: 5 })])
    await wrapper.find('.sdr-freq-row-del').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('before-delete')).toEqual([[5]])
    expect(deleteMock).toHaveBeenCalledWith(5)
    expect(wrapper.emitted('changed')).toHaveLength(1)
    // before-delete is emitted synchronously before the API call.
    expect(events).toEqual(['api-delete'])
  })

  it('closes the inline editor when the range being edited is deleted', async () => {
    const wrapper = mountTab([makeRange({ id: 5 })])
    await wrapper.find('.sdr-freq-row-edit').trigger('click')
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(true)
    await wrapper.find('.sdr-freq-row-del').trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(false)
  })

  it('keeps the editor open when a different range is deleted', async () => {
    const wrapper = mountTab([makeRange({ id: 5 }), makeRange({ id: 6, label: 'Marine' })])
    await wrapper.findAll('.sdr-freq-row-edit')[0].trigger('click')
    await wrapper.findAll('.sdr-freq-row-del')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.sdr-freq-editing').exists()).toBe(true)
  })
})

// =============================================================================
describe('SdrSearchRangesTab — accessibility', () => {
  it('has no axe violations with rows and an open editor', async () => {
    const wrapper = mountTab([makeRange(), makeRange({ id: 2, label: 'Marine' })])
    await wrapper.find('.sdr-freq-row-edit').trigger('click')
    await wrapper.vm.$nextTick()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
