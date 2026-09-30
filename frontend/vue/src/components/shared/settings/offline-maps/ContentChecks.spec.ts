import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import ContentChecks from './ContentChecks.vue'

function mountChecks(props: { includeBasemap?: boolean; includeTerrain?: boolean } = {}) {
  return mount(ContentChecks, {
    props: {
      includeBasemap: props.includeBasemap ?? true,
      includeTerrain: props.includeTerrain ?? true,
    },
  })
}

function switches(wrapper: ReturnType<typeof mountChecks>) {
  return wrapper.findAll('[role="switch"]')
}

describe('ContentChecks', () => {
  it('lists Basemap then Terrain as switches reflecting the props', () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    expect(switches(wrapper).map((control) => control.attributes('aria-label'))).toEqual([
      'Basemap',
      'Terrain',
    ])
    expect(switches(wrapper).map((control) => control.attributes('aria-checked'))).toEqual([
      'true',
      'false',
    ])
  })

  it('emits update:includeBasemap when the basemap switch is flipped', async () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: true })
    await switches(wrapper)[0]!.trigger('click')
    expect(wrapper.emitted('update:includeBasemap')).toEqual([[false]])
    expect(wrapper.emitted('update:includeTerrain')).toBeUndefined()
  })

  it('emits update:includeTerrain when the terrain switch is flipped', async () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    await switches(wrapper)[1]!.trigger('click')
    expect(wrapper.emitted('update:includeTerrain')).toEqual([[true]])
    expect(wrapper.emitted('update:includeBasemap')).toBeUndefined()
  })

  it('disables the basemap switch when it is the only one on', () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    expect(switches(wrapper)[0]!.attributes('disabled')).toBeDefined()
    // The other (off) switch must stay enabled — the user can still turn it on.
    expect(switches(wrapper)[1]!.attributes('disabled')).toBeUndefined()
  })

  it('disables the terrain switch when it is the only one on', () => {
    const wrapper = mountChecks({ includeBasemap: false, includeTerrain: true })
    expect(switches(wrapper)[1]!.attributes('disabled')).toBeDefined()
    expect(switches(wrapper)[0]!.attributes('disabled')).toBeUndefined()
  })

  it('disables neither switch when both are on', () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: true })
    for (const control of switches(wrapper)) {
      expect(control.attributes('disabled')).toBeUndefined()
    }
  })

  it('shows no at-least-one or map-style note', () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    expect(wrapper.text()).not.toContain('At least one of Basemap or Terrain')
    expect(wrapper.text()).not.toContain('Works offline in')
  })

  it('has no accessibility violations, including with a switch force-disabled', async () => {
    const wrapper = mountChecks({ includeBasemap: true, includeTerrain: false })
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
