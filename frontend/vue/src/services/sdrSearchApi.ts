export interface SdrSearchRange {
  id: number
  label: string
  low_hz: number
  high_hz: number
  step_hz: number
  mode: string
  threshold_dbfs: number
  dwell_ms: number
  band_name: string
  enabled: boolean
  notes: string
  sort_order: number
  created_at?: number
}

export type SdrSearchRangeInput = Omit<SdrSearchRange, 'id' | 'created_at'>

const BASE = '/api/sdr/search-ranges'

export async function listSearchRanges(): Promise<SdrSearchRange[]> {
  const res = await fetch(BASE)
  if (!res.ok) return []
  return await res.json() as SdrSearchRange[]
}

export async function createSearchRange(body: SdrSearchRangeInput): Promise<SdrSearchRange | null> {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return await res.json() as SdrSearchRange
}

export async function updateSearchRange(id: number, body: SdrSearchRangeInput): Promise<SdrSearchRange | null> {
  const res = await fetch(`${BASE}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return await res.json() as SdrSearchRange
}

export async function deleteSearchRange(id: number): Promise<boolean> {
  const res = await fetch(`${BASE}/${id}`, { method: 'DELETE' })
  return res.ok
}
