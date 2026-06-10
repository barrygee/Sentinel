import { describe, it, expect, vi } from 'vitest'
import maplibregl from 'maplibre-gl'
import { ClearOverlaysControl } from './ClearOverlaysControl'

// Builders for the sibling-control fakes. Each exposes only the surface
// ClearOverlaysControl touches; `visible` flags drive which ones get toggled.
function fakeToggleControl(initiallyVisible: boolean) {
  const control = {
    visible: initiallyVisible,
    toggle: vi.fn(() => {
      control.visible = !control.visible
    }),
  }
  return control
}

function fakeRoads(visible: boolean) {
  const control = {
    roadsVisible: visible,
    handleClickPublic: vi.fn(() => {
      control.roadsVisible = !control.roadsVisible
    }),
  }
  return control
}
function fakeNames(visible: boolean) {
  const control = {
    namesVisible: visible,
    handleClickPublic: vi.fn(() => {
      control.namesVisible = !control.namesVisible
    }),
  }
  return control
}
function fakeRings(visible: boolean) {
  const control = {
    ringsVisible: visible,
    handleClickPublic: vi.fn(() => {
      control.ringsVisible = !control.ringsVisible
    }),
  }
  return control
}

function fakeAdsb(
  options: { visible?: boolean; followEnabled?: boolean; selectedHex?: string | null } = {},
) {
  return {
    visible: options.visible ?? true,
    _followEnabled: options.followEnabled ?? false,
    _selectedHex: options.selectedHex ?? null,
    setAllHidden: vi.fn(),
    setLabelsVisible: vi.fn(),
    map: { setLayoutProperty: vi.fn() },
  }
}

function fakeLabels(visible: boolean) {
  return {
    labelsVisible: visible,
    button: { style: { opacity: '', color: '' } } as unknown as HTMLButtonElement,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildControls(overrides: Record<string, any> = {}): any {
  return {
    adsb: fakeAdsb(),
    adsbLabels: fakeLabels(true),
    roads: fakeRoads(true),
    names: fakeNames(true),
    rangeRings: fakeRings(true),
    airports: fakeToggleControl(true),
    militaryBases: fakeToggleControl(true),
    aara: fakeToggleControl(true),
    awacs: fakeToggleControl(true),
    ...overrides,
  }
}

const emptyMap = {} as unknown as maplibregl.Map

describe('ClearOverlaysControl basics', () => {
  it('exposes its label and title', () => {
    const control = new ClearOverlaysControl(buildControls())
    expect(control.buttonLabel).toBe('✕')
    expect(control.buttonTitle).toBe('Toggle all overlays')
  })

  it('renders dimmed on init', () => {
    const control = new ClearOverlaysControl(buildControls())
    control.onAdd(emptyMap)
    expect(control.button.style.opacity).toBe('0.3')
    expect(control.button.style.fontSize).toBe('14px')
  })
})

describe('ClearOverlaysControl hide', () => {
  it('hides every visible overlay, records their states, and activates the button', () => {
    const controls = buildControls()
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic()

    expect(controls.roads.handleClickPublic).toHaveBeenCalledOnce()
    expect(controls.names.handleClickPublic).toHaveBeenCalledOnce()
    expect(controls.rangeRings.handleClickPublic).toHaveBeenCalledOnce()
    expect(controls.aara.toggle).toHaveBeenCalledOnce()
    expect(controls.awacs.toggle).toHaveBeenCalledOnce()
    expect(controls.airports.toggle).toHaveBeenCalledOnce()
    expect(controls.militaryBases.toggle).toHaveBeenCalledOnce()
    expect(controls.adsb.setAllHidden).toHaveBeenCalledWith(true)
    expect(controls.adsb.setLabelsVisible).toHaveBeenCalledWith(false)
    expect(controls.adsb.map.setLayoutProperty).toHaveBeenCalledWith(
      'adsb-trails',
      'visibility',
      'none',
    )

    expect(control._cleared).toBe(true)
    expect(control.savedStates).toMatchObject({ roads: true, adsb: true })
    expect(control.button.style.color).toBe('rgb(200, 255, 0)')
  })

  it('does not toggle overlays that are already hidden', () => {
    const controls = buildControls({
      roads: fakeRoads(false),
      names: fakeNames(false),
      rangeRings: fakeRings(false),
      airports: fakeToggleControl(false),
      militaryBases: fakeToggleControl(false),
      aara: fakeToggleControl(false),
      awacs: fakeToggleControl(false),
      adsb: fakeAdsb({ visible: false }),
    })
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic()

    expect(controls.roads.handleClickPublic).not.toHaveBeenCalled()
    expect(controls.airports.toggle).not.toHaveBeenCalled()
    expect(controls.adsb.setAllHidden).not.toHaveBeenCalled()
    expect(control.savedStates).toMatchObject({ roads: false, adsb: false })
  })

  it('keeps the aircraft trail when following a selected aircraft', () => {
    const controls = buildControls({
      adsb: fakeAdsb({ visible: true, followEnabled: true, selectedHex: 'abc123' }),
    })
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic()
    // Trails layer must NOT be hidden while following.
    expect(controls.adsb.map.setLayoutProperty).not.toHaveBeenCalled()
  })

  it('swallows errors from the trail layer-visibility call', () => {
    const adsb = fakeAdsb({ visible: true })
    adsb.map.setLayoutProperty = vi.fn(() => {
      throw new Error('no such layer')
    })
    const control = new ClearOverlaysControl(buildControls({ adsb }))
    control.onAdd(emptyMap)
    expect(() => control.handleClickPublic()).not.toThrow()
    expect(control._cleared).toBe(true)
  })

  it('tolerates null sibling controls', () => {
    const controls = buildControls({
      roads: null,
      names: null,
      rangeRings: null,
      airports: null,
      militaryBases: null,
      aara: null,
      awacs: null,
      adsb: null,
      adsbLabels: null,
    })
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)
    expect(() => control.handleClickPublic()).not.toThrow()
    expect(control.savedStates).toMatchObject({ roads: false, adsb: false })
  })
})

describe('ClearOverlaysControl restore', () => {
  it('restores the previously-visible overlays on a second toggle', () => {
    const controls = buildControls()
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic() // hide all
    // Clear call history so we only see restore-phase calls.
    vi.clearAllMocks()

    control.handleClickPublic() // restore

    expect(controls.roads.handleClickPublic).toHaveBeenCalledOnce()
    expect(controls.aara.toggle).toHaveBeenCalledOnce()
    expect(controls.adsb.setAllHidden).toHaveBeenCalledWith(false)
    expect(controls.adsb.map.setLayoutProperty).toHaveBeenCalledWith(
      'adsb-trails',
      'visibility',
      'visible',
    )
    expect(controls.adsb.setLabelsVisible).toHaveBeenCalledWith(true)
    expect(control._cleared).toBe(false)
    expect(control.button.style.color).toBe('rgb(255, 255, 255)')
  })

  it('does not re-toggle an overlay that was not previously visible', () => {
    const controls = buildControls({ roads: fakeRoads(false) })
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic() // hide (roads already off → not saved)
    vi.clearAllMocks()
    control.handleClickPublic() // restore

    expect(controls.roads.handleClickPublic).not.toHaveBeenCalled()
  })

  it('restores ADS-B without labels when there is no labels control', () => {
    const controls = buildControls({ adsbLabels: null })
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic()
    vi.clearAllMocks()
    control.handleClickPublic()

    expect(controls.adsb.setAllHidden).toHaveBeenCalledWith(false)
  })

  it('only resets the cleared flag when there are no saved states', () => {
    const control = new ClearOverlaysControl(buildControls())
    control.onAdd(emptyMap)
    // Force the "cleared but nothing saved" edge case directly.
    control._cleared = true
    control.savedStates = null

    control.handleClickPublic()
    expect(control._cleared).toBe(false)
  })

  it('does not re-toggle overlays the user re-enabled while cleared', () => {
    const controls = buildControls()
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic() // hide all
    // Simulate the user turning overlays back on while cleared.
    controls.roads.roadsVisible = true
    controls.names.namesVisible = true
    controls.rangeRings.ringsVisible = true
    controls.aara.visible = true
    controls.awacs.visible = true
    controls.airports.visible = true
    controls.militaryBases.visible = true
    vi.clearAllMocks()

    control.handleClickPublic() // restore — everything is already visible

    expect(controls.roads.handleClickPublic).not.toHaveBeenCalled()
    expect(controls.names.handleClickPublic).not.toHaveBeenCalled()
    expect(controls.rangeRings.handleClickPublic).not.toHaveBeenCalled()
    expect(controls.aara.toggle).not.toHaveBeenCalled()
    expect(controls.airports.toggle).not.toHaveBeenCalled()
  })

  it('tolerates null sibling controls during restore', () => {
    const controls = buildControls()
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)
    control.handleClickPublic() // hide → savedStates captured

    // Null out the controls before restoring; the optional chaining must hold.
    control['_controls'] = buildControls({
      roads: null,
      names: null,
      rangeRings: null,
      aara: null,
      awacs: null,
      airports: null,
      militaryBases: null,
      adsb: null,
      adsbLabels: null,
    })
    expect(() => control.handleClickPublic()).not.toThrow()
    expect(control._cleared).toBe(false)
  })

  it('restores ADS-B labels to hidden when they were hidden before clearing', () => {
    const controls = buildControls({ adsbLabels: fakeLabels(false) })
    const control = new ClearOverlaysControl(controls)
    control.onAdd(emptyMap)

    control.handleClickPublic() // hide (saved adsbLabels = false)
    control.handleClickPublic() // restore

    expect(controls.adsbLabels.button.style.opacity).toBe('0.3')
    expect(controls.adsb.setLabelsVisible).toHaveBeenLastCalledWith(false)
  })
})
