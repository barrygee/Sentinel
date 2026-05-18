import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePersistedObject } from './_persist'

export interface OverlayStates {
  adsb: boolean
  adsbLabels: boolean
  airports: boolean
  militaryBases: boolean
  roads: boolean
  names: boolean
  rangeRings: boolean
  aara: boolean
  awacs: boolean
  overheadAlertsCivil: boolean
  overheadAlertsMil: boolean
}

export type AdsbLabelField = 'type' | 'alt'

export interface AdsbLabelFields {
  civil: AdsbLabelField[]
  mil: AdsbLabelField[]
}

export interface AdsbTagFields {
  civil: AdsbTagFieldMap
  mil: AdsbTagFieldMap
}

export interface AdsbTagFieldMap {
  callsign: boolean
  altitude: boolean
  speed: boolean
  heading: boolean
  aircraftType: boolean
  registration: boolean
  squawk: boolean
  category: boolean
}

const LS_KEY = 'overlayStates'
const LS_LABEL_FIELDS_KEY = 'adsbLabelFields'
const LS_TAG_FIELDS_KEY = 'adsbTagFields_v3'
const LS_OVERHEAD_RADIUS_KEY = 'overheadAlertRadiusNm'

export const DEFAULT_OVERHEAD_ALERT_RADIUS_NM = 10

const DEFAULT_LABEL_FIELDS: AdsbLabelFields = { civil: ['type'], mil: ['type'] }
const DEFAULT_TAG_FIELDS: AdsbTagFields = {
  civil: { callsign: true, altitude: false, speed: false, heading: false, aircraftType: false, registration: false, squawk: false, category: false },
  mil:   { callsign: true, altitude: false, speed: false, heading: false, aircraftType: true,  registration: false, squawk: false, category: false },
}

const DEFAULTS: OverlayStates = {
  adsb: true,
  adsbLabels: false,
  airports: true,
  militaryBases: true,
  roads: false,
  names: false,
  rangeRings: false,
  aara: true,
  awacs: true,
  overheadAlertsCivil: false,
  overheadAlertsMil: false,
}

function migrateOverlays(parsed: unknown): Partial<OverlayStates> {
  const obj = parsed as Partial<OverlayStates> & { overheadAlerts?: boolean }
  if (typeof obj.overheadAlerts === 'boolean'
      && obj.overheadAlertsCivil === undefined
      && obj.overheadAlertsMil === undefined) {
    obj.overheadAlertsCivil = obj.overheadAlerts
    obj.overheadAlertsMil = obj.overheadAlerts
  }
  delete obj.overheadAlerts
  return obj
}

function migrateLabelFields(parsed: unknown): Partial<AdsbLabelFields> {
  const obj = parsed as Partial<AdsbLabelFields>
  return {
    civil: Array.isArray(obj.civil) ? obj.civil : DEFAULT_LABEL_FIELDS.civil,
    mil:   Array.isArray(obj.mil)   ? obj.mil   : DEFAULT_LABEL_FIELDS.mil,
  }
}

function isTagFieldMap(v: unknown): v is AdsbTagFieldMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function migrateTagFields(parsed: unknown): Partial<AdsbTagFields> {
  const obj = parsed as Partial<AdsbTagFields>
  return {
    civil: isTagFieldMap(obj.civil) ? { ...DEFAULT_TAG_FIELDS.civil, ...obj.civil } : { ...DEFAULT_TAG_FIELDS.civil },
    mil:   isTagFieldMap(obj.mil)   ? { ...DEFAULT_TAG_FIELDS.mil,   ...obj.mil   } : { ...DEFAULT_TAG_FIELDS.mil },
  }
}

function readPersistedRadius(): number {
  try {
    const raw = localStorage.getItem(LS_OVERHEAD_RADIUS_KEY)
    if (!raw) return DEFAULT_OVERHEAD_ALERT_RADIUS_NM
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_OVERHEAD_ALERT_RADIUS_NM
  } catch {
    return DEFAULT_OVERHEAD_ALERT_RADIUS_NM
  }
}

export const useAirStore = defineStore('air', () => {
  const overlayStates = usePersistedObject<OverlayStates>(LS_KEY, DEFAULTS, migrateOverlays)
  const adsbLabelFields = usePersistedObject<AdsbLabelFields>(LS_LABEL_FIELDS_KEY, DEFAULT_LABEL_FIELDS, migrateLabelFields)
  const adsbTagFields = usePersistedObject<AdsbTagFields>(LS_TAG_FIELDS_KEY, DEFAULT_TAG_FIELDS, migrateTagFields)
  const overheadAlertRadiusNm = ref<number>(readPersistedRadius())
  const filterQuery = ref('')
  const filterOpen = ref(false)
  const mapCenter = ref<[number, number] | null>(null)
  const mapZoom = ref<number | null>(null)
  const pitch = ref(0)

  function setOverlay(key: keyof OverlayStates, visible: boolean) {
    overlayStates.value[key] = visible
  }

  function setAdsbLabelFields(fields: AdsbLabelFields) {
    adsbLabelFields.value = fields
  }

  function setAdsbTagFields(fields: AdsbTagFields) {
    adsbTagFields.value = fields
  }

  function setOverheadAlertRadiusNm(nm: number) {
    if (!Number.isFinite(nm) || nm <= 0) return
    overheadAlertRadiusNm.value = nm
    try { localStorage.setItem(LS_OVERHEAD_RADIUS_KEY, String(nm)) } catch {}
  }

  function setFilter(query: string) {
    filterQuery.value = query
  }

  function toggleFilter() {
    filterOpen.value = !filterOpen.value
  }

  function saveMapState(center: [number, number], zoom: number, currentPitch: number) {
    mapCenter.value = center
    mapZoom.value = zoom
    pitch.value = currentPitch
  }

  return { overlayStates, adsbLabelFields, adsbTagFields, overheadAlertRadiusNm, filterQuery, filterOpen, mapCenter, mapZoom, pitch, setOverlay, setAdsbLabelFields, setAdsbTagFields, setOverheadAlertRadiusNm, setFilter, toggleFilter, saveMapState }
})
