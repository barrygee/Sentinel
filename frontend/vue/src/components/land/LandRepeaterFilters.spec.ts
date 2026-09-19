import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import LandRepeaterFilters from './LandRepeaterFilters.vue'
import { useRepeatersStore } from '@/stores/repeaters'
import { REPEATER_BAND_ORDER, REPEATER_MODE_CODES } from '@/constants/repeaters'
import type { RepeaterChannel, RepeaterStation } from '@/types/repeaters'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn().mockResolvedValue(null),
  del: vi.fn(),
  getAll: vi.fn(),
  notifySettingsChanged: vi.fn(),
}))

/**
 * `LandRepeaterFilters` is the collapsed BAND / MODE / STATUS accordion under
 * the Land FILTER pane's search box. It owns no state of its own beyond being
 * open: the chips read and write the repeaters store, which persists them. So
 * the tests check the disclosure is a proper one (named, `aria-expanded`,
 * `aria-controls` pointing at the body it hides), that the chip sets mirror the
 * store both ways, and that the MODE row only offers modes the loaded directory
 * actually carries.
 */

function channel(overrides: Partial<RepeaterChannel> = {}): RepeaterChannel {
  return {
    id: 1,
    band: '2M',
    channel: 'RV52',
    txMhz: 145.675,
    rxMhz: 145.075,
    modes: ['A'],
    ctcssHz: null,
    dmrColourCode: null,
    heightMagl: null,
    erpDbw: null,
    status: 'OPERATIONAL',
    ...overrides,
  }
}

function station(overrides: Partial<RepeaterStation> = {}): RepeaterStation {
  return {
    callsign: 'GB3NR',
    latitude: 52.63,
    longitude: 1.29,
    locator: null,
    location: null,
    postcode: null,
    region: null,
    keeper: null,
    channels: [channel()],
    ...overrides,
  }
}

/** The chip rows, in render order: BAND, MODE, STATUS. */
function rows(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[role="group"]')
}

function chipLabels(wrapper: ReturnType<typeof mount>, rowIndex: number): string[] {
  return rows(wrapper)
    [rowIndex]!.findAll('button')
    .map((chip) => chip.text())
}

/** Click a chip by its visible label within one row. */
async function clickChip(wrapper: ReturnType<typeof mount>, rowIndex: number, label: string) {
  const chip = rows(wrapper)
    [rowIndex]!.findAll('button')
    .find((candidate) => candidate.text() === label)
  expect(chip, `no "${label}" chip in row ${rowIndex}`).toBeDefined()
  await chip!.trigger('click')
}

const BAND_ROW = 0
const MODE_ROW = 1
const STATUS_ROW = 2

describe('LandRepeaterFilters', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('the disclosure', () => {
    it('is collapsed, named and wired to its body', () => {
      const wrapper = mount(LandRepeaterFilters)
      const toggle = wrapper.get('button.lrf-heading')
      expect(toggle.text()).toContain('Repeater filters')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      const bodyId = toggle.attributes('aria-controls')!
      expect(wrapper.get(`#${bodyId}`).classes()).toContain('lrf-body')
    })

    it('hides the chips until it is opened, and hides them again on a second click', async () => {
      const wrapper = mount(LandRepeaterFilters)
      const toggle = wrapper.get('button.lrf-heading')
      const body = wrapper.get('.lrf-body')
      expect(body.attributes('style')).toContain('display: none')

      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(toggle.classes()).toContain('lrf-heading--expanded')
      expect(body.attributes('style') ?? '').not.toContain('display: none')

      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(toggle.classes()).not.toContain('lrf-heading--expanded')
      expect(body.attributes('style')).toContain('display: none')
    })

    it('opens from the keyboard, as a native button does', async () => {
      const wrapper = mount(LandRepeaterFilters, { attachTo: document.body })
      const toggle = wrapper.get('button.lrf-heading')
      const element = toggle.element as HTMLButtonElement
      element.focus()
      expect(document.activeElement).toBe(element)
      // Enter on a focused <button> fires a click; assert the DOM behaviour the
      // component relies on rather than a synthetic handler.
      element.click()
      await wrapper.vm.$nextTick()
      expect(toggle.attributes('aria-expanded')).toBe('true')
      wrapper.unmount()
    })

    it('hides the chevron glyph from assistive tech', () => {
      expect(mount(LandRepeaterFilters).get('svg').attributes('aria-hidden')).toBe('true')
    })
  })

  describe('the band row', () => {
    it('offers ALL plus every band the register covers, with ALL active by default', () => {
      const wrapper = mount(LandRepeaterFilters)
      expect(chipLabels(wrapper, BAND_ROW)).toEqual(['All', ...REPEATER_BAND_ORDER])
      expect(rows(wrapper)[BAND_ROW]!.attributes('aria-label')).toBe('Band')
      const chips = rows(wrapper)[BAND_ROW]!.findAll('button')
      expect(chips[0]!.attributes('aria-pressed')).toBe('true')
      expect(chips[1]!.attributes('aria-pressed')).toBe('false')
    })

    it('toggles a band on and off in the store', async () => {
      const wrapper = mount(LandRepeaterFilters)
      const store = useRepeatersStore()
      await clickChip(wrapper, BAND_ROW, '70CM')
      expect(store.filters.bands).toEqual(['70CM'])
      await clickChip(wrapper, BAND_ROW, '70CM')
      expect(store.filters.bands).toEqual([])
    })

    it('marks the chosen bands pressed and drops ALL while any is chosen', async () => {
      const wrapper = mount(LandRepeaterFilters)
      await clickChip(wrapper, BAND_ROW, '2M')
      const chips = rows(wrapper)[BAND_ROW]!.findAll('button')
      expect(chips[0]!.attributes('aria-pressed')).toBe('false')
      const bandChip = chips.find((chip) => chip.text() === '2M')!
      expect(bandChip.attributes('aria-pressed')).toBe('true')
    })

    it('clears every band narrowing from ALL', async () => {
      const wrapper = mount(LandRepeaterFilters)
      const store = useRepeatersStore()
      store.toggleBand('2M')
      store.toggleBand('70CM')
      await clickChip(wrapper, BAND_ROW, 'All')
      expect(store.filters.bands).toEqual([])
    })
  })

  describe('the mode row', () => {
    it('offers every mode code while the directory has not loaded', () => {
      const wrapper = mount(LandRepeaterFilters)
      expect(rows(wrapper)[MODE_ROW]!.attributes('aria-label')).toBe('Mode')
      expect(chipLabels(wrapper, MODE_ROW)).toHaveLength(REPEATER_MODE_CODES.length + 1)
      expect(chipLabels(wrapper, MODE_ROW)).toContain('TETRA')
    })

    it('offers only the modes the loaded directory carries', () => {
      const store = useRepeatersStore()
      store.stations = [
        station({ channels: [channel({ modes: ['A'] })] }),
        station({ callsign: 'GB3EL', channels: [channel({ modes: ['M', 'A'] })] }),
      ]
      const wrapper = mount(LandRepeaterFilters)
      // Chip order follows REPEATER_MODE_CODES (FM before DMR), not the data.
      expect(chipLabels(wrapper, MODE_ROW)).toEqual(['All', 'FM', 'DMR'])
    })

    it('toggles a mode on and off in the store', async () => {
      const store = useRepeatersStore()
      store.stations = [station({ channels: [channel({ modes: ['A', 'M'] })] })]
      const wrapper = mount(LandRepeaterFilters)
      await clickChip(wrapper, MODE_ROW, 'DMR')
      expect(store.filters.modes).toEqual(['M'])
      await clickChip(wrapper, MODE_ROW, 'DMR')
      expect(store.filters.modes).toEqual([])
    })

    it('clears every mode narrowing from ALL', async () => {
      const wrapper = mount(LandRepeaterFilters)
      const store = useRepeatersStore()
      store.toggleMode('A')
      expect(store.filters.modes).toEqual(['A'])
      await clickChip(wrapper, MODE_ROW, 'All')
      expect(store.filters.modes).toEqual([])
    })

    it('shows a mode the operator already chose as pressed', () => {
      const store = useRepeatersStore()
      store.toggleMode('A')
      const wrapper = mount(LandRepeaterFilters)
      const chip = rows(wrapper)
        [MODE_ROW]!.findAll('button')
        .find((candidate) => candidate.text() === 'FM')!
      expect(chip.attributes('aria-pressed')).toBe('true')
    })
  })

  describe('the status row', () => {
    it('is single-select, starting at ALL', () => {
      const wrapper = mount(LandRepeaterFilters)
      expect(rows(wrapper)[STATUS_ROW]!.attributes('aria-label')).toBe('Status')
      expect(chipLabels(wrapper, STATUS_ROW)).toEqual(['All', 'On air', 'Off air'])
      const pressed = rows(wrapper)
        [STATUS_ROW]!.findAll('button')
        .map((chip) => chip.attributes('aria-pressed'))
      expect(pressed).toEqual(['true', 'false', 'false'])
    })

    it('replaces the status rather than accumulating it', async () => {
      const wrapper = mount(LandRepeaterFilters)
      const store = useRepeatersStore()
      await clickChip(wrapper, STATUS_ROW, 'On air')
      expect(store.filters.status).toBe('operational')
      await clickChip(wrapper, STATUS_ROW, 'Off air')
      expect(store.filters.status).toBe('offAir')
      const pressed = rows(wrapper)
        [STATUS_ROW]!.findAll('button')
        .map((chip) => chip.attributes('aria-pressed'))
      expect(pressed).toEqual(['false', 'false', 'true'])
    })

    it('goes back to every site from ALL', async () => {
      const wrapper = mount(LandRepeaterFilters)
      const store = useRepeatersStore()
      store.setStatusFilter('offAir')
      await clickChip(wrapper, STATUS_ROW, 'All')
      expect(store.filters.status).toBe('all')
    })
  })

  it('has no accessibility violations, collapsed or expanded', async () => {
    // `region` is off: the accordion always renders inside the FILTER pane's
    // landmark, never as a bare page fragment as it does here.
    const axeOptions = { rules: { region: { enabled: false } } }
    const wrapper = mount(LandRepeaterFilters)
    expect(await axe(wrapper.element, axeOptions)).toHaveNoViolations()
    await wrapper.get('button.lrf-heading').trigger('click')
    expect(await axe(wrapper.element, axeOptions)).toHaveNoViolations()
  })
})
