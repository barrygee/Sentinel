import { describe, it, expect, vi } from 'vitest'
import maplibregl from 'maplibre-gl'
import { SentinelControlBase } from './SentinelControlBase'

// A minimal concrete subclass exercising the abstract base. `labelOverride`
// lets individual tests choose a text label vs. an HTML/SVG label.
class TestControl extends SentinelControlBase {
  onInitCalls = 0
  handleClickCalls = 0
  constructor(private readonly labelOverride = 'X') {
    super()
  }
  get buttonLabel(): string {
    return this.labelOverride
  }
  get buttonTitle(): string {
    return 'Test control title'
  }
  protected onInit(): void {
    this.onInitCalls++
  }
  protected handleClick(): void {
    this.handleClickCalls++
  }
  // Expose the protected active-state helper for direct testing.
  setActive(active: boolean): void {
    this.setButtonActive(active)
  }
}

function fakeMap(): maplibregl.Map {
  return { flyTo: vi.fn() } as unknown as maplibregl.Map
}

describe('SentinelControlBase.onAdd', () => {
  it('stores the map, builds the styled container, and runs onInit', () => {
    const control = new TestControl()
    const map = fakeMap()
    const element = control.onAdd(map)

    expect(control.map).toBe(map)
    expect(element.className).toBe('maplibregl-ctrl')
    expect(element.style.background).toBe('rgb(0, 0, 0)')
    expect(control.onInitCalls).toBe(1)
    expect(element.querySelector('button')).toBe(control.button)
  })

  it('sets the button title from buttonTitle', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    expect(control.button.title).toBe('Test control title')
  })

  it('exposes buttonTitle as the accessible name via aria-label', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    expect(control.button.getAttribute('aria-label')).toBe('Test control title')
  })

  it('renders a plain label via textContent', () => {
    const control = new TestControl('R')
    control.onAdd(fakeMap())
    expect(control.button.textContent).toBe('R')
    expect(control.button.innerHTML).toBe('R')
  })

  it('renders an HTML/SVG label via innerHTML when it starts with "<"', () => {
    const control = new TestControl('<svg><rect></rect></svg>')
    control.onAdd(fakeMap())
    expect(control.button.querySelector('rect')).not.toBeNull()
  })

  it('invokes handleClick when the button is clicked', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    control.button.dispatchEvent(new MouseEvent('click'))
    expect(control.handleClickCalls).toBe(1)
  })

  it('darkens the button background on hover and restores it on mouseout', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    control.button.dispatchEvent(new MouseEvent('mouseover'))
    expect(control.button.style.background).toBe('rgb(17, 17, 17)')
    control.button.dispatchEvent(new MouseEvent('mouseout'))
    expect(control.button.style.background).toBe('rgb(0, 0, 0)')
  })
})

describe('SentinelControlBase.handleClickPublic', () => {
  it('delegates to the protected handleClick', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    control.handleClickPublic()
    expect(control.handleClickCalls).toBe(1)
  })
})

describe('SentinelControlBase.onRemove', () => {
  it('detaches the container from its parent and clears the map reference', () => {
    const control = new TestControl()
    const map = fakeMap()
    const element = control.onAdd(map)
    document.body.appendChild(element)
    expect(element.parentNode).toBe(document.body)

    control.onRemove()
    expect(element.parentNode).toBeNull()
    expect(control.map).toBeUndefined()
  })

  it('is a no-op for the container when it was never attached to the DOM', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    // Container has no parent — the optional-chaining guard must not throw.
    expect(() => control.onRemove()).not.toThrow()
    expect(control.map).toBeUndefined()
  })
})

describe('SentinelControlBase.setButtonActive', () => {
  it('renders the active state with full opacity and the highlight colour', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    control.setActive(true)
    expect(control.button.style.opacity).toBe('1')
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
  })

  it('renders the inactive state dimmed and white', () => {
    const control = new TestControl()
    control.onAdd(fakeMap())
    control.setActive(false)
    expect(control.button.style.opacity).toBe('0.3')
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
  })

  it('short-circuits when there is no button yet', () => {
    const control = new TestControl()
    // onAdd has not run, so `this.button` is undefined — the guard returns early.
    expect(() => control.setActive(true)).not.toThrow()
  })
})
