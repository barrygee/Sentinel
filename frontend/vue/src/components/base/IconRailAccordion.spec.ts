import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import IconRailAccordion from './IconRailAccordion.vue'

enableAutoUnmount(afterEach)

/** Mounts the accordion with a trigger button bound to the scoped-slot
 * open/toggle state, and panel content gated the same way real call sites
 * (SpaceSideMenu, and later AirSideMenu) wire it up. */
function mountAccordion(initiallyOpen?: boolean) {
  return mount(IconRailAccordion, {
    // Attached to the document so jsdom recomputes `getComputedStyle` after
    // the v-show mutation — detached trees can otherwise report a stale
    // `display` value to `isVisible()`.
    attachTo: document.body,
    props: {
      panelId: 'space-layers-panel',
      ...(initiallyOpen !== undefined ? { initiallyOpen } : {}),
    },
    slots: {
      trigger: `<template #trigger="{ open, toggle }">
        <button
          id="space-layers-btn"
          :class="{ active: open }"
          :aria-expanded="open"
          aria-controls="space-layers-panel"
          @click="toggle"
        >
          MAP LAYERS
        </button>
      </template>`,
      panel: '<button data-tooltip="GROUND TRACK">Ground track</button>',
    },
  })
}

describe('IconRailAccordion', () => {
  it('starts closed by default, hiding the panel', () => {
    const wrapper = mountAccordion()
    const trigger = wrapper.get('#space-layers-btn')
    expect(trigger.attributes('aria-expanded')).toBe('false')
    expect(trigger.classes()).not.toContain('active')
    const panel = wrapper.get('#space-layers-panel')
    expect(panel.isVisible()).toBe(false)
  })

  it('starts open when initiallyOpen is true', () => {
    const wrapper = mountAccordion(true)
    expect(wrapper.get('#space-layers-btn').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#space-layers-panel').isVisible()).toBe(true)
  })

  it('toggles open and closed when the trigger is clicked', async () => {
    const wrapper = mountAccordion()
    const trigger = wrapper.get('#space-layers-btn')

    await trigger.trigger('click')
    expect(wrapper.get('#space-layers-btn').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#space-layers-btn').classes()).toContain('active')
    expect(wrapper.get('#space-layers-panel').isVisible()).toBe(true)

    await trigger.trigger('click')
    expect(wrapper.get('#space-layers-btn').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('#space-layers-btn').classes()).not.toContain('active')
    expect(wrapper.get('#space-layers-panel').isVisible()).toBe(false)
  })

  it('renders the panel content passed via the panel slot', async () => {
    const wrapper = mountAccordion(true)
    expect(wrapper.find('[data-tooltip="GROUND TRACK"]').exists()).toBe(true)
  })

  it('applies the passed panelId and keeps the legacy sm-accordion-panel passthrough class', () => {
    const wrapper = mountAccordion()
    const panel = wrapper.get('#space-layers-panel')
    expect(panel.classes()).toContain('icon-rail-accordion__panel')
    expect(panel.classes()).toContain('sm-accordion-panel')
  })

  // jsdom never applies the SFC's scoped <style>, so the panel background can't
  // be asserted via getComputedStyle — assert against the component source
  // instead so a revert to the old --color-border grey goes red.
  it('paints the sub-button panel with the shared button-grey token', () => {
    // (path from cwd, not import.meta.url — under jsdom that URL is http-scheme)
    const componentSource = readFileSync(
      resolve(process.cwd(), 'src/components/base/IconRailAccordion.vue'),
      'utf8',
    )
    expect(componentSource).toMatch(
      /\.icon-rail-accordion__panel\s*\{[^}]*background:\s*var\(--color-button-bg\)/,
    )
  })

  it('has no accessibility violations while open', async () => {
    const wrapper = mountAccordion(true)
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
