/**
 * The globe's base map: Natural Earth land and borders painted onto an
 * equirectangular canvas in the app's dark "fiord" basemap colours (as the
 * site globe draws them, after the map's brightness/saturation filter).
 */
import { CanvasTexture, SRGBColorSpace, type WebGLRenderer } from 'three'
import { addRingToPath, strokeLine, type NaturalEarthSet } from './naturalEarth'

/** The map colours every globe layer paints with. */
export const EARTH_COLOURS = {
  ocean: '#252b39',
  land: '#2e3545',
  border: '#323c4c',
} as const

/** The WebGL clear colour behind the globe (space). */
export const SPACE_COLOUR = 0x0d0f14

/**
 * Whether this device should keep canvases small: phones (iOS especially) cap
 * total canvas memory, and a canvas over budget silently renders black.
 */
export function isSmallDevice(): boolean {
  return Math.min(screen.width, screen.height) < 900 || matchMedia('(pointer: coarse)').matches
}

/** A canvas texture set up the way every globe layer needs it. */
export function createLayerTexture(
  canvas: HTMLCanvasElement,
  renderer: WebGLRenderer,
): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  return texture
}

/**
 * True when the browser actually backed the canvas: one it could not allocate
 * reads back as transparent, and must be skipped rather than drawn black.
 */
export function canvasHasPixels(context: CanvasRenderingContext2D, size: number): boolean {
  try {
    return context.getImageData(size >> 1, size >> 1, 1, 1).data[3] !== 0
  } catch {
    return false
  }
}

/**
 * Paints the whole world, ocean then land then borders, onto a 2:1 canvas.
 *
 * @returns the canvas, or null when the browser could not back it.
 */
export function paintWorldCanvas(set: NaturalEarthSet, width: number): HTMLCanvasElement | null {
  const height = width / 2
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return null
  const projectX = (lon: number): number => ((lon + 180) / 360) * width
  const projectY = (lat: number): number => ((90 - lat) / 180) * height
  context.fillStyle = EARTH_COLOURS.ocean
  context.fillRect(0, 0, width, height)
  context.fillStyle = EARTH_COLOURS.land
  for (const polygon of set.land) {
    context.beginPath()
    for (const ring of polygon.rings) addRingToPath(context, ring, projectX, projectY)
    context.fill('evenodd')
  }
  context.strokeStyle = EARTH_COLOURS.border
  context.lineWidth = Math.max(1, width / 4096)
  for (const line of set.borders) strokeLine(context, line.rings[0]!, projectX, projectY)
  return canvasHasPixels(context, height) ? canvas : null
}

/** The base map's width in pixels for this device and GPU. */
export function baseMapWidth(renderer: WebGLRenderer): number {
  return isSmallDevice() ? 2048 : Math.min(4096, renderer.capabilities.maxTextureSize)
}
