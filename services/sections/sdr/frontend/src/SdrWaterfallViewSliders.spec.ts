import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import SdrWaterfallViewSliders from './SdrWaterfallViewSliders.vue'
import { ZOOM_MAX, ZOOM_MIN } from './composables/useWaterfallViewRange'

enableAutoUnmount(afterEach)

let frameCallbacks: FrameRequestCallback[]
let observers: Array<{
  callback: ResizeObserverCallback
  observed: Element[]
  disconnect: () => void
}>

beforeEach(() => {
  frameCallbacks = []
  observers = []
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frameCallbacks.push(callback)
    return frameCallbacks.length
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      callback: ResizeObserverCallback
      observed: Element[] = []
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
        observers.push(this)
      }
      observe(element: Element) {
        this.observed.push(element)
      }
      unobserve() {}
    },
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function mountSliders(
  props: { zoom?: number; zmax?: number; zmin?: number; disabled?: boolean } = {},
) {
  return mount(SdrWaterfallViewSliders, {
    props: { zoom: 1, zmax: 0, zmin: -100, disabled: false, ...props },
    attachTo: document.body,
  })
}

function sliders(wrapper: ReturnType<typeof mountSliders>) {
  const inputs = wrapper.findAll('input[type="range"]')
  return { zoom: inputs[0]!, max: inputs[1]!, min: inputs[2]! }
}

describe('SdrWaterfallViewSliders — rendering', () => {
  it('labels the three sliders', () => {
    expect(
      mountSliders()
        .findAll('.sdr-wf-ctl-label')
        .map((label) => label.text()),
    ).toEqual(['Zoom', 'Max', 'Min'])
  })

  it('names each slider with its current value', () => {
    const { zoom, max, min } = sliders(mountSliders({ zoom: 4, zmax: -10, zmin: -90 }))
    expect(zoom.attributes('aria-label')).toBe('Zoom 4x')
    expect(max.attributes('aria-label')).toBe('Max -10 dB')
    expect(min.attributes('aria-label')).toBe('Min -90 dB')
  })

  it('bounds Zoom by the view range limits', () => {
    const { zoom } = sliders(mountSliders())
    expect(zoom.attributes('min')).toBe(String(ZOOM_MIN))
    expect(zoom.attributes('max')).toBe(String(ZOOM_MAX))
  })

  it('shows the dB sliders as positive magnitudes', () => {
    const { max, min } = sliders(mountSliders({ zmax: -10, zmin: -90 }))
    expect((max.element as HTMLInputElement).value).toBe('10')
    expect((min.element as HTMLInputElement).value).toBe('90')
  })

  it('disables every slider when told to', () => {
    const { zoom, max, min } = sliders(mountSliders({ disabled: true }))
    expect([zoom, max, min].every((input) => input.attributes('disabled') !== undefined)).toBe(true)
  })

  it('enables every slider otherwise', () => {
    const { zoom, max, min } = sliders(mountSliders())
    expect([zoom, max, min].every((input) => input.attributes('disabled') === undefined)).toBe(true)
  })
})

describe('SdrWaterfallViewSliders — models', () => {
  it('emits the new zoom as a number', async () => {
    const wrapper = mountSliders()
    await sliders(wrapper).zoom.setValue('7.5')
    expect(wrapper.emitted('update:zoom')).toEqual([[7.5]])
  })

  it('negates the Max and Min slider positions back into dB', async () => {
    const wrapper = mountSliders()
    await sliders(wrapper).max.setValue('20')
    await sliders(wrapper).min.setValue('80')
    expect(wrapper.emitted('update:zmax')).toEqual([[-20]])
    expect(wrapper.emitted('update:zmin')).toEqual([[-80]])
  })
})

describe('SdrWaterfallViewSliders — slider sizing', () => {
  it('sizes each rotated slider to its wrapper height once layout settles', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(240)
    const wrapper = mountSliders()
    const slider = wrapper.find<HTMLElement>('.sdr-wf-slider').element
    expect(slider.style.getPropertyValue('--wf-slider-len')).toBe('')
    frameCallbacks.forEach((callback) => callback(0))
    const lengths = wrapper
      .findAll<HTMLElement>('.sdr-wf-slider')
      .map((input) => input.element.style.getPropertyValue('--wf-slider-len'))
    expect(lengths).toEqual(['240px', '240px', '240px'])
  })

  it('re-sizes when the column resizes', () => {
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100)
    const wrapper = mountSliders()
    expect(observers).toHaveLength(1)
    expect(observers[0]!.observed).toEqual([wrapper.find('.sdr-wf-controls').element])
    height.mockReturnValue(320)
    observers[0]!.callback([], observers[0] as unknown as ResizeObserver)
    expect(
      wrapper.find<HTMLElement>('.sdr-wf-slider').element.style.getPropertyValue('--wf-slider-len'),
    ).toBe('320px')
  })

  it('stops observing on unmount and ignores a frame that lands after it', () => {
    const wrapper = mountSliders()
    const observer = observers[0]!
    wrapper.unmount()
    expect(observer.disconnect).toHaveBeenCalledTimes(1)
    expect(() => frameCallbacks.forEach((callback) => callback(0))).not.toThrow()
  })
})

describe('SdrWaterfallViewSliders — accessibility', () => {
  it('has no axe violations enabled or disabled', async () => {
    expect(await axe(mountSliders().element as HTMLElement)).toHaveNoViolations()
    expect(await axe(mountSliders({ disabled: true }).element as HTMLElement)).toHaveNoViolations()
  })
})
