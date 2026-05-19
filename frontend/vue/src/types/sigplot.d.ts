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

    /** Remove a layer by its uuid. */
    remove_layer(layerUuid: string): void

    /** Look up a layer object by uuid or index. */
    get_layer(layer: string | number): unknown

    /** Detach window/DOM event listeners (cleanup). */
    disable_listeners(): void

    /** Force a redraw. */
    refresh(): void
  }

  export const plugins: Record<string, unknown>

  const sigplot: {
    Plot: typeof Plot
    plugins: Record<string, unknown>
  }
  export default sigplot
}
