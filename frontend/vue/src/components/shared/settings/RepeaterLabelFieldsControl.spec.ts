import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { axe } from 'jest-axe'
import RepeaterLabelFieldsControl from './RepeaterLabelFieldsControl.vue'
import { useRepeatersStore, DEFAULT_REPEATER_LABEL_FIELDS } from '@/stores/repeaters'

vi.mock('@/services/settingsApi', () => ({
  put: vi.fn(),
  getNamespace: vi.fn(),
  del: vi.fn(),
  getAll: vi.fn(),
  notifySettingsChanged: vi.fn(),
}))
import * as settingsApi from '@/services/settingsApi'

/**
 * Settings › LAND › Repeaters › label fields. The control has two jobs worth
 * testing: it must show what the *backend* holds when the panel opens (so a
 * choice made on another device is what the operator sees), and a toggle must
 * reach the live map at once while the durable write waits for APPLY CHANGES.
 * A hand-edited or stale config must never leave the panel blank.
 */

/** Row order, as the table renders it — the label field keys. */
const ROW_KEYS = [
  'symbol',
  'callsign',
  'band',
  'location',
  'modes',
  'output',
  'input',
  'tone',
  'channel',
  'locator',
  'keeper',
  'status',
] as const

const ROW = Object.fromEntries(ROW_KEYS.map((key, index) => [key, index])) as Record<
  (typeof ROW_KEYS)[number],
  number
>

async function mountControl() {
  const wrapper = mount(RepeaterLabelFieldsControl)
  await flushPromises()
  return wrapper
}

function checkboxes(wrapper: Awaited<ReturnType<typeof mountControl>>) {
  return wrapper.findAll('input[type="checkbox"]')
}

function isChecked(wrapper: Awaited<ReturnType<typeof mountControl>>, rowIndex: number): boolean {
  return (checkboxes(wrapper)[rowIndex]!.element as HTMLInputElement).checked
}

/** Run the last write the control staged for APPLY CHANGES. */
function applyStaged(wrapper: Awaited<ReturnType<typeof mountControl>>) {
  const staged = wrapper.emitted('stage')!
  ;(staged[staged.length - 1]![0] as () => void)()
}

describe('RepeaterLabelFieldsControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
    vi.mocked(settingsApi.put).mockResolvedValue(undefined)
  })

  it('renders one named checkbox per register field the label can carry', async () => {
    const wrapper = await mountControl()
    const boxes = checkboxes(wrapper)
    expect(boxes).toHaveLength(ROW_KEYS.length)
    // One column, so the field name alone is the accessible name.
    expect(boxes[ROW.callsign]!.attributes('aria-label')).toBe('Callsign')
    expect(boxes[ROW.tone]!.attributes('aria-label')).toBe('CTCSS tone / colour code')
    expect(wrapper.text()).toContain('Repeater symbol')
    expect(wrapper.text()).toContain('Output frequency')
  })

  it('starts from the store — glyph, callsign and band on, the rest off', async () => {
    const wrapper = await mountControl()
    expect(isChecked(wrapper, ROW.symbol)).toBe(true)
    expect(isChecked(wrapper, ROW.callsign)).toBe(true)
    expect(isChecked(wrapper, ROW.band)).toBe(true)
    expect(isChecked(wrapper, ROW.location)).toBe(false)
    expect(isChecked(wrapper, ROW.keeper)).toBe(false)
  })

  it('adopts the backend choice on open and mirrors it into the store', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      repeaterLabelFields: { location: true, band: false },
    })
    const wrapper = await mountControl()
    expect(settingsApi.getNamespace).toHaveBeenCalledWith('land')
    expect(isChecked(wrapper, ROW.location)).toBe(true)
    expect(isChecked(wrapper, ROW.band)).toBe(false)
    // Fields the backend did not mention keep their default.
    expect(isChecked(wrapper, ROW.callsign)).toBe(true)
    const store = useRepeatersStore()
    expect(store.labelFields.location).toBe(true)
    expect(store.labelFields.band).toBe(false)
  })

  it('stages nothing merely for reading the backend value back', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({
      repeaterLabelFields: { location: true },
    })
    const wrapper = await mountControl()
    expect(wrapper.emitted('stage')).toBeUndefined()
    expect(settingsApi.put).not.toHaveBeenCalled()
  })

  describe('a config that cannot be trusted', () => {
    it('keeps the defaults when the namespace is unreadable', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue(null)
      const wrapper = await mountControl()
      expect(isChecked(wrapper, ROW.callsign)).toBe(true)
      expect(isChecked(wrapper, ROW.locator)).toBe(false)
    })

    it('keeps the defaults when the namespace holds no repeater fields', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({ repeaterFilters: { bands: [] } })
      const wrapper = await mountControl()
      expect(isChecked(wrapper, ROW.callsign)).toBe(true)
    })

    it('ignores a value that is an array rather than a field map', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({
        repeaterLabelFields: ['callsign', 'band'],
      })
      const wrapper = await mountControl()
      expect(checkboxes(wrapper)).toHaveLength(ROW_KEYS.length)
      expect(isChecked(wrapper, ROW.callsign)).toBe(true)
      expect(isChecked(wrapper, ROW.location)).toBe(false)
      // Nothing from the bad value leaked into the field map the map reads.
      expect(Object.keys(useRepeatersStore().labelFields).sort()).toEqual([...ROW_KEYS].sort())
    })

    it('ignores a value that is not an object at all', async () => {
      vi.mocked(settingsApi.getNamespace).mockResolvedValue({
        repeaterLabelFields: 'callsign,band',
      })
      const wrapper = await mountControl()
      expect(isChecked(wrapper, ROW.callsign)).toBe(true)
      expect(isChecked(wrapper, ROW.location)).toBe(false)
      expect(Object.keys(useRepeatersStore().labelFields).sort()).toEqual([...ROW_KEYS].sort())
    })
  })

  describe('toggling a field', () => {
    it('reaches the live map at once and stages the durable write', async () => {
      const wrapper = await mountControl()
      const store = useRepeatersStore()
      await checkboxes(wrapper)[ROW.location]!.trigger('change')

      expect(store.labelFields.location).toBe(true)
      expect(isChecked(wrapper, ROW.location)).toBe(true)
      // Nothing is written until APPLY CHANGES.
      expect(settingsApi.put).not.toHaveBeenCalled()

      applyStaged(wrapper)
      expect(settingsApi.put).toHaveBeenCalledWith(
        'land',
        'repeaterLabelFields',
        expect.objectContaining({ ...DEFAULT_REPEATER_LABEL_FIELDS, location: true }),
      )
    })

    it('switches a field that is on back off', async () => {
      const wrapper = await mountControl()
      const store = useRepeatersStore()
      await checkboxes(wrapper)[ROW.band]!.trigger('change')

      expect(store.labelFields.band).toBe(false)
      expect(isChecked(wrapper, ROW.band)).toBe(false)
      applyStaged(wrapper)
      expect(settingsApi.put).toHaveBeenCalledWith(
        'land',
        'repeaterLabelFields',
        expect.objectContaining({ band: false, callsign: true }),
      )
    })

    it('carries every earlier toggle in the staged write, not just the last one', async () => {
      const wrapper = await mountControl()
      await checkboxes(wrapper)[ROW.modes]!.trigger('change')
      await checkboxes(wrapper)[ROW.status]!.trigger('change')

      expect(wrapper.emitted('stage')).toHaveLength(2)
      applyStaged(wrapper)
      expect(settingsApi.put).toHaveBeenCalledWith(
        'land',
        'repeaterLabelFields',
        expect.objectContaining({ modes: true, status: true }),
      )
    })

    it('leaves every field the operator did not touch alone', async () => {
      const wrapper = await mountControl()
      await checkboxes(wrapper)[ROW.keeper]!.trigger('change')
      expect(isChecked(wrapper, ROW.symbol)).toBe(true)
      expect(isChecked(wrapper, ROW.locator)).toBe(false)
      expect(useRepeatersStore().labelFields.locator).toBe(false)
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mount(RepeaterLabelFieldsControl, { attachTo: document.body })
    await flushPromises()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })

  it('keeps every checkbox keyboard-focusable and operable', async () => {
    const wrapper = mount(RepeaterLabelFieldsControl, { attachTo: document.body })
    await flushPromises()
    const box = checkboxes(wrapper)[ROW.channel]!
    const element = box.element as HTMLInputElement
    element.focus()
    expect(document.activeElement).toBe(element)
    // Space on a focused checkbox is a click in the DOM; drive that.
    element.click()
    await wrapper.vm.$nextTick()
    expect(useRepeatersStore().labelFields.channel).toBe(true)
    wrapper.unmount()
  })
})
