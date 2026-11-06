import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { expectNoAxeViolations } from '../../testing/componentTestUtils'
import PrivateAccessRow from './PrivateAccessRow.vue'

function mountRow(disabled = false) {
  return mount(PrivateAccessRow, { props: { address: '10.0.0.1', disabled } })
}

describe('PrivateAccessRow', () => {
  it('shows the address and names its button after it', () => {
    const wrapper = mountRow()

    expect(wrapper.text()).toContain('10.0.0.1')
    expect(wrapper.get('button').attributes('aria-label')).toBe('Remove 10.0.0.1')
  })

  it('asks to be removed', async () => {
    const wrapper = mountRow()

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('cannot be removed while a change is saving', () => {
    expect(mountRow(true).get('button').attributes('disabled')).toBeDefined()
  })

  it('has no axe violations', async () => {
    const wrapper = mount({
      components: { PrivateAccessRow },
      template: '<ul><PrivateAccessRow address="10.0.0.1" :disabled="false" /></ul>',
    })

    await expectNoAxeViolations(wrapper)
  })
})
