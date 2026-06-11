import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import SpaceStarfield from './SpaceStarfield.vue'

// jsdom has no 2D canvas context, so getContext returns null by default. Tests
// that need draw() to run its loop install a recording fake context.
interface RecordingContext {
  clearRect: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  arc: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  fillStyle: string
}

function recordingContext(): RecordingContext {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
  }
}

enableAutoUnmount(afterEach)

let lastContext: RecordingContext | null

function stubContext(context: RecordingContext | null) {
  lastContext = context
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context as unknown as CanvasRenderingContext2D,
  )
}

beforeEach(() => {
  lastContext = null
  // Deterministic star generation so geometry is reproducible.
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SpaceStarfield mount', () => {
  it('sizes the canvas to the window and seeds 220 stars drawn through the context', () => {
    stubContext(recordingContext())
    const wrapper = mount(SpaceStarfield)
    const canvas = wrapper.find('canvas').element as HTMLCanvasElement

    expect(canvas.width).toBe(window.innerWidth)
    expect(canvas.height).toBe(window.innerHeight)
    // init() draws 220 stars; resize() + init() both call draw(), but the arc
    // count proves the populated star loop ran.
    expect(lastContext!.arc).toHaveBeenCalledTimes(220)
    expect(lastContext!.fillStyle).toBe('rgba(255,255,255,0.5)')
  })

  it('tolerates a missing 2D context (no draw calls, no throw)', () => {
    stubContext(null)
    expect(() => mount(SpaceStarfield)).not.toThrow()
  })

  it('redraws on a window resize event', () => {
    stubContext(recordingContext())
    mount(SpaceStarfield)
    lastContext!.clearRect.mockClear()
    window.dispatchEvent(new Event('resize'))
    expect(lastContext!.clearRect).toHaveBeenCalled()
  })

  it('stops responding to resize after unmount', () => {
    stubContext(recordingContext())
    const wrapper = mount(SpaceStarfield)
    wrapper.unmount()
    lastContext!.clearRect.mockClear()
    window.dispatchEvent(new Event('resize'))
    expect(lastContext!.clearRect).not.toHaveBeenCalled()
  })
})

describe('SpaceStarfield exposed draw', () => {
  it('applies a parallax offset wrapped within the canvas bounds', () => {
    stubContext(recordingContext())
    const wrapper = mount(SpaceStarfield)
    lastContext!.arc.mockClear()
    ;(wrapper.vm as unknown as { draw: (x: number, y: number) => void }).draw(1000, 2000)
    // Every star is redrawn with the parallax offset applied.
    expect(lastContext!.arc).toHaveBeenCalledTimes(220)
    const [drawnX, drawnY] = lastContext!.arc.mock.calls[0] as number[]
    // Coordinates stay within the canvas after the modulo wrap.
    expect(drawnX).toBeGreaterThanOrEqual(0)
    expect(drawnX).toBeLessThanOrEqual(window.innerWidth)
    expect(drawnY).toBeGreaterThanOrEqual(0)
    expect(drawnY).toBeLessThanOrEqual(window.innerHeight)
  })

  it('is a no-op once the canvas is gone (after unmount)', () => {
    stubContext(recordingContext())
    const wrapper = mount(SpaceStarfield)
    const draw = (wrapper.vm as unknown as { draw: (x: number, y: number) => void }).draw
    wrapper.unmount()
    lastContext!.arc.mockClear()
    // Canvas ref is null after unmount → draw returns early without throwing.
    expect(() => draw(10, 10)).not.toThrow()
    expect(lastContext!.arc).not.toHaveBeenCalled()
  })
})
