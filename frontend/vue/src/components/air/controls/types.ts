import type { useNotificationsStore } from '@/stores/notifications'
import type { useTrackingStore } from '@/stores/tracking'
import type { useAirStore } from '@/stores/air'

export type NotificationsStore = ReturnType<typeof useNotificationsStore>
export type TrackingStore = ReturnType<typeof useTrackingStore>
export type AirStore = ReturnType<typeof useAirStore>

export interface OverlayStates {
  adsb: boolean
  adsbLabels: boolean
  roads: boolean
  names: boolean
  rings: boolean
  airports: boolean
  militaryBases: boolean
  aara: boolean
  awacs: boolean
}

export interface ControlDeps {
  airStore: AirStore
  notificationsStore: NotificationsStore
  trackingStore: TrackingStore
  getUserLocation: () => [number, number] | null
  is3DActive: () => boolean
  buildRingsGeoJSON: (lng: number, lat: number) => { lines: GeoJSON.FeatureCollection }
  computeCentroid: (coords: number[][][]) => [number, number]
  computeTextRotate: (coords: number[][][]) => number
  computeLongestEdge: (coords: number[][][]) => [[number, number], [number, number]]
}

export type LngLat = [number, number]
