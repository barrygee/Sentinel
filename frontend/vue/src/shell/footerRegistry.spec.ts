import { describe, it, expect, beforeEach } from 'vitest'
import { defineComponent } from 'vue'
import { getFooterItems, registerFooterItem, resetFooterRegistryForTests } from './footerRegistry'

const Item = defineComponent({ template: '<span />' })

beforeEach(() => {
  resetFooterRegistryForTests()
})

describe('shell/footerRegistry', () => {
  it('has no items until a section registers one', () => {
    expect(getFooterItems()).toEqual([])
  })

  it('lists items in order, whatever order they registered in', () => {
    registerFooterItem({ id: 'b', order: 20, component: Item })
    registerFooterItem({ id: 'a', order: 10, component: Item })

    expect(getFooterItems().map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('refuses a second item with the same id', () => {
    registerFooterItem({ id: 'sdr-frequency', order: 10, component: Item })
    expect(() => registerFooterItem({ id: 'sdr-frequency', order: 20, component: Item })).toThrow(
      'Footer item "sdr-frequency" is already registered',
    )
  })
})
