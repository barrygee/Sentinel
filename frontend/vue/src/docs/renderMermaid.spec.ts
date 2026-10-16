import { describe, it, expect, beforeEach, vi } from 'vitest'

const mermaidApi = vi.hoisted(() => ({
  initialize: vi.fn(),
  parse: vi.fn(),
  render: vi.fn(),
}))
vi.mock('mermaid', () => ({ default: mermaidApi }))

import { renderMermaidDiagram, resetMermaidState } from './renderMermaid'

const PLAIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" role="graphics-document document" aria-roledescription="flowchart-v2" aria-labelledby="t" aria-describedby="d" viewBox="0 0 10 10"><title id="t">Mermaid title</title><desc id="d">Mermaid desc</desc><g><text>Node A</text></g></svg>'

describe('renderMermaidDiagram', () => {
  beforeEach(() => {
    resetMermaidState()
    mermaidApi.initialize.mockReset()
    mermaidApi.parse.mockReset().mockResolvedValue(true)
    mermaidApi.render.mockReset().mockResolvedValue({ svg: PLAIN_SVG })
  })

  describe('drawing', () => {
    it('returns the SVG with the caption as its one accessible name', async () => {
      const svg = await renderMermaidDiagram('graph TD\nA-->B', 'How the sections talk')
      expect(svg.tagName.toLowerCase()).toBe('svg')
      expect(svg.getAttribute('role')).toBe('img')
      expect(svg.getAttribute('aria-label')).toBe('How the sections talk')
    })

    it("removes the library's own document semantics so the picture has one name", async () => {
      const svg = await renderMermaidDiagram('graph TD\nA-->B', 'Name')
      expect(svg.hasAttribute('aria-roledescription')).toBe(false)
      expect(svg.hasAttribute('aria-labelledby')).toBe(false)
      expect(svg.hasAttribute('aria-describedby')).toBe(false)
      expect(svg.querySelector(':scope > title')).toBeNull()
      expect(svg.querySelector(':scope > desc')).toBeNull()
    })

    it('keeps the drawing itself', async () => {
      const svg = await renderMermaidDiagram('graph TD\nA-->B', 'Name')
      expect(svg.querySelector('text')?.textContent).toBe('Node A')
      expect(svg.getAttribute('viewBox')).toBe('0 0 10 10')
    })

    it('keeps a title that belongs to a node rather than the whole picture', async () => {
      mermaidApi.render.mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><title>whole</title><g><title>node tip</title><text>A</text></g></svg>',
      })
      const svg = await renderMermaidDiagram('x', 'Name')
      expect(svg.querySelector(':scope > title')).toBeNull()
      expect(svg.querySelector('g > title')?.textContent).toBe('node tip')
    })

    it('parses the source first and renders the same source', async () => {
      const order: string[] = []
      mermaidApi.parse.mockImplementation(async () => {
        order.push('parse')
        return true
      })
      mermaidApi.render.mockImplementation(async () => {
        order.push('render')
        return { svg: PLAIN_SVG }
      })
      await renderMermaidDiagram('graph TD\nA-->B', 'Name')
      expect(order).toEqual(['parse', 'render'])
      expect(mermaidApi.parse).toHaveBeenCalledWith('graph TD\nA-->B')
      expect(mermaidApi.render.mock.calls[0]?.[1]).toBe('graph TD\nA-->B')
    })

    it('gives each diagram its own element id', async () => {
      await renderMermaidDiagram('a', 'One')
      await renderMermaidDiagram('b', 'Two')
      expect(mermaidApi.render.mock.calls.map((call) => call[0])).toEqual([
        'doc-diagram-1',
        'doc-diagram-2',
      ])
    })

    it('numbers from one again after a reset', async () => {
      await renderMermaidDiagram('a', 'One')
      resetMermaidState()
      await renderMermaidDiagram('b', 'Two')
      expect(mermaidApi.render.mock.calls.map((call) => call[0])).toEqual([
        'doc-diagram-1',
        'doc-diagram-1',
      ])
    })
  })

  describe('loading and configuration', () => {
    it('does not touch Mermaid until a diagram is drawn', () => {
      expect(mermaidApi.initialize).not.toHaveBeenCalled()
    })

    it('configures Mermaid once, however many diagrams are drawn', async () => {
      await renderMermaidDiagram('a', 'One')
      await renderMermaidDiagram('b', 'Two')
      expect(mermaidApi.initialize).toHaveBeenCalledTimes(1)
    })

    it('configures it once even when two diagrams are drawn at the same time', async () => {
      await Promise.all([renderMermaidDiagram('a', 'One'), renderMermaidDiagram('b', 'Two')])
      expect(mermaidApi.initialize).toHaveBeenCalledTimes(1)
    })

    it('configures it again after a reset', async () => {
      await renderMermaidDiagram('a', 'One')
      resetMermaidState()
      await renderMermaidDiagram('b', 'Two')
      expect(mermaidApi.initialize).toHaveBeenCalledTimes(2)
    })

    it('runs it in strict security mode, without HTML labels, on a theme with AA contrast', async () => {
      await renderMermaidDiagram('a', 'One')
      const options = mermaidApi.initialize.mock.calls[0]?.[0]
      expect(options).toMatchObject({
        startOnLoad: false,
        theme: 'base',
        securityLevel: 'strict',
        htmlLabels: false,
        flowchart: { htmlLabels: false, useMaxWidth: true },
        logLevel: 'fatal',
      })
      expect(options.themeVariables.primaryTextColor).toBe('#16191d')
      expect(options.themeCSS).toContain('.node.accent')
    })

    it('styles ONLINE and OFF GRID subgraphs apart by line style as well as colour', async () => {
      await renderMermaidDiagram('a', 'One')
      const themeCss: string = mermaidApi.initialize.mock.calls[0]?.[0].themeCSS
      const ruleFor = (selector: string) =>
        themeCss.slice(
          themeCss.indexOf(selector),
          themeCss.indexOf('}', themeCss.indexOf(selector)),
        )
      const online = ruleFor('.cluster.online rect')
      const offgrid = ruleFor('.cluster.offgrid rect')
      expect(online).toContain('stroke: #1d5a9e')
      expect(offgrid).toContain('stroke: #446b00')
      // Colour alone must not carry the difference (WCAG 1.4.1): only off grid is dashed.
      expect(offgrid).toContain('stroke-dasharray')
      expect(online).not.toContain('stroke-dasharray')
      expect(themeCss).toContain('.cluster.online .cluster-label text')
      expect(themeCss).toContain('.cluster.offgrid .cluster-label text')
    })
  })

  describe('errors', () => {
    it('rejects, without drawing, when the source is not valid Mermaid', async () => {
      mermaidApi.parse.mockRejectedValue(new Error('Parse error on line 2'))
      await expect(renderMermaidDiagram('nonsense', 'Name')).rejects.toThrow(
        'Parse error on line 2',
      )
      expect(mermaidApi.render).not.toHaveBeenCalled()
    })

    it('rejects when drawing fails', async () => {
      mermaidApi.render.mockRejectedValue(new Error('render failed'))
      await expect(renderMermaidDiagram('a', 'Name')).rejects.toThrow('render failed')
    })

    it('rejects when Mermaid returns no SVG', async () => {
      mermaidApi.render.mockResolvedValue({ svg: '<div>not a picture</div>' })
      await expect(renderMermaidDiagram('a', 'Name')).rejects.toThrow('Mermaid returned no SVG')
    })

    it('rejects when Mermaid returns nothing drawable', async () => {
      mermaidApi.render.mockResolvedValue({ svg: '' })
      await expect(renderMermaidDiagram('a', 'Name')).rejects.toThrow('Mermaid returned no SVG')
    })

    it('does not count a failed parse as a drawn diagram', async () => {
      mermaidApi.parse.mockRejectedValueOnce(new Error('bad'))
      await expect(renderMermaidDiagram('bad', 'One')).rejects.toThrow()
      await renderMermaidDiagram('good', 'Two')
      expect(mermaidApi.render.mock.calls[0]?.[0]).toBe('doc-diagram-1')
    })
  })

  describe('sanitising the finished SVG', () => {
    it('removes script elements', async () => {
      mermaidApi.render.mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>window.hacked = 1</script><text>ok</text></svg>',
      })
      const svg = await renderMermaidDiagram('a', 'Name')
      expect(svg.querySelector('script')).toBeNull()
      expect(svg.outerHTML).not.toContain('hacked')
      expect(svg.querySelector('text')?.textContent).toBe('ok')
    })

    it('removes event handler attributes', async () => {
      mermaidApi.render.mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="alert(2)" width="5" height="5"/><text onmouseover="alert(3)">ok</text></svg>',
      })
      const svg = await renderMermaidDiagram('a', 'Name')
      expect(svg.outerHTML).not.toMatch(/onload|onclick|onmouseover|alert/)
      expect(svg.querySelector('rect')).not.toBeNull()
    })

    it('removes javascript: links', async () => {
      mermaidApi.render.mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)" href="javascript:alert(2)"><text>x</text></a></svg>',
      })
      const svg = await renderMermaidDiagram('a', 'Name')
      expect(svg.outerHTML).not.toMatch(/javascript:/i)
    })

    it('removes embedded HTML (foreignObject payloads)', async () => {
      mermaidApi.render.mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div onclick="alert(1)"><img src=x onerror="alert(2)"></div></foreignObject><text>ok</text></svg>',
      })
      const svg = await renderMermaidDiagram('a', 'Name')
      expect(svg.outerHTML).not.toMatch(/onerror|onclick|<img|alert/)
    })
  })
})
