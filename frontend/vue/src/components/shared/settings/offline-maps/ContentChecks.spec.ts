import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ContentChecks from './ContentChecks.vue'

function mountChecks(
  props: {
    includeBasemap?: boolean
    includeTerrain?: boolean
    maxZoom?: number
    terrainMaxZoom?: number
  } = {},
) {
  return mount(ContentChecks, {
    props: {
      includeBasemap: props.includeBasemap ?? true,
      includeTerrain: props.includeTerrain ?? true,
      maxZoom: props.maxZoom ?? 12,
      terrainMaxZoom: props.terrainMaxZoom ?? 12,
    },
  })
}

function checkboxes(wrapper: ReturnType<typeof mountChecks>) {
  return wrapper.findAll('input[type="checkbox"]')
}

describe('ContentChecks', () => {
  it('emits update:includeBasemap when the basemap box is toggled', async () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: true })
    await checkboxes(wrapper)[0]!.setValue(false)
    expect(wrapper.emitted('update:includeBasemap')).toEqual([[false]])
  })

  it('emits update:includeTerrain when the terrain box is toggled', async () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: true })
    await checkboxes(wrapper)[1]!.setValue(false)
    expect(wrapper.emitted('update:includeTerrain')).toEqual([[false]])
  })

  it('disables and describes the basemap box when it is the only one ticked', () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    const basemapInput = checkboxes(wrapper)[0]!
    expect(basemapInput.attributes('disabled')).toBeDefined()
    const noteId = wrapper.find('.oma-content-checks-note').attributes('id')
    expect(basemapInput.attributes('aria-describedby')).toBe(noteId)
    // The other (unticked) box must stay enabled — the user can still tick it.
    expect(checkboxes(wrapper)[1]!.attributes('disabled')).toBeUndefined()
  })

  it('disables and describes the terrain box when it is the only one ticked', () => {
    const wrapper = mountChecks({ includeBasemap: false, includeTerrain: true })
    const terrainInput = checkboxes(wrapper)[1]!
    expect(terrainInput.attributes('disabled')).toBeDefined()
    expect(checkboxes(wrapper)[0]!.attributes('disabled')).toBeUndefined()
  })

  it('disables neither box when both are ticked', () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: true })
    for (const checkbox of checkboxes(wrapper)) {
      expect(checkbox.attributes('disabled')).toBeUndefined()
    }
  })

  it('notes the terrain zoom ceiling only when the requested depth exceeds it', async () => {
    const wrapper = mountChecks({ maxZoom: 12, terrainMaxZoom: 12 })
    expect(wrapper.find('.oma-content-check-desc').text()).not.toContain('up to z12')
    await wrapper.setProps({ maxZoom: 14 })
    expect(wrapper.findAll('.oma-content-check-desc')[1]!.text()).toContain('up to z12')
  })

  it('has no accessibility violations, including with a box force-disabled', async () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
