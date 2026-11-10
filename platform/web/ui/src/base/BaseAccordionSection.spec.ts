import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, type VueWrapper } from '@vue/test-utils'
import { axe } from 'jest-axe'
import BaseAccordionSection from './BaseAccordionSection.vue'

enableAutoUnmount(afterEach)

interface MountOptions {
  props?: {
    expanded?: boolean
    title?: string
    bodyId?: string
    variant?: 'section' | 'form'
    bodyClass?: string
  }
  slots?: Record<string, string>
}

function mountSection(options: MountOptions = {}): VueWrapper {
  return mount(BaseAccordionSection, {
    props: {
      expanded: true,
      title: 'SCANNER',
      bodyId: 'test-section-body',
      ...options.props,
    },
    slots: {
      default: '<p class="test-body-content">body</p>',
      ...options.slots,
    },
    // Attached so jsdom computes style-based visibility (isVisible) reliably.
    attachTo: document.body,
  })
}

describe('BaseAccordionSection — section variant (default)', () => {
  it('renders the panel-section header row with its title and wrapped chevron', () => {
    const wrapper = mountSection()
    const header = wrapper.find('button')
    expect(header.attributes('type')).toBe('button')
    expect(header.classes()).toContain('base-accordion-toggle')
    expect(header.classes()).toContain('base-accordion-toggle--section')
    const title = header.find('span.base-accordion-title')
    expect(title.text()).toBe('SCANNER')
    expect(header.find('.base-accordion-chevron .chevron-icon').exists()).toBe(true)
    // The section chevron rotates via the header's -expanded class, not the
    // icon's own open prop.
    expect(header.find('.chevron-icon').classes()).not.toContain('chevron-icon--open')
  })

  it('marks the expanded state on the header class, aria-expanded and body visibility', async () => {
    const wrapper = mountSection({ props: { expanded: true } })
    const header = wrapper.find('button')
    const body = wrapper.find('#test-section-body')
    expect(header.classes()).toContain('base-accordion-toggle--expanded')
    expect(header.attributes('aria-expanded')).toBe('true')
    expect(header.attributes('aria-controls')).toBe('test-section-body')
    expect(body.isVisible()).toBe(true)
    expect(body.find('.test-body-content').text()).toBe('body')
    // The body div carries no class unless bodyClass is given.
    expect(body.attributes('class')).toBeUndefined()
    await wrapper.setProps({ expanded: false })
    expect(header.classes()).not.toContain('base-accordion-toggle--expanded')
    expect(header.attributes('aria-expanded')).toBe('false')
    // v-show keeps the collapsed body in the DOM, just hidden.
    expect(wrapper.find('#test-section-body').exists()).toBe(true)
    expect(wrapper.find('#test-section-body').isVisible()).toBe(false)
  })

  it('toggles through the expanded model on header clicks', async () => {
    const wrapper = mountSection({ props: { expanded: true } })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[false]])
    await wrapper.setProps({ expanded: false })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[false], [true]])
  })

  it('renders header-extra slot content between the title and the chevron', () => {
    const wrapper = mountSection({
      slots: { 'header-extra': '<div class="test-state-row">SCANNING</div>' },
    })
    const headerChildren = Array.from(wrapper.find('button').element.children)
    const titleIndex = headerChildren.findIndex((child) =>
      child.classList.contains('base-accordion-title'),
    )
    const extraIndex = headerChildren.findIndex((child) =>
      child.classList.contains('test-state-row'),
    )
    const chevronIndex = headerChildren.findIndex((child) =>
      child.classList.contains('base-accordion-chevron'),
    )
    expect(titleIndex).toBeLessThan(extraIndex)
    expect(extraIndex).toBeLessThan(chevronIndex)
  })

  it('renders the header button and body as adjacent siblings (DOM selectors rely on it)', () => {
    const wrapper = mountSection()
    const header = wrapper.find('button').element
    expect(header.nextElementSibling?.id).toBe('test-section-body')
  })
})

describe('BaseAccordionSection — form variant', () => {
  function mountFormSection(expanded: boolean): VueWrapper {
    return mountSection({
      props: {
        expanded,
        title: 'RADIO SETTINGS',
        bodyId: 'test-form-body',
        variant: 'form',
        bodyClass: 'test-grid-class',
      },
    })
  }

  it('renders the form toggle with its span title, bare chevron and body class', () => {
    const wrapper = mountFormSection(false)
    const header = wrapper.find('button')
    expect(header.classes()).toEqual(['base-accordion-toggle', 'base-accordion-toggle--form'])
    expect(header.find('span.base-accordion-title').text()).toBe('RADIO SETTINGS')
    // The form chevron is a direct child (no wrapper span) driven by `open`.
    expect(header.find('.base-accordion-chevron').exists()).toBe(false)
    expect(header.find('.chevron-icon').classes()).not.toContain('chevron-icon--open')
    expect(header.attributes('aria-expanded')).toBe('false')
    expect(header.attributes('aria-controls')).toBe('test-form-body')
    const body = wrapper.find('#test-form-body')
    expect(body.classes()).toContain('test-grid-class')
    expect(body.isVisible()).toBe(false)
  })

  it('rotates the chevron via its open prop when expanded and never adds the -expanded class', () => {
    const wrapper = mountFormSection(true)
    const header = wrapper.find('button')
    expect(header.find('.chevron-icon').classes()).toContain('chevron-icon--open')
    expect(header.classes()).toEqual(['base-accordion-toggle', 'base-accordion-toggle--form'])
    expect(wrapper.find('#test-form-body').isVisible()).toBe(true)
  })

  it('toggles through the expanded model on header clicks', async () => {
    const wrapper = mountFormSection(false)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('update:expanded')).toEqual([[true]])
  })
})

describe('BaseAccordionSection — owns its own look', () => {
  // Every class the component renders itself, so a section-specific class
  // (the old sdr-* names) can't creep back into the shared component.
  function ownClassNames(wrapper: VueWrapper): string[] {
    const header = wrapper.find('button').element
    const elements = [header, ...Array.from(header.querySelectorAll('*'))]
    return elements.flatMap((element) => Array.from(element.classList))
  }

  it.each([
    ['section', true],
    ['section', false],
    ['form', true],
    ['form', false],
  ] as const)(
    'renders only base-accordion and chevron-icon classes (%s, expanded=%s)',
    (variant, expanded) => {
      const wrapper = mountSection({ props: { variant, expanded } })
      const classNames = ownClassNames(wrapper)
      expect(classNames.length).toBeGreaterThan(0)
      for (const className of classNames) {
        expect(className).toMatch(/^(base-accordion-|chevron-icon)/)
      }
    },
  )

  it.each(['section', 'form'] as const)(
    'puts no <label> inside the %s header button (interactive content is invalid there)',
    (variant) => {
      const wrapper = mountSection({ props: { variant } })
      const header = wrapper.find('button')
      expect(header.find('label').exists()).toBe(false)
      expect(header.find('span.base-accordion-title').text()).toBe('SCANNER')
    },
  )

  it('gives the header its title as the accessible name, even with header-extra content', () => {
    const wrapper = mountSection({ slots: { 'header-extra': '<span>SCANNING</span>' } })
    const header = wrapper.find('button')
    // The title is the header's first text, so screen readers lead with it.
    expect(header.text().startsWith('SCANNER')).toBe(true)
    expect(header.text()).toContain('SCANNING')
  })

  it('drops the section-only classes when the variant changes to form at runtime', async () => {
    const wrapper = mountSection({ props: { expanded: true } })
    const header = wrapper.find('button')
    expect(header.classes()).toEqual([
      'base-accordion-toggle',
      'base-accordion-toggle--section',
      'base-accordion-toggle--expanded',
    ])
    await wrapper.setProps({ variant: 'form' })
    expect(header.classes()).toEqual(['base-accordion-toggle', 'base-accordion-toggle--form'])
    expect(header.find('.base-accordion-chevron').exists()).toBe(false)
  })
})

describe('BaseAccordionSection — accessibility', () => {
  it('has no axe violations in either variant, expanded and collapsed', async () => {
    const axeOptions = { rules: { region: { enabled: false } } }
    const sectionWrapper = mountSection({ props: { expanded: true } })
    expect(await axe(sectionWrapper.html(), axeOptions)).toHaveNoViolations()
    const formWrapper = mountSection({
      props: { expanded: false, variant: 'form', title: 'RADIO SETTINGS' },
    })
    expect(await axe(formWrapper.html(), axeOptions)).toHaveNoViolations()
  })
})
