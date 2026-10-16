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
      expect(options.themeVariables.primaryTextColor).toBe('#ffffff')
      expect(options.themeCSS).toContain('.node.accent')
    })

    it('draws arrowheads larger than Mermaid does, so the direction of flow stands out', async () => {
      mermaidApi.render.mockResolvedValue({
        svg:
          '<svg xmlns="http://www.w3.org/2000/svg"><defs>' +
          '<marker id="end" markerWidth="8" markerHeight="10"><path d="M0,0 L10,5 L0,10z"></path></marker>' +
          '<marker id="bare"><path d="M0,0"></path></marker>' +
          '</defs><path marker-end="url(#end)" d="M0,0 L50,0"></path></svg>',
      })
      const svg = await renderMermaidDiagram('a', 'One')
      const sized = svg.querySelector('#end')!
      expect(Number(sized.getAttribute('markerWidth'))).toBeCloseTo(12.8)
      expect(Number(sized.getAttribute('markerHeight'))).toBeCloseTo(16)
      // A marker with no size keeps the SVG default rather than becoming 0 or NaN.
      const bare = svg.querySelector('#bare')!
      expect(bare.hasAttribute('markerWidth')).toBe(false)
      expect(bare.hasAttribute('markerHeight')).toBe(false)
    })

    it('moves sequence lifelines behind the message text', async () => {
      mermaidApi.render.mockResolvedValue({
        svg:
          '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<text class="messageText">first</text>' +
          '<g><line id="life-a" class="actor-line" x1="10" x2="10" y1="0" y2="90"></line></g>' +
          '<g transform="translate(5,0)"><line id="life-moved-group" class="actor-line" x1="40" x2="40" y1="0" y2="90"></line></g>' +
          '</svg>',
      })
      const svg = await renderMermaidDiagram('a', 'One')
      const behind = svg.firstElementChild!
      expect(behind.getAttribute('class')).toBe('doc-lifelines')
      expect(behind.querySelector('#life-a')).not.toBeNull()
      // A line under a transformed group would shift if moved, so it stays.
      const transformed = svg.querySelector('#life-moved-group')!
      expect(transformed.parentElement!.getAttribute('transform')).toBe('translate(5,0)')
      // Drawn first, so the text after it paints on top.
      expect(behind.compareDocumentPosition(svg.querySelector('.messageText')!)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    })

    it('leaves a diagram without lifelines unchanged', async () => {
      const svg = await renderMermaidDiagram('a', 'One')
      expect(svg.querySelector('.doc-lifelines')).toBeNull()
    })

    it('spaces shapes out so text never touches a box, a line or a subgraph title', async () => {
      await renderMermaidDiagram('a', 'One')
      const options = mermaidApi.initialize.mock.calls[0]?.[0]
      // Mermaid's defaults are padding 15, nodeSpacing 50, rankSpacing 50.
      expect(options.flowchart.padding).toBeGreaterThan(15)
      // Side by side stays near the default, so a diagram still fits the column.
      expect(options.flowchart.nodeSpacing).toBeGreaterThanOrEqual(40)
      expect(options.flowchart.rankSpacing).toBeGreaterThan(50)
      expect(options.flowchart.subGraphTitleMargin.top).toBeGreaterThan(0)
      expect(options.flowchart.subGraphTitleMargin.bottom).toBeGreaterThan(0)
      // Mermaid's defaults are actorMargin 50 and messageMargin 35; actors
      // keep the default so sequence diagrams still fit the column.
      expect(options.sequence.actorMargin).toBeGreaterThanOrEqual(50)
      expect(options.sequence.messageMargin).toBeGreaterThan(35)
    })

    it('keeps lines from running through edge labels', async () => {
      await renderMermaidDiagram('a', 'One')
      const options = mermaidApi.initialize.mock.calls[0]?.[0]
      const pageColour = options.themeVariables.background
      expect(options.themeVariables.edgeLabelBackground).toBe(pageColour)
      const themeCss: string = options.themeCSS
      const rule = themeCss.slice(
        themeCss.indexOf('.edgeLabel rect'),
        themeCss.indexOf('}', themeCss.indexOf('.edgeLabel rect')),
      )
      // A same-coloured outline widens the label's background into a gap.
      expect(rule).toContain(`fill: ${pageColour}`)
      expect(rule).toContain(`stroke: ${pageColour}`)
      expect(rule).toMatch(/stroke-width: \d+px/)
    })

    it('styles ONLINE and OFF GRID subgraphs apart by border style as well as colour', async () => {
      await renderMermaidDiagram('a', 'One')
      const themeCss: string = mermaidApi.initialize.mock.calls[0]?.[0].themeCSS
      const ruleFor = (selector: string) =>
        themeCss.slice(
          themeCss.indexOf(selector),
          themeCss.indexOf('}', themeCss.indexOf(selector)),
        )
      const online = ruleFor('.cluster.online rect')
      const offgrid = ruleFor('.cluster.offgrid rect')
      expect(online).toContain('stroke: none')
      expect(offgrid).toContain('stroke: #c8ff00')
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
