// Pure calendar helpers used by AirReplayPanel.vue. No Vue / no DOM.

export const CAL_MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

export interface CalCell {
    key:      string
    day:      number
    iso:      string
    other:    boolean
    today:    boolean
    selected: boolean
    disabled: boolean
}

export function toIso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function formatDisplayDate(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${d} / ${m} / ${y}`
}

interface BuildCalCellsArgs {
    year:         number
    month:        number   // 0–11
    selectedIso:  string
    availableSet: Set<string>
    minIso?:      string   // disable cells with iso < minIso (used by end calendar)
}

// Build the 42-cell calendar grid for a given month, including leading/trailing
// days from the prev/next month. Cells before `minIso` are marked disabled.
export function buildCalCells({ year, month, selectedIso, availableSet, minIso }: BuildCalCellsArgs): CalCell[] {
    const first = new Date(year, month, 1)
    const startDow = (first.getDay() + 6) % 7
    const cells: CalCell[] = []
    const todayIso = toIso(new Date())

    const makeCell = (key: string, d: Date, day: number, other: boolean): CalCell => {
        const iso = other ? toIso(d) : `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const beforeMin = !!minIso && iso < minIso
        return {
            key, day, iso, other,
            today:    iso === todayIso,
            selected: iso === selectedIso,
            disabled: !availableSet.has(iso) || beforeMin,
        }
    }

    for (let i = 0; i < startDow; i++) {
        const d = new Date(year, month, 1 - (startDow - i))
        cells.push(makeCell('p' + i, d, d.getDate(), true))
    }
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push(makeCell('c' + d, new Date(year, month, d), d, false))
    }
    const remaining = 42 - cells.length
    for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i)
        cells.push(makeCell('n' + i, d, i, true))
    }
    return cells
}

// Advance/retreat a month/year pair by one. Returns the new pair; callers
// assign back to their reactive refs.
export function prevMonth(month: number, year: number): { month: number; year: number } {
    return month === 0 ? { month: 11, year: year - 1 } : { month: month - 1, year }
}

export function nextMonth(month: number, year: number): { month: number; year: number } {
    return month === 11 ? { month: 0, year: year + 1 } : { month: month + 1, year }
}
