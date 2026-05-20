/**
 * Hand-written ambient types for the `sigplot` npm package (v3.1.7).
 *
 * sigplot is CommonJS-only and ships no type declarations. It exports a
 * `sigplot` namespace object with a `Plot` constructor. Only the subset of the
 * API used by SdrWaterfall.vue is typed here; everything else is intentionally
 * loose. See node_modules/sigplot/js/sigplot.js for the full implementation.
 */
declare module 'sigplot' {
  /** Layer/plot option bag — sigplot accepts many loosely-typed keys. */
  export interface SigPlotOptions {
    [key: string]: unknown
  }

  /** Per-layer overrides passed to overlay_pipe / overlay_array. */
  export interface SigPlotOverrides {
    /** 1000 = 1-D (line), 2000 = 2-D (raster/waterfall). */
    type?: number
    /** Number of elements per frame/row. */
    subsize?: number
    /** X spacing between samples. */
    xdelta?: number
    /** X start value. */
    xstart?: number
    /** X units code (3 = Hz). */
    xunits?: number
    /** Y units code. */
    yunits?: number
    [key: string]: unknown
  }

  /** Layer creation options. */
  export interface SigPlotLayerOptions {
    name?: string
    framesize?: number
    /** Waterfall scroll direction. */
    drawmode?: 'scrolling' | 'falling' | 'rising'
    [key: string]: unknown
  }

  export class Plot {
    constructor(element: HTMLElement, options?: SigPlotOptions)

    /** Create a streaming pipe layer; returns the layer uuid string. */
    overlay_pipe(
      overrides?: SigPlotOverrides,
      layerOptions?: SigPlotLayerOptions,
    ): string

    /** Create a static array layer; returns the layer uuid string. */
    overlay_array(
      data: ArrayLike<number> | null,
      overrides?: SigPlotOverrides,
      layerOptions?: SigPlotLayerOptions,
    ): string

    /** Push a frame of data into a pipe layer. */
    push(
      layer: string | number,
      data: ArrayLike<number>,
      hdrmod?: SigPlotOptions,
      sync?: boolean,
      rsync?: boolean,
    ): void

    /** Replace the data of an array layer. */
    reload(
      layer: string | number,
      data: ArrayLike<number>,
      hdrmod?: SigPlotOptions,
      rsync?: boolean,
    ): void

    /** Change plot-wide settings (cmap, zmin, zmax, etc.). */
    change_settings(settings: SigPlotOptions): void

    /** Zoom to a data-coordinate box. Omit x/y to keep that axis full-range;
     *  continuous=true updates the current zoom level in place. */
    zoom(
      ul: { x?: number; y?: number },
      lr: { x?: number; y?: number },
      continuous?: boolean,
    ): void

    /** Unzoom one or more levels (all if omitted). */
    unzoom(levels?: number): void

    /** Recompute layout after the container element resizes. */
    checkresize(): void

    /** Add a plugin (e.g. AccordionPlugin); higher zorder renders on top. */
    add_plugin(plugin: AccordionPlugin | BoxesPlugin | AnnotationPlugin, zorder?: number): void

    /** Remove a previously added plugin instance. */
    remove_plugin(plugin: AccordionPlugin | BoxesPlugin | AnnotationPlugin): void

    /** Force a full redraw (re-runs plugin rendering). */
    redraw(): void

    /** Remove a layer by its uuid. */
    remove_layer(layerUuid: string): void

    /** Look up a layer object by uuid or index. */
    get_layer(layer: string | number): unknown

    /** Detach window/DOM event listeners (cleanup). */
    disable_listeners(): void

    /** Force a redraw. */
    refresh(): void
  }

  /** Stroke styling for the accordion centre / edge lines. */
  export interface AccordionLineStyle {
    strokeStyle?: string
    lineWidth?: number
    lineCap?: string
  }

  /** Constructor properties for the Accordion plugin (subset used here). */
  export interface AccordionProperties {
    /** Centre in plot x-units (mode 'absolute') or 0..1 (mode 'relative'). */
    center?: number
    /** Width in plot x-units (mode 'absolute') or fraction (mode 'relative'). */
    width?: number
    mode?: 'absolute' | 'relative'
    direction?: 'vertical' | 'horizontal'
    shade_area?: boolean
    draw_center_line?: boolean
    draw_edge_lines?: boolean
    prevent_drag?: boolean
    prevent_move?: boolean
    prevent_resize?: boolean
    min_width?: number
    max_width?: number
    discrete_widths?: number[]
    fill_style?: { fillStyle?: string; opacity?: number }
    center_line_style?: AccordionLineStyle
    edge_line_style?: AccordionLineStyle
    text?: string | null
    textPosition?: {
      horizontal?: 'left' | 'middle' | 'right'
      vertical?: 'top' | 'middle' | 'bottom'
    }
    [key: string]: unknown
  }

  export interface AccordionChangeEvent {
    center: number
    width: number
    type: string
    target: AccordionPlugin
  }

  /**
   * SigPlot Accordion plugin: a draggable centre line + resizable shaded band.
   * Fluent accessors return the value with no arg, or set + refresh with one.
   *
   * NOTE: the 'change' event fires only when center/width are set
   * programmatically — NOT on user drag-end (sigplot's _onDocMouseUp is dead
   * code). Detect drags via a document mouseup + reading center()/width().
   */
  export class AccordionPlugin {
    constructor(properties?: AccordionProperties)
    center(): number
    center(value: number): this
    width(): number
    width(value: number): this
    min_width(): number
    min_width(value: number): this
    max_width(): number
    max_width(value: number): this
    display(): boolean
    display(value: boolean): this
    on(type: 'change', fn: (evt: AccordionChangeEvent) => void): void
    off(type: string, fn?: (...args: unknown[]) => void): void
  }

  /** Constructor properties for the Boxes plugin (subset used here). */
  export interface BoxesPluginOptions {
    display?: boolean
    enableSelect?: boolean
    enableMove?: boolean
    enableResize?: boolean
    lineWidth?: number
    alpha?: number
    font?: string
    fill?: boolean
    strokeStyle?: string
    fillStyle?: string
    absolutePlacement?: boolean
  }

  /** Per-box spec passed to BoxesPlugin.add_box(). */
  export interface BoxSpec {
    /** Upper-left x in plot data units (origin 1: top-left of the box). */
    x: number
    /** Upper-left y in plot data units. */
    y: number
    /** Width along x (data units). */
    w: number
    /** Height along y (data units). */
    h: number
    text?: string
    fill?: boolean
    fillStyle?: string
    strokeStyle?: string
    alpha?: number
    lineWidth?: number
    font?: string
    absolutePlacement?: boolean
  }

  /**
   * SigPlot Boxes plugin: draws rectangular overlays in plot data coordinates
   * (or absolute pixels). Used here for the static RF band-plan overlay so
   * boxes pan/zoom with the spectrum trace.
   */
  export class BoxesPlugin {
    constructor(options?: BoxesPluginOptions)
    add_box(box: BoxSpec): string
    remove_box(id: string): void
    clear_boxes(): void
  }

  /** Per-annotation spec passed to AnnotationPlugin.add_annotation(). */
  export interface AnnotationSpec {
    /** Position in plot data units (x). */
    x: number
    /** Position in plot data units (y). */
    y: number
    /** Text to render (or an HTMLImageElement / HTMLCanvasElement). */
    value: string
    font?: string
    color?: string
    textAlign?: 'left' | 'center' | 'right' | 'start' | 'end'
    textBaseline?: 'top' | 'middle' | 'bottom' | 'alphabetic' | 'hanging' | 'ideographic'
  }

  /** AnnotationPlugin constructor options (subset used here). */
  export interface AnnotationPluginOptions {
    display?: boolean
    textAlign?: 'left' | 'center' | 'right' | 'start' | 'end'
    textBaseline?: 'top' | 'middle' | 'bottom' | 'alphabetic' | 'hanging' | 'ideographic'
  }

  /**
   * SigPlot Annotation plugin: draws text labels at plot data coordinates.
   * Used here for band-plan labels (BoxesPlugin's own text rendering puts the
   * label outside the box's left edge, which is wrong for full-width bands).
   */
  export class AnnotationPlugin {
    constructor(options?: AnnotationPluginOptions)
    add_annotation(annotation: AnnotationSpec): void
    clear_annotations(): void
  }

  export interface SigPlotPlugins {
    AccordionPlugin: typeof AccordionPlugin
    BoxesPlugin: typeof BoxesPlugin
    AnnotationPlugin: typeof AnnotationPlugin
    [key: string]: unknown
  }

  export const plugins: SigPlotPlugins

  const sigplot: {
    Plot: typeof Plot
    plugins: SigPlotPlugins
  }
  export default sigplot
}
