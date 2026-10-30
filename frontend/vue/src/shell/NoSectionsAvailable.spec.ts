import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import NoSectionsAvailable from './NoSectionsAvailable.vue'

describe('NoSectionsAvailable', () => {
  it('says no section is available', () => {
    const wrapper = mount(NoSectionsAvailable)

    expect(wrapper.get('h1').text()).toBe('No sections are available')
  })

  it('gives the likely causes and how to retry', () => {
    const detail = mount(NoSectionsAvailable).get('p').text()

    expect(detail).toContain('could not be loaded')
    expect(detail).toContain('Check the server is up')
    expect(detail).toContain('reload the page')
  })

  it('is a section labelled by its own heading', () => {
    const wrapper = mount(NoSectionsAvailable)

    const heading = wrapper.get('h1')
    expect(heading.attributes('id')).toBe('no-sections-available-heading')
    expect(wrapper.get('section').attributes('aria-labelledby')).toBe(heading.attributes('id'))
  })

  it('has no axe violations', async () => {
    const wrapper = mount(NoSectionsAvailable, { attachTo: document.body })

    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
