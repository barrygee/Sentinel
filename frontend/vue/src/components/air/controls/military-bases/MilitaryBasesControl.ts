import maplibregl from 'maplibre-gl'
import { SentinelControlBase } from '../sentinel-control-base/SentinelControlBase'
import type { AirStore } from '../types'

type LngLat = [number, number]

export interface MilitaryBaseProperties {
  icao: string
  name: string
  bounds: [number, number, number, number]
}

export const MILITARY_BASES_DATA: GeoJSON.FeatureCollection<GeoJSON.Point, MilitaryBaseProperties> =
  {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { icao: 'EGUB', name: 'RAF Benson', bounds: [-1.12, 51.602, -1.072, 51.63] },
        geometry: { type: 'Point', coordinates: [-1.0972, 51.6164] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGIZ', name: 'RAF Boulmer', bounds: [-1.63, 55.41, -1.582, 55.435] },
        geometry: { type: 'Point', coordinates: [-1.6061, 55.4222] },
      },
      {
        type: 'Feature',
        properties: {
          icao: 'EGVN',
          name: 'RAF Brize Norton',
          bounds: [-1.628, 51.725, -1.54, 51.775],
        },
        geometry: { type: 'Point', coordinates: [-1.5836, 51.75] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGXC', name: 'RAF Coningsby', bounds: [-0.21, 53.07, -0.12, 53.116] },
        geometry: { type: 'Point', coordinates: [-0.1664, 53.093] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGSC', name: 'RAF Cosford', bounds: [-2.33, 52.625, -2.28, 52.655] },
        geometry: { type: 'Point', coordinates: [-2.3056, 52.6403] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGYC', name: 'RAF Cranwell', bounds: [-0.53, 53.01, -0.435, 53.05] },
        geometry: { type: 'Point', coordinates: [-0.4833, 53.0303] },
      },
      {
        type: 'Feature',
        properties: { icao: '', name: 'RAF Fylingdales', bounds: [-0.7, 54.345, -0.64, 54.375] },
        geometry: { type: 'Point', coordinates: [-0.6706, 54.3606] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGXH', name: 'RAF Honington', bounds: [0.74, 52.325, 0.805, 52.36] },
        geometry: { type: 'Point', coordinates: [0.7731, 52.3425] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGGE', name: 'RAF Leeming', bounds: [-1.575, 54.275, -1.495, 54.325] },
        geometry: { type: 'Point', coordinates: [-1.5353, 54.2992] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGQL', name: 'RAF Lossiemouth', bounds: [-3.4, 57.68, -3.28, 57.73] },
        geometry: { type: 'Point', coordinates: [-3.3392, 57.7053] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGYM', name: 'RAF Marham', bounds: [0.51, 52.625, 0.59, 52.67] },
        geometry: { type: 'Point', coordinates: [0.5506, 52.6481] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGWU', name: 'RAF Northolt', bounds: [-0.455, 51.535, -0.382, 51.57] },
        geometry: { type: 'Point', coordinates: [-0.4183, 51.553] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGVO', name: 'RAF Odiham', bounds: [-1.035, 51.215, -0.972, 51.253] },
        geometry: { type: 'Point', coordinates: [-1.0036, 51.2341] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGOS', name: 'RAF Shawbury', bounds: [-2.695, 52.78, -2.635, 52.815] },
        geometry: { type: 'Point', coordinates: [-2.665, 52.7983] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGOM', name: 'RAF Spadeadam', bounds: [-2.6, 54.875, -2.495, 54.925] },
        geometry: { type: 'Point', coordinates: [-2.5467, 54.9003] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGOV', name: 'RAF Valley', bounds: [-4.575, 53.225, -4.495, 53.27] },
        geometry: { type: 'Point', coordinates: [-4.5353, 53.2481] },
      },
      {
        type: 'Feature',
        properties: {
          icao: 'EGXW',
          name: 'RAF Waddington',
          bounds: [-0.56, 53.145, -0.485, 53.188],
        },
        geometry: { type: 'Point', coordinates: [-0.5228, 53.1664] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGXT', name: 'RAF Wittering', bounds: [-0.51, 52.59, -0.445, 52.635] },
        geometry: { type: 'Point', coordinates: [-0.4767, 52.6128] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGOW', name: 'RAF Woodvale', bounds: [-3.08, 53.565, -3.025, 53.598] },
        geometry: { type: 'Point', coordinates: [-3.0517, 53.5811] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGUY', name: 'RAF Wyton', bounds: [-0.14, 52.34, -0.08, 52.375] },
        geometry: { type: 'Point', coordinates: [-0.1097, 52.3572] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGUY', name: 'RAF Alconbury', bounds: [-0.11, 52.345, -0.048, 52.38] },
        geometry: { type: 'Point', coordinates: [-0.0781, 52.3636] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGVA', name: 'RAF Fairford', bounds: [-1.83, 51.66, -1.75, 51.705] },
        geometry: { type: 'Point', coordinates: [-1.79, 51.6822] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGUL', name: 'RAF Lakenheath', bounds: [0.525, 52.39, 0.595, 52.43] },
        geometry: { type: 'Point', coordinates: [0.5611, 52.4094] },
      },
      {
        type: 'Feature',
        properties: { icao: 'EGUN', name: 'RAF Mildenhall', bounds: [0.455, 52.34, 0.518, 52.385] },
        geometry: { type: 'Point', coordinates: [0.4864, 52.3619] },
      },
    ],
  }

export class MilitaryBasesToggleControl extends SentinelControlBase {
  visible: boolean
  private _markers: maplibregl.Marker[] | null = null
  private _airStore: AirStore
  private _is3DActive: () => boolean

  constructor(airStore: AirStore, is3DActive: () => boolean) {
    super()
    this._airStore = airStore
    this._is3DActive = is3DActive
    this.visible = airStore.overlayStates.militaryBases
  }

  get buttonLabel(): string {
    return 'MIL'
  }
  get buttonTitle(): string {
    return 'Toggle military bases'
  }

  protected onInit(): void {
    this.button.style.fontSize = '8px'
    this.setButtonActive(this.visible)
    if (this.map.isStyleLoaded()) {
      this.initLayers()
    } else {
      this.map.once('style.load', () => this.initLayers())
    }
  }

  protected handleClick(): void {
    this.toggle()
  }

  onRemove(): void {
    if (this._markers) this._markers.forEach((m) => m.remove())
    super.onRemove()
  }

  initLayers(): void {
    if (this.map.getSource('military-bases')) this.map.removeSource('military-bases')
    this.map.addSource('military-bases', { type: 'geojson', data: MILITARY_BASES_DATA })

    if (!this._markers) {
      this._markers = MILITARY_BASES_DATA.features.map((f) => {
        const baseProperties = f.properties
        const coords = f.geometry.coordinates as LngLat

        const el = document.createElement('div')
        el.style.cssText =
          'padding:6px 16px 6px 0;cursor:pointer;pointer-events:auto;user-select:none'

        const label = document.createElement('div')
        label.style.cssText =
          "color:#fff;font-family:'Barlow Condensed','Barlow',monospace;font-size:10px;font-weight:700;letter-spacing:.08em;line-height:1.5;white-space:nowrap;pointer-events:none"
        label.innerHTML = baseProperties.icao
          ? `<span style="color:#c8ff00">${baseProperties.icao}</span><br><span style="opacity:0.7;font-weight:400">${baseProperties.name.toUpperCase()}</span>`
          : `<span style="opacity:0.7;font-weight:400">${baseProperties.name.toUpperCase()}</span>`
        el.appendChild(label)

        el.addEventListener('click', (e: Event) => {
          e.stopPropagation()
          const pitch = this._is3DActive() ? 45 : undefined
          const easeOpts: maplibregl.EaseToOptions = { center: coords, zoom: 16, duration: 800 }
          if (pitch !== undefined) easeOpts.pitch = pitch
          this.map.easeTo(easeOpts)
        })

        let hintPanel: HTMLDivElement | null = null
        el.addEventListener('mouseenter', () => {
          if (!hintPanel) {
            hintPanel = document.createElement('div')
            hintPanel.style.cssText = 'pointer-events:none;margin-top:4px'
            hintPanel.innerHTML =
              `<div style="display:inline-block;background:rgba(0,0,0,0.7);color:#fff;` +
              `font-family:'Barlow Condensed','Barlow',sans-serif;font-size:12px;font-weight:400;` +
              `padding:5px 12px 7px;white-space:nowrap;user-select:none">` +
              `<span style="opacity:0.5;letter-spacing:.05em">CLICK TO ZOOM</span></div>`
            el.appendChild(hintPanel)
          }
        })
        el.addEventListener('mouseleave', () => {
          if (hintPanel) {
            hintPanel.remove()
            hintPanel = null
          }
        })

        return new maplibregl.Marker({
          element: el,
          anchor: 'top-left',
          offset: [8, -6],
        }).setLngLat(coords)
      })

      if (this.visible) this._markers.forEach((m) => m.addTo(this.map))
    }
  }

  toggle(): void {
    this.visible = !this.visible
    if (this._markers) {
      if (this.visible) this._markers.forEach((m) => m.addTo(this.map))
      else this._markers.forEach((m) => m.remove())
    }
    this.setButtonActive(this.visible)
    this._airStore.setOverlay('militaryBases', this.visible)
  }
}
