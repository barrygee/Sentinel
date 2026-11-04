import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'
import AircraftIconStyleControl from './AircraftIconStyleControl.vue'
import { useAirStore } from '../stores/air'
import * as settingsApi from '@sentinel/shell-api/services/settingsApi'

let putSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(settingsApi, 'getNamespace').mockResolvedValue({})
  putSpy = vi.spyOn(settingsApi, 'put').mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function mountControl() {
  const wrapper = mount(AircraftIconStyleControl)
  await flushPromises()
  return wrapper
}

describe('AircraftIconStyleControl', () => {
  it('offers ARROW and SILHOUETTE, named for the setting', async () => {
    const wrapper = await mountControl()
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('Aircraft icons')
    expect(wrapper.findAll('[role="radio"]').map((radio) => radio.text())).toEqual([
      'ARROW',
      'SILHOUETTE',
    ])
  })

  it('shows plain options, with no example drawings', async () => {
    const wrapper = await mountControl()
    expect(wrapper.find('svg').exists()).toBe(false)
  })

  it('selects the store’s current style', async () => {
    useAirStore().setAircraftIconStyle('silhouette')
    const wrapper = await mountControl()
    const checked = wrapper
      .findAll('[role="radio"]')
      .map((radio) => radio.attributes('aria-checked'))
    expect(checked).toEqual(['false', 'true'])
  })

  it('takes the saved style from the database when it opens', async () => {
    vi.mocked(settingsApi.getNamespace).mockResolvedValue({ aircraftIconStyle: 'silhouette' })
    const wrapper = await mountControl()
    expect(useAirStore().aircraftIconStyle).toBe('silhouette')
    expect(wrapper.find('[data-value="silhouette"]').attributes('aria-checked')).toBe('true')
  })

  it('redraws the map at once but saves only on APPLY CHANGES', async () => {
    const wrapper = await mountControl()
    await wrapper.find('[data-value="silhouette"]').trigger('click')

    expect(useAirStore().aircraftIconStyle).toBe('silhouette')
    expect(putSpy).not.toHaveBeenCalled()

    const [[stagedWrite]] = wrapper.emitted('stage') as [[() => Promise<unknown>]]
    await stagedWrite()
    expect(putSpy).toHaveBeenCalledWith('air', 'aircraftIconStyle', 'silhouette')
  })

  it('has no accessibility violations', async () => {
    const wrapper = await mountControl()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
