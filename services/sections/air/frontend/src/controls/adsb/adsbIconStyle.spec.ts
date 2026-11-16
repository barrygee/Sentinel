import { describe, it, expect, vi, beforeEach } from 'vitest'
import type * as maplibregl from 'maplibre-gl'

// Sprite factories touch <canvas>; each returns a tagged stand-in so a test can
// tell which factory (and colour) produced the image registered under a name.
vi.mock('@sentinel/map-kit/sprites/adsbSprites', () => {
  const tagged =
    (factory: string) =>
    (...factoryArguments: unknown[]) =>
      ({ factory, factoryArguments }) as unknown as ImageData
  return {
    createRadarBlip: vi.fn(tagged('radar')),
    createBracket: vi.fn(tagged('bracket')),
    createMilBracket: vi.fn(tagged('milBracket')),
    createTowerBlip: vi.fn(tagged('tower')),
    createGroundVehicleBlip: vi.fn(tagged('groundVehicle')),
    createUAVBlip: vi.fn(tagged('uav')),
  }
})

import {
  applyMapDimming,
  iconImageExpression,
  iconLayerVisibility,
  iconRotateExpression,
  iconSizeExpression,
  MAP_DIM_LAYER_ID,
  MAP_DIM_OPACITY,
  registerAdsbIcons,
  silhouetteZoomScale,
} from './adsbIconStyle'
import { SILHOUETTE_PALETTES } from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'

// ---- A small evaluator for the expression operators these functions emit ----
// Evaluating the expressions against sample features tests what the map would
// draw, rather than restating the expression's shape.

type FeatureProperties = Record<string, unknown>

function evaluate(expression: unknown, properties: FeatureProperties, zoom = 0): unknown {
  if (!Array.isArray(expression)) return expression
  const [operator, ...operands] = expression as [string, ...unknown[]]
  const evaluateOperand = (operand: unknown) => evaluate(operand, properties, zoom)
  switch (operator) {
    case 'get':
      return properties[operands[0] as string]
    case 'zoom':
      return zoom
    case '==':
      return evaluateOperand(operands[0]) === evaluateOperand(operands[1])
    case '!=':
      return evaluateOperand(operands[0]) !== evaluateOperand(operands[1])
    case 'boolean': {
      const value = evaluateOperand(operands[0])
      return typeof value === 'boolean' ? value : evaluateOperand(operands[1])
    }
    case 'concat':
      return operands.map((operand) => String(evaluateOperand(operand))).join('')
    case 'case': {
      for (let index = 0; index + 1 < operands.length; index += 2) {
        if (evaluateOperand(operands[index])) return evaluateOperand(operands[index + 1])
      }
      return evaluateOperand(operands[operands.length - 1])
    }
    case 'match': {
      const input = evaluateOperand(operands[0])
      const labels = operands[1] as unknown[]
      return labels.includes(input) ? evaluateOperand(operands[2]) : evaluateOperand(operands[3])
    }
    case 'step': {
      const input = evaluateOperand(operands[0]) as number
      let output = evaluateOperand(operands[1])
      for (let index = 2; index + 1 < operands.length; index += 2) {
        if (input >= (operands[index] as number)) output = evaluateOperand(operands[index + 1])
      }
      return output
    }
    default:
      throw new Error(`evaluator does not support operator ${operator}`)
  }
}

/** An airborne civil aircraft with a silhouette; override what a case needs. */
function aircraft(overrides: FeatureProperties = {}): FeatureProperties {
  return {
    hex: 'abc123',
    category: 'A3',
    t: 'A320',
    squawkEmerg: 0,
    military: false,
    track: 90,
    silhouetteImage: 'aircraft-silhouette:jet:civil',
    silhouetteRotates: 1,
    ...overrides,
  }
}

describe('registerAdsbIcons', () => {
  function fakeMap(existingImages: string[] = []) {
    const images = new Map<string, unknown>()
    return {
      images,
      hasImage: vi.fn((name: string) => existingImages.includes(name)),
      addImage: vi.fn((name: string, image: unknown, options: unknown) =>
        images.set(name, { image, options }),
      ),
      updateImage: vi.fn((name: string, image: unknown) => images.set(name, { image })),
    }
  }

  beforeEach(() => vi.clearAllMocks())

  it('adds every arrow-mode sprite at pixel ratio 2, non-SDF, when none exist', () => {
    const map = fakeMap()
    registerAdsbIcons(map as unknown as maplibregl.Map, 'dark')
    expect([...map.images.keys()].sort()).toEqual(
      [
        'adsb-blip',
        'adsb-blip-emerg',
        'adsb-blip-emerg-gnd',
        'adsb-blip-gnd',
        'adsb-blip-mil',
        'adsb-blip-tower',
        'adsb-blip-uav',
        'adsb-bracket',
        'adsb-bracket-emerg',
        'adsb-bracket-emerg-gnd',
        'adsb-bracket-mil',
      ].sort(),
    )
    for (const entry of map.images.values()) {
      expect(entry).toMatchObject({ options: { pixelRatio: 2, sdf: false } })
    }
    expect(map.updateImage).not.toHaveBeenCalled()
  })

  it('draws each sprite with its own factory and colour', () => {
    const map = fakeMap()
    registerAdsbIcons(map as unknown as maplibregl.Map, 'dark')
    const imageFor = (name: string) => (map.images.get(name) as { image: unknown }).image
    expect(imageFor('adsb-blip')).toEqual({ factory: 'radar', factoryArguments: ['#00aaff', 1.1] })
    expect(imageFor('adsb-blip-mil')).toEqual({
      factory: 'radar',
      factoryArguments: ['#c8ff00', 1.1],
    })
    expect(imageFor('adsb-blip-emerg')).toEqual({
      factory: 'radar',
      factoryArguments: ['#ff2222', 1.1],
    })
    expect(imageFor('adsb-blip-uav')).toEqual({
      factory: 'uav',
      factoryArguments: ['#ffffff', 1.1],
    })
    expect(imageFor('adsb-blip-tower')).toEqual({ factory: 'tower', factoryArguments: [1.1] })
    expect(imageFor('adsb-bracket')).toEqual({ factory: 'bracket', factoryArguments: [] })
    expect(imageFor('adsb-bracket-mil')).toEqual({ factory: 'milBracket', factoryArguments: [] })
    expect(imageFor('adsb-bracket-emerg')).toEqual({
      factory: 'bracket',
      factoryArguments: ['#ff2222'],
    })
    expect(imageFor('adsb-bracket-emerg-gnd')).toEqual({
      factory: 'bracket',
      factoryArguments: ['#ff2222'],
    })
  })

  it.each(['dark', 'light'] as const)(
    "colours ground vehicles with the %s palette's service and emergency colours",
    (palette) => {
      const map = fakeMap()
      registerAdsbIcons(map as unknown as maplibregl.Map, palette)
      const imageFor = (name: string) => (map.images.get(name) as { image: unknown }).image
      expect(imageFor('adsb-blip-gnd')).toEqual({
        factory: 'groundVehicle',
        factoryArguments: [SILHOUETTE_PALETTES[palette].civil],
      })
      expect(imageFor('adsb-blip-emerg-gnd')).toEqual({
        factory: 'groundVehicle',
        factoryArguments: [SILHOUETTE_PALETTES[palette].emergency],
      })
    },
  )

  it('the two palettes really give ground vehicles different colours', () => {
    expect(SILHOUETTE_PALETTES.dark.civil).not.toBe(SILHOUETTE_PALETTES.light.civil)
    expect(SILHOUETTE_PALETTES.dark.emergency).not.toBe(SILHOUETTE_PALETTES.light.emergency)
  })

  it('updates images a restyle kept instead of adding them again', () => {
    const map = fakeMap(['adsb-blip', 'adsb-blip-gnd'])
    registerAdsbIcons(map as unknown as maplibregl.Map, 'dark')
    expect(map.updateImage.mock.calls.map((call) => call[0]).sort()).toEqual([
      'adsb-blip',
      'adsb-blip-gnd',
    ])
    const addedNames = map.addImage.mock.calls.map((call) => call[0])
    expect(addedNames).not.toContain('adsb-blip')
    expect(addedNames).not.toContain('adsb-blip-gnd')
    expect(addedNames).toHaveLength(9)
  })
})

describe('iconImageExpression', () => {
  describe('arrow mode', () => {
    const imageFor = (properties: FeatureProperties) =>
      evaluate(iconImageExpression('arrow', null, 'dark'), properties)

    it.each([
      ['an emergency ground vehicle (C1)', { category: 'C1' }, 'adsb-blip-emerg-gnd'],
      ['a service vehicle (C2)', { category: 'C2' }, 'adsb-blip-gnd'],
      ['a fixed obstruction (C3)', { category: 'C3' }, 'adsb-blip-tower'],
      ['a TWR type', { t: 'TWR' }, 'adsb-blip-tower'],
      ['an emergency squawk', { squawkEmerg: 1 }, 'adsb-blip-emerg'],
      ['a military aircraft', { military: true }, 'adsb-blip-mil'],
      ['a UAV (B6)', { category: 'B6' }, 'adsb-blip-uav'],
      ['a civil aircraft', {}, 'adsb-blip'],
      ['a feature with no military flag', { military: undefined }, 'adsb-blip'],
    ])('gives %s its arrow-mode sprite', (_case, overrides, expected) => {
      expect(imageFor(aircraft(overrides))).toBe(expected)
    })

    it('ranks surface categories above an emergency squawk', () => {
      expect(imageFor(aircraft({ category: 'C2', squawkEmerg: 1 }))).toBe('adsb-blip-gnd')
    })

    it('ranks an emergency squawk above military', () => {
      expect(imageFor(aircraft({ squawkEmerg: 1, military: true }))).toBe('adsb-blip-emerg')
    })

    it('ignores the silhouette even when the feature has one', () => {
      expect(imageFor(aircraft())).toBe('adsb-blip')
    })
  })

  describe('silhouette mode', () => {
    it('names the silhouette image with the palette suffix', () => {
      expect(evaluate(iconImageExpression('silhouette', null, 'dark'), aircraft())).toBe(
        'aircraft-silhouette:jet:civil:dark',
      )
      expect(evaluate(iconImageExpression('silhouette', null, 'light'), aircraft())).toBe(
        'aircraft-silhouette:jet:civil:light',
      )
    })

    it('adds the selected suffix only for the selected aircraft', () => {
      const expression = iconImageExpression('silhouette', 'abc123', 'dark')
      expect(evaluate(expression, aircraft())).toBe('aircraft-silhouette:jet:civil:selected:dark')
      expect(evaluate(expression, aircraft({ hex: 'other' }))).toBe(
        'aircraft-silhouette:jet:civil:dark',
      )
    })

    it('falls back to the arrow-mode sprite when the feature has no silhouette', () => {
      const expression = iconImageExpression('silhouette', 'abc123', 'dark')
      expect(evaluate(expression, aircraft({ silhouetteImage: '', military: true }))).toBe(
        'adsb-blip-mil',
      )
      expect(evaluate(expression, aircraft({ silhouetteImage: '', category: 'C2' }))).toBe(
        'adsb-blip-gnd',
      )
    })
  })
})

describe('iconSizeExpression', () => {
  it('is a flat 0.75 in arrow mode', () => {
    expect(iconSizeExpression('arrow')).toBe(0.75)
  })

  describe('silhouette mode', () => {
    const sizeAt = (zoom: number, properties: FeatureProperties) =>
      evaluate(iconSizeExpression('silhouette'), properties, zoom)

    it('draws a silhouette at 1 below the zoomed-in threshold', () => {
      expect(sizeAt(7.49, aircraft())).toBe(1)
    })

    it('grows a silhouette to 1.18 from the threshold (7.5) up', () => {
      expect(sizeAt(7.5, aircraft())).toBe(1.18)
      expect(sizeAt(14, aircraft())).toBe(1.18)
    })

    it('keeps 0.75 at every zoom for a feature with no silhouette', () => {
      expect(sizeAt(3, aircraft({ silhouetteImage: '' }))).toBe(0.75)
      expect(sizeAt(10, aircraft({ silhouetteImage: '' }))).toBe(0.75)
    })

    it('puts the zoom step at the top of the expression, as MapLibre requires', () => {
      const expression = iconSizeExpression('silhouette') as unknown[]
      expect(expression[0]).toBe('step')
      expect(expression[1]).toEqual(['zoom'])
    })
  })
})

describe('silhouetteZoomScale', () => {
  it('is 1 just below the threshold', () => {
    expect(silhouetteZoomScale(7.49)).toBe(1)
  })

  it('is the zoomed-in scale at and above the threshold', () => {
    expect(silhouetteZoomScale(7.5)).toBe(1.18)
    expect(silhouetteZoomScale(18)).toBe(1.18)
  })

  it('matches the size the layer draws at the same zoom', () => {
    for (const zoom of [0, 7.49, 7.5, 12]) {
      expect(evaluate(iconSizeExpression('silhouette'), aircraft(), zoom)).toBe(
        silhouetteZoomScale(zoom),
      )
    }
  })
})

describe('iconRotateExpression', () => {
  describe('arrow mode', () => {
    const rotationFor = (properties: FeatureProperties) =>
      evaluate(iconRotateExpression('arrow'), properties)

    it('turns an aircraft to its track', () => {
      expect(rotationFor(aircraft({ track: 245 }))).toBe(245)
    })

    it.each(['C1', 'C2', 'C3', 'C4', 'C5'])('keeps surface category %s upright', (category) => {
      expect(rotationFor(aircraft({ category, track: 245 }))).toBe(0)
    })

    it('keeps a TWR type upright', () => {
      expect(rotationFor(aircraft({ t: 'TWR', track: 245 }))).toBe(0)
    })

    it('still rotates a non-surface C-less category such as B6', () => {
      expect(rotationFor(aircraft({ category: 'B6', track: 30 }))).toBe(30)
    })
  })

  describe('silhouette mode', () => {
    const rotationFor = (properties: FeatureProperties) =>
      evaluate(iconRotateExpression('silhouette'), properties)

    it('turns a rotating silhouette to its track', () => {
      expect(rotationFor(aircraft({ track: 120 }))).toBe(120)
    })

    it('keeps a side-view silhouette (a balloon) upright', () => {
      expect(rotationFor(aircraft({ silhouetteRotates: 0, track: 120 }))).toBe(0)
    })

    it('uses the arrow-mode rule when the feature has no silhouette', () => {
      expect(rotationFor(aircraft({ silhouetteImage: '', category: 'C2', track: 120 }))).toBe(0)
      expect(rotationFor(aircraft({ silhouetteImage: '', track: 120 }))).toBe(120)
    })
  })
})

describe('iconLayerVisibility', () => {
  it('hides the icon layer in arrow mode (labels carry the arrow)', () => {
    expect(iconLayerVisibility('arrow')).toBe('none')
  })

  it('shows the icon layer in silhouette mode', () => {
    expect(iconLayerVisibility('silhouette')).toBe('visible')
  })
})

describe('applyMapDimming', () => {
  function fakeMap(hasDimLayer: boolean, canvasFilter = 'brightness(0.65)') {
    const canvas = { style: { filter: canvasFilter } }
    return {
      canvas,
      getCanvas: () => canvas,
      getLayer: vi.fn((id: string) => (hasDimLayer && id === MAP_DIM_LAYER_ID ? {} : undefined)),
      setLayoutProperty: vi.fn(),
    }
  }

  it('names the layer and opacity the control adds', () => {
    expect(MAP_DIM_LAYER_ID).toBe('adsb-map-dim')
    expect(MAP_DIM_OPACITY).toBe(0.35)
  })

  it('on the dark map, drops the canvas filter and shows the dim layer', () => {
    const map = fakeMap(true)
    applyMapDimming(map as unknown as maplibregl.Map, 'dark')
    expect(map.canvas.style.filter).toBe('none')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(MAP_DIM_LAYER_ID, 'visibility', 'visible')
  })

  it("on the light map, restores the stylesheet's filter and hides the dim layer", () => {
    const map = fakeMap(true, 'none')
    applyMapDimming(map as unknown as maplibregl.Map, 'light')
    expect(map.canvas.style.filter).toBe('')
    expect(map.setLayoutProperty).toHaveBeenCalledWith(MAP_DIM_LAYER_ID, 'visibility', 'none')
  })

  it('still sets the canvas filter when the dim layer is not on the map', () => {
    const map = fakeMap(false)
    applyMapDimming(map as unknown as maplibregl.Map, 'dark')
    expect(map.canvas.style.filter).toBe('none')
    expect(map.setLayoutProperty).not.toHaveBeenCalled()
  })
})

describe('the evaluator used above', () => {
  it('refuses operators it does not implement, so an unsupported expression cannot pass silently', () => {
    expect(() => evaluate(['coalesce', 1], {})).toThrow('coalesce')
  })
})
