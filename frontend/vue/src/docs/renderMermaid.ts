import DOMPurify from 'dompurify'

/**
 * Mermaid diagram rendering, loaded on demand.
 *
 * Mermaid is large, so it is imported only the first time a page actually has
 * a diagram (it becomes its own chunk). One configured instance serves every
 * diagram afterwards.
 */

/** Theme variables with AA contrast on the light island: text 4.5:1+, lines 3:1+. */
const THEME_VARIABLES = {
  background: '#f6f6f4',
  primaryColor: '#e8eaed',
  primaryBorderColor: '#5c5f66',
  primaryTextColor: '#16191d',
  lineColor: '#4a4d55',
  secondaryColor: '#ffffff',
  tertiaryColor: '#f1efe9',
  fontFamily: "'Barlow', 'Helvetica Neue', Arial, sans-serif",
  fontSize: '14px',
}

/**
 * Classes an author gives a node or a subgraph (`class Node accent`):
 * - `accent` highlights one node.
 * - `online` and `offgrid` mark which mode a part of a flow belongs to. Put
 *   each mode's nodes in a subgraph titled ONLINE or OFF GRID and give the
 *   subgraph the class: the title says it in words, and the border differs in
 *   colour and in style (solid / dashed), so colour is never the only cue.
 */
const ACCENT_NODE_CSS = `
  .node.accent rect, .node.accent polygon, .node.accent circle, .node.accent ellipse, .node.accent path {
    stroke: #446b00 !important;
    stroke-width: 2px !important;
    fill: rgba(200, 255, 0, 0.25) !important;
  }
  .cluster.online rect {
    stroke: #1d5a9e !important;
    stroke-width: 2px !important;
    fill: rgba(29, 90, 158, 0.07) !important;
  }
  .cluster.offgrid rect {
    stroke: #446b00 !important;
    stroke-width: 2px !important;
    stroke-dasharray: 6 4 !important;
    fill: rgba(200, 255, 0, 0.12) !important;
  }
  .cluster.online .cluster-label text, .cluster.online .cluster-label tspan { fill: #1d5a9e !important; font-weight: 600; }
  .cluster.offgrid .cluster-label text, .cluster.offgrid .cluster-label tspan { fill: #3a5c00 !important; font-weight: 600; }
`

type MermaidApi = typeof import('mermaid').default

let mermaidApi: Promise<MermaidApi> | undefined
let diagramCounter = 0

/**
 * Forgets the loaded Mermaid instance and the diagram counter, so a spec can
 * start from a clean module. Not used by the app.
 */
export function resetMermaidState(): void {
  mermaidApi = undefined
  diagramCounter = 0
}

function loadMermaid(): Promise<MermaidApi> {
  mermaidApi ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'base',
      themeVariables: THEME_VARIABLES,
      themeCSS: ACCENT_NODE_CSS,
      // 'strict' encodes HTML in labels and disables click handlers: the diagram
      // source is ours, but the renderer still treats it as untrusted.
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true },
      logLevel: 'fatal',
    })
    return mermaid
  })
  return mermaidApi
}

/**
 * Draws a Mermaid diagram.
 *
 * @param source The Mermaid text from the fence.
 * @param accessibleName Spoken name of the picture (the caption).
 * @returns The SVG element, marked as an image with that name.
 * @throws When the source is not valid Mermaid or the library cannot load; the
 *   caller shows the source and a warning instead.
 */
export async function renderMermaidDiagram(
  source: string,
  accessibleName: string,
): Promise<SVGElement> {
  const mermaid = await loadMermaid()
  // Parse first: a failed render can leave a stray error node in the document.
  await mermaid.parse(source)
  diagramCounter += 1
  const { svg } = await mermaid.render(`doc-diagram-${diagramCounter}`, source)
  // Mermaid's strict mode already encodes labels; sanitising the finished SVG
  // is the second line of defence before it goes into the page. Labels are SVG
  // text (htmlLabels is off), so the SVG profile loses nothing.
  const container = document.createElement('div')
  container.innerHTML = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
  const svgElement = container.querySelector('svg')
  if (!svgElement) throw new Error('Mermaid returned no SVG')
  // One picture with one name, instead of Mermaid's own document semantics.
  svgElement.setAttribute('role', 'img')
  svgElement.setAttribute('aria-label', accessibleName)
  svgElement.removeAttribute('aria-roledescription')
  svgElement.removeAttribute('aria-labelledby')
  svgElement.removeAttribute('aria-describedby')
  svgElement.querySelectorAll(':scope > title, :scope > desc').forEach((node) => node.remove())
  return svgElement
}
