import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseIconActionRow from './BaseIconActionRow.vue'
import BaseIconAction from './BaseIconAction.vue'

describe('BaseIconActionRow', () => {
  it('renders its buttons, in order, inside the row container', () => {
    const wrapper = mount(BaseIconActionRow, {
      slots: {
        default: [
          '<button type="button" aria-label="Track">T</button>',
          '<button type="button" aria-label="Alerts">A</button>',
        ],
      },
    })
    const row = wrapper.get('div')
    expect(row.classes()).toEqual(['ba-icon-action-row'])
    expect(row.findAll('button').map((button) => button.attributes('aria-label'))).toEqual([
      'Track',
      'Alerts',
    ])
  })

  it('renders an empty row without content', () => {
    const wrapper = mount(BaseIconActionRow)
    expect(wrapper.get('.ba-icon-action-row').element.children).toHaveLength(0)
  })

  it('has no axe violations holding accessory actions', async () => {
    const wrapper = mount({
      components: { BaseIconActionRow, BaseIconAction },
      template: `
        <BaseIconActionRow>
          <BaseIconAction variant="accessory" accessible-name="Track aircraft" tooltip="Track aircraft">T</BaseIconAction>
          <BaseIconAction variant="accessory" accessible-name="Centre on map" active>C</BaseIconAction>
        </BaseIconActionRow>`,
    })
    expect(await axe(wrapper.html())).toHaveNoViolations()
  })
})
