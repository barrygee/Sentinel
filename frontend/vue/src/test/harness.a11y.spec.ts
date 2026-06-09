import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { defineComponent, h } from 'vue'

// Smoke test for the test harness itself: proves vitest + @vue/test-utils +
// jest-axe are wired together before the per-domain backfill relies on them.
const AccessibleButton = defineComponent({
  name: 'AccessibleButton',
  setup() {
    return () => h('button', { type: 'button' }, 'Save settings')
  },
})

describe('test harness', () => {
  it('mounts a component and renders its content', () => {
    const wrapper = mount(AccessibleButton)
    expect(wrapper.text()).toBe('Save settings')
  })

  it('passes jest-axe for accessible markup', async () => {
    const wrapper = mount(AccessibleButton)
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })

  it('flags inaccessible markup (the matcher is not vacuous)', async () => {
    // An <img> with no alt text is a known WCAG failure — this confirms axe
    // actually reports violations, so passing tests mean something.
    const results = await axe('<img src="logo.png" />')
    expect(results.violations.length).toBeGreaterThan(0)
  })
})
