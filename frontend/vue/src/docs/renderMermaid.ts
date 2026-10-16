import DOMPurify from 'dompurify'

/**
 * Mermaid diagram rendering, loaded on demand.
 *
 * Mermaid is large, so it is imported only the first time a page actually has
 * a diagram (it becomes its own chunk). One configured instance serves every
 * diagram afterwards.
 */

/**
 * The app's dark palette (frontend/assets/template.css, `.theme-dark`): the
 * canvas the map panels sit on, the panel grey for boxes, white ink. Diagrams
 * are drawn on a dark panel (DocsDiagram) even on the light docs page, so they
 * look like the rest of the app. Text is 4.5:1+ and lines 3:1+ on the canvas.
 */
const DIAGRAM_CANVAS = '#15171d'

const THEME_VARIABLES = {
  background: DIAGRAM_CANVAS,
  primaryColor: '#26292e',
  // Borders match their fills: boxes are set apart by fill and spacing alone.
  primaryBorderColor: '#26292e',
  primaryTextColor: '#ffffff',
  textColor: '#ffffff',
  titleColor: '#ffffff',
  lineColor: '#9a9ca1',
  secondaryColor: '#13171f',
  tertiaryColor: '#1c1f26',
  clusterBkg: '#1c1f26',
  clusterBorder: '#1c1f26',
  // Sequence diagrams: actors and notes in the panel grey, messages in light grey.
  actorBkg: '#26292e',
  actorBorder: '#26292e',
  actorTextColor: '#ffffff',
  actorLineColor: '#5c5f66',
  signalColor: '#9a9ca1',
  signalTextColor: '#ffffff',
  noteBkgColor: '#1c1f26',
  noteBorderColor: '#1c1f26',
  noteTextColor: '#ffffff',
  labelBoxBkgColor: '#26292e',
  labelBoxBorderColor: '#26292e',
  labelTextColor: '#ffffff',
  loopTextColor: '#ffffff',
  fontFamily: "'Barlow', 'Helvetica Neue', Arial, sans-serif",
  fontSize: '14px',
  // An edge label sits on its line; the canvas colour behind it (widened by the
  // same-coloured outline in DIAGRAM_CSS) leaves a gap between line and text.
  edgeLabelBackground: DIAGRAM_CANVAS,
}

/**
 * Room around and between shapes, so text never touches a box edge, a line or
 * a subgraph's title. Mermaid's defaults pack flowcharts tightly enough that
 * labels and lines overlap. Side-by-side spacing is kept moderate so a diagram
 * still fits the column at full text size.
 */
const FLOWCHART_SPACING = {
  /** Space between a node's text and its border. */
  padding: 16,
  /** Space between nodes side by side. */
  nodeSpacing: 44,
  /** Space between ranks, which is where edge labels sit. */
  rankSpacing: 60,
  /** Space around the whole diagram. */
  diagramPadding: 20,
  /**
   * Space above an ONLINE / OFF GRID title (from the box's top edge) and below
   * it (to the first node). Mermaid grows the box by this after laying it
   * out, so stacked subgraphs need the rank spacing above to stay apart.
   */
  subGraphTitleMargin: { top: 14, bottom: 12 },
}

/** The same idea for sequence diagrams: more room between actors and messages. */
const SEQUENCE_SPACING = {
  actorMargin: 50,
  boxMargin: 14,
  boxTextMargin: 8,
  noteMargin: 14,
  messageMargin: 44,
}

/**
 * Classes an author gives a node or a subgraph (`class Node accent`):
 * - `accent` highlights one node.
 * - `online` and `offgrid` mark which mode a part of a flow belongs to. Put
 *   each mode's nodes in a subgraph titled ONLINE or OFF GRID and give the
 *   subgraph the class: the title says it in words, and the border differs
 *   in style (none / dashed), so colour is never the only cue. ONLINE is a
 *   faint white wash with no border; OFF GRID keeps a dashed brand-lime one.
 * - Nothing else has a border: boxes are set apart by fill and spacing.
 * - Arrowheads are lighter than their lines (and enlarged), so which way data
 *   flows stands out.
 */
const DIAGRAM_CSS = `
  .node.accent rect, .node.accent polygon, .node.accent circle, .node.accent ellipse, .node.accent path {
    stroke: #c8ff00 !important;
    stroke-width: 1.5px !important;
    fill: rgba(200, 255, 0, 0.16) !important;
  }
  .node rect, .node polygon, .node circle, .node ellipse, .cluster rect {
    stroke: none !important;
  }
  .cluster.online rect {
    stroke: none !important;
    fill: rgba(255, 255, 255, 0.05) !important;
  }
  .cluster.offgrid rect {
    stroke: #c8ff00 !important;
    stroke-width: 1.5px !important;
    stroke-dasharray: 6 4 !important;
    fill: rgba(200, 255, 0, 0.06) !important;
  }
  .flowchart-link { stroke-width: 1.5px !important; }
  marker path, .arrowheadPath, .arrowMarkerPath {
    fill: #e8eaed !important;
    stroke: #e8eaed !important;
  }
  /* Sequence message text sits across lifelines: a canvas-coloured outline
     drawn behind each letter keeps the lines from running through it. */
  .messageText, .noteText, .loopText {
    paint-order: stroke;
    stroke: ${DIAGRAM_CANVAS};
    stroke-width: 12px;
    stroke-linejoin: round;
  }
  .edgeLabel rect, .edgeLabel .labelBkg {
    fill: ${DIAGRAM_CANVAS} !important;
    stroke: ${DIAGRAM_CANVAS} !important;
    stroke-width: 12px !important;
    opacity: 1 !important;
  }
  .cluster.online .cluster-label text, .cluster.online .cluster-label tspan { fill: #ffffff !important; font-weight: 600; letter-spacing: 0.12em; }
  .cluster.offgrid .cluster-label text, .cluster.offgrid .cluster-label tspan { fill: #c8ff00 !important; font-weight: 600; letter-spacing: 0.12em; }
`

/**
 * How much larger than Mermaid's own arrowheads to draw them, so the direction
 * data flows reads at a glance. Mermaid sizes a marker by its attributes, which
 * CSS can't reach, so they are scaled after drawing (`enlargeArrowheads`).
 */
const ARROWHEAD_SCALE = 1.6

/** Scales every arrowhead (`<marker>`) in a drawn diagram by ARROWHEAD_SCALE. */
function enlargeArrowheads(svgElement: SVGElement): void {
  svgElement.querySelectorAll('marker').forEach((marker) => {
    for (const attribute of ['markerWidth', 'markerHeight']) {
      const size = Number(marker.getAttribute(attribute))
      // A marker without a size uses the SVG default; leave that alone.
      if (size > 0) marker.setAttribute(attribute, String(size * ARROWHEAD_SCALE))
    }
  })
}

/**
 * Moves a sequence diagram's lifelines behind everything else. Mermaid draws
 * them after the message text, so a lifeline runs over any text that crosses
 * it (a self-message's label). Only lines with no transformed ancestor move,
 * so moving one never shifts it.
 */
function sendLifelinesToBack(svgElement: SVGElement): void {
  const isUntransformed = (line: Element): boolean => {
    let ancestor: Element | null = line.parentElement
    while (ancestor && ancestor !== svgElement) {
      if (ancestor.hasAttribute('transform')) return false
      ancestor = ancestor.parentElement
    }
    return true
  }
  const lifelines = [...svgElement.querySelectorAll('.actor-line')].filter(isUntransformed)
  if (lifelines.length === 0) return
  const behind = document.createElementNS('http://www.w3.org/2000/svg', 'g')
  behind.setAttribute('class', 'doc-lifelines')
  lifelines.forEach((line) => behind.appendChild(line))
  svgElement.insertBefore(behind, svgElement.firstChild)
}

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
      themeCSS: DIAGRAM_CSS,
      // 'strict' encodes HTML in labels and disables click handlers: the diagram
      // source is ours, but the renderer still treats it as untrusted.
      securityLevel: 'strict',
      htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: true, ...FLOWCHART_SPACING },
      sequence: SEQUENCE_SPACING,
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
  enlargeArrowheads(svgElement)
  sendLifelinesToBack(svgElement)
  // One picture with one name, instead of Mermaid's own document semantics.
  svgElement.setAttribute('role', 'img')
  svgElement.setAttribute('aria-label', accessibleName)
  svgElement.removeAttribute('aria-roledescription')
  svgElement.removeAttribute('aria-labelledby')
  svgElement.removeAttribute('aria-describedby')
  svgElement.querySelectorAll(':scope > title, :scope > desc').forEach((node) => node.remove())
  return svgElement
}
