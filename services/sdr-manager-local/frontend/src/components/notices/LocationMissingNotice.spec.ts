import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { useSettingsStore } from '@sentinel/shell-api/stores/settings'
import { useLocalSdrStore } from '../../stores/localSdrStore'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import LocationMissingNotice from './LocationMissingNotice.vue'

describe('LocationMissingNotice', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('is absent before the location has been read', () => {
    expect(mount(LocationMissingNotice).find('.warning-notice').exists()).toBe(false)
  })

  it('is absent when the location is set', () => {
    useLocalSdrStore().location = { latitude: 51.5, longitude: -0.1 }
    expect(mount(LocationMissingNotice).find('.warning-notice').exists()).toBe(false)
  })

  it.each([
    ['latitude', { latitude: null, longitude: -0.1 }],
    ['longitude', { latitude: 51.5, longitude: null }],
    ['both', { latitude: null, longitude: null }],
  ])('warns when the %s is blank', (_which, location) => {
    useLocalSdrStore().location = location
    const wrapper = mount(LocationMissingNotice)
    expect(wrapper.get('.warning-notice').text()).toContain('location is not set')
  })

  it('opens App Settings from SET LOCATION', async () => {
    useLocalSdrStore().location = { latitude: null, longitude: null }
    const settings = useSettingsStore()
    expect(settings.open).toBe(false)
    const wrapper = mount(LocationMissingNotice)
    await wrapper.get('button').trigger('click')
    expect(settings.open).toBe(true)
    expect(settings.activeSection).toBe('app')
  })

  it('names the action for assistive technology and has no violations', async () => {
    useLocalSdrStore().location = { latitude: null, longitude: null }
    const wrapper = mount(LocationMissingNotice)
    expect(wrapper.get('button').text()).toBe('SET LOCATION')
    await expectNoAxeViolations(wrapper)
  })
})
