/**
 * How the ADS-B map draws aircraft symbols: the sprite images it registers, the
 * `adsb-icons` layer's image/size/rotation expressions for each icon style, and
 * the dim layer that keeps aircraft bright on the dark map.
 *
 * Pure functions of the control's state (icon style, palette, selected aircraft),
 * so each can be read and checked without a live control. `AdsbLiveControl` owns
 * that state and applies what these return.
 */
import type * as maplibregl from 'maplibre-gl'
import type { AircraftIconStyle } from '../../stores/air'
import {
  createRadarBlip,
  createBracket,
  createMilBracket,
  createTowerBlip,
  createGroundVehicleBlip,
  createUAVBlip,
} from '@sentinel/map-kit/sprites/adsbSprites'
import {
  SILHOUETTE_PALETTES,
  SILHOUETTE_SELECTED_SUFFIX,
  SILHOUETTE_ZOOMED_IN_SCALE,
  SILHOUETTE_ZOOMED_IN_THRESHOLD,
  type SilhouettePalette,
} from '@sentinel/map-kit/aircraft-silhouettes/silhouetteImage'
import { MAP_DIM_OPACITY, setMapDimming } from '@sentinel/map-kit/map-dimming/mapDimming'

/** The layer that dims the dark map beneath airfields and aircraft (see {@link applyMapDimming}). */
export const MAP_DIM_LAYER_ID = 'adsb-map-dim'

export { MAP_DIM_OPACITY }

/** Arrow-mode sprites are drawn larger than shown, and always scaled to this. */
const ARROW_ICON_SIZE = 0.75

/**
 * Add the arrow-mode sprites and ground-vehicle blips to the map, or replace
 * them in place when a restyle kept them. Ground vehicles are drawn on the map
 * only in silhouette mode, beside the silhouettes, so they take the silhouettes'
 * service and emergency colours for `palette`.
 */
export function registerAdsbIcons(map: maplibregl.Map, palette: SilhouettePalette): void {
  const spriteOptions = { pixelRatio: 2, sdf: false }
  const addOrUpdate = (name: string, image: ImageData) => {
    if (map.hasImage(name)) {
      map.updateImage(name, image)
    } else {
      map.addImage(name, image, spriteOptions)
    }
  }
  addOrUpdate('adsb-bracket', createBracket())
  addOrUpdate('adsb-bracket-mil', createMilBracket())
  addOrUpdate('adsb-bracket-emerg', createBracket('#ff2222'))
  addOrUpdate('adsb-bracket-emerg-gnd', createBracket('#ff2222'))
  addOrUpdate('adsb-blip', createRadarBlip('#00aaff', 1.1))
  addOrUpdate('adsb-blip-mil', createRadarBlip('#c8ff00', 1.1))
  addOrUpdate('adsb-blip-emerg', createRadarBlip('#ff2222', 1.1))
  addOrUpdate('adsb-blip-uav', createUAVBlip('#ffffff', 1.1))
  const vehicleColours = SILHOUETTE_PALETTES[palette]
  addOrUpdate('adsb-blip-gnd', createGroundVehicleBlip(vehicleColours.civil))
  addOrUpdate('adsb-blip-emerg-gnd', createGroundVehicleBlip(vehicleColours.emergency))
  addOrUpdate('adsb-blip-tower', createTowerBlip(1.1))
}

/**
 * In silhouette mode, prefer `silhouetteValue` for features that have a
 * silhouette and fall back to `arrowValue` for the rest; in arrow mode, just
 * `arrowValue`. Aircraft whose type and category name no shape, and surface
 * traffic, keep their arrow-mode symbol either way.
 */
function preferSilhouette<LayoutValue extends maplibregl.ExpressionSpecification | number>(
  iconStyle: AircraftIconStyle,
  silhouetteValue: LayoutValue,
  arrowValue: LayoutValue,
): LayoutValue | maplibregl.ExpressionSpecification {
  if (iconStyle !== 'silhouette') return arrowValue
  return ['case', ['!=', ['get', 'silhouetteImage'], ''], silhouetteValue, arrowValue]
}

/**
 * Which map image each aircraft gets: its silhouette (in `palette`, with the
 * selected variant for `selectedHex`), or the arrow-mode symbol.
 */
export function iconImageExpression(
  iconStyle: AircraftIconStyle,
  selectedHex: string | null,
  palette: SilhouettePalette,
): maplibregl.ExpressionSpecification {
  return preferSilhouette<maplibregl.ExpressionSpecification>(
    iconStyle,
    // The feature names its shape and colour; selection and the palette are the map's.
    selectedHex
      ? [
          'concat',
          ['get', 'silhouetteImage'],
          ['case', ['==', ['get', 'hex'], selectedHex], SILHOUETTE_SELECTED_SUFFIX, ''],
          `:${palette}`,
        ]
      : ['concat', ['get', 'silhouetteImage'], `:${palette}`],
    [
      'case',
      ['==', ['get', 'category'], 'C1'],
      'adsb-blip-emerg-gnd',
      ['==', ['get', 'category'], 'C2'],
      'adsb-blip-gnd',
      ['==', ['get', 'category'], 'C3'],
      'adsb-blip-tower',
      ['==', ['get', 't'], 'TWR'],
      'adsb-blip-tower',
      ['==', ['get', 'squawkEmerg'], 1],
      'adsb-blip-emerg',
      ['boolean', ['get', 'military'], false],
      'adsb-blip-mil',
      ['==', ['get', 'category'], 'B6'],
      'adsb-blip-uav',
      'adsb-blip',
    ],
  )
}

/**
 * Icon scale. Silhouette images are drawn at their zoomed-out size (already
 * sized by the aircraft's real size) and grow by
 * {@link SILHOUETTE_ZOOMED_IN_SCALE} once zoomed in, as ADS-B Exchange's do;
 * the arrow-mode sprites are drawn larger and shown at 0.75, as they always
 * have been. MapLibre only allows `zoom` at the top of an expression, so the
 * zoom step wraps the per-feature choice rather than the other way round.
 */
export function iconSizeExpression(
  iconStyle: AircraftIconStyle,
): maplibregl.ExpressionSpecification | number {
  if (iconStyle !== 'silhouette') return ARROW_ICON_SIZE
  return [
    'step',
    ['zoom'],
    preferSilhouette(iconStyle, 1, ARROW_ICON_SIZE),
    SILHOUETTE_ZOOMED_IN_THRESHOLD,
    preferSilhouette(iconStyle, SILHOUETTE_ZOOMED_IN_SCALE, ARROW_ICON_SIZE),
  ]
}

/** The scale silhouettes are drawn at for `zoom` (see {@link iconSizeExpression}). */
export function silhouetteZoomScale(zoom: number): number {
  return zoom >= SILHOUETTE_ZOOMED_IN_THRESHOLD ? SILHOUETTE_ZOOMED_IN_SCALE : 1
}

/**
 * Icon rotation. Aircraft turn to their track; surface traffic, towers and
 * side-view silhouettes (a balloon) stay upright, since their reported track
 * is not a heading worth showing.
 */
export function iconRotateExpression(
  iconStyle: AircraftIconStyle,
): maplibregl.ExpressionSpecification {
  return preferSilhouette<maplibregl.ExpressionSpecification>(
    iconStyle,
    ['case', ['==', ['get', 'silhouetteRotates'], 1], ['get', 'track'], 0],
    [
      'case',
      ['match', ['get', 'category'], ['C1', 'C2', 'C3', 'C4', 'C5'], true, false],
      0,
      ['==', ['get', 't'], 'TWR'],
      0,
      ['get', 'track'],
    ],
  )
}

/**
 * Whether the `adsb-icons` symbol layer is shown outside isolation mode.
 * Arrow mode hides it — each label's own arrow marks the aircraft — while
 * silhouette mode is drawn by it.
 */
export function iconLayerVisibility(iconStyle: AircraftIconStyle): 'visible' | 'none' {
  return iconStyle === 'silhouette' ? 'visible' : 'none'
}

/**
 * Keep aircraft and airfield labels at full brightness on the dark map.
 * `MapLibreMap.vue` dims the whole canvas with a CSS filter, which would cap
 * a white silhouette at mid grey and dull an open airfield label; here the
 * same dimming comes from a layer just under the airfields and aircraft
 * instead, so the basemap looks as it did. Both icon styles get it, so an
 * airfield label looks the same in either. The light map keeps the
 * stylesheet's behaviour (no dimming at all).
 */
export function applyMapDimming(map: maplibregl.Map, palette: SilhouettePalette): void {
  setMapDimming(map, MAP_DIM_LAYER_ID, palette === 'dark')
}
