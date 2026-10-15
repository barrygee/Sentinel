import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { axe } from 'jest-axe'

const renderMermaidDiagram = vi.hoisted(() => vi.fn())
vi.mock('./renderMermaid', () => ({ renderMermaidDiagram }))

import DocsDiagram from './DocsDiagram.vue'

function drawnSvg(name: string): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', name)
  const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  text.textContent = 'Node A'
  svg.appendChild(text)
  return svg
}

function mountDiagram(props: { source?: string; caption?: string; textHtml?: string } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  return mount(DocsDiagram, {
    props: { source: 'graph TD\nA-->B', caption: 'How it flows', textHtml: '', ...props },
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
}

describe('DocsDiagram', () => {
  beforeEach(() => {
    renderMermaidDiagram.mockReset().mockImplementation(async (_source, name) => drawnSvg(name))
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('while drawing', () => {
    it('says it is loading, and is marked busy', () => {
      renderMermaidDiagram.mockReturnValue(new Promise(() => {}))
      const wrapper = mountDiagram()
      const loading = wrapper.get('.doc-diagram__loading')
      expect(loading.text()).toBe('LOADING DIAGRAM')
      expect(loading.attributes('aria-busy')).toBe('true')
      expect(wrapper.find('[role="region"]').exists()).toBe(false)
    })
  })

  describe('once drawn', () => {
    it('asks for the source to be drawn, named by the caption', async () => {
      mountDiagram({ source: 'graph LR\nX-->Y', caption: 'Section links' })
      await flushPromises()
      expect(renderMermaidDiagram).toHaveBeenCalledWith('graph LR\nX-->Y', 'Section links')
    })

    it('names the picture "Diagram" when there is no caption', async () => {
      mountDiagram({ caption: '' })
      await flushPromises()
      expect(renderMermaidDiagram).toHaveBeenCalledWith(expect.any(String), 'Diagram')
    })

    it('shows the picture in a focusable, named scroll region', async () => {
      const wrapper = mountDiagram()
      await flushPromises()
      const region = wrapper.get('[role="region"]')
      expect(region.attributes('aria-label')).toBe('Diagram')
      expect(region.attributes('tabindex')).toBe('0')
      expect(region.find('svg[role="img"]').attributes('aria-label')).toBe('How it flows')
      expect(wrapper.find('.doc-diagram__loading').exists()).toBe(false)
    })

    it('shows the caption beneath', async () => {
      const wrapper = mountDiagram({ caption: 'How it flows' })
      await flushPromises()
      expect(wrapper.get('figcaption').text()).toBe('How it flows')
    })

    it('leaves out the caption element when there is none', async () => {
      const wrapper = mountDiagram({ caption: '' })
      await flushPromises()
      expect(wrapper.find('figcaption').exists()).toBe(false)
    })

    it('always shows the "In words" text equivalent after the figure', async () => {
      const wrapper = mountDiagram({ textHtml: '<ul><li>A sends to B</li></ul>' })
      await flushPromises()
      const text = wrapper.get('.doc-diagram-text')
      expect(text.text()).toBe('A sends to B')
      const figure = wrapper.get('figure').element
      expect(figure.nextElementSibling).toBe(text.element)
    })

    it('leaves out the text block when there is no text version', async () => {
      const wrapper = mountDiagram({ textHtml: '' })
      await flushPromises()
      expect(wrapper.find('.doc-diagram-text').exists()).toBe(false)
    })

    it('shows the text version while the diagram is still loading', async () => {
      renderMermaidDiagram.mockReturnValue(new Promise(() => {}))
      const wrapper = mountDiagram({ textHtml: '<ul><li>A sends to B</li></ul>' })
      expect(wrapper.get('.doc-diagram-text').text()).toBe('A sends to B')
    })
  })

  describe('when Mermaid cannot draw it', () => {
    beforeEach(() => {
      renderMermaidDiagram.mockRejectedValue(new Error('Parse error'))
    })

    it('warns that the diagram could not be drawn and points at the text version', async () => {
      const wrapper = mountDiagram()
      await flushPromises()
      const warning = wrapper.get('.doc-callout--warning')
      expect(warning.text()).toContain("This diagram couldn't be drawn; its text version follows.")
      expect(wrapper.find('[role="region"][aria-label="Diagram"]').exists()).toBe(false)
      expect(wrapper.find('.doc-diagram__loading').exists()).toBe(false)
    })

    it('shows the source as code so nothing is lost', async () => {
      const wrapper = mountDiagram({ source: 'graph TD\nA-->B' })
      await flushPromises()
      expect(wrapper.get('.doc-code__language').text()).toBe('mermaid')
      expect(wrapper.get('pre code').text()).toBe('graph TD\nA-->B')
    })

    it('still shows the caption and the text version', async () => {
      const wrapper = mountDiagram({ textHtml: '<ul><li>A sends to B</li></ul>' })
      await flushPromises()
      expect(wrapper.get('figcaption').text()).toBe('How it flows')
      expect(wrapper.get('.doc-diagram-text').text()).toBe('A sends to B')
    })

    it('treats a library that fails to load the same way', async () => {
      renderMermaidDiagram.mockRejectedValue(
        new TypeError('Failed to fetch dynamically imported module'),
      )
      const wrapper = mountDiagram()
      await flushPromises()
      expect(wrapper.find('.doc-callout--warning').exists()).toBe(true)
    })
  })

  it('has no accessibility violations once drawn', async () => {
    const wrapper = mountDiagram({ textHtml: '<ul><li>A sends to B</li></ul>' })
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations when the diagram failed', async () => {
    renderMermaidDiagram.mockRejectedValue(new Error('nope'))
    const wrapper = mountDiagram({ textHtml: '<ul><li>A sends to B</li></ul>' })
    await flushPromises()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })

  it('has no accessibility violations while loading', async () => {
    renderMermaidDiagram.mockReturnValue(new Promise(() => {}))
    const wrapper = mountDiagram()
    expect(
      await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
    ).toHaveNoViolations()
  })
})
