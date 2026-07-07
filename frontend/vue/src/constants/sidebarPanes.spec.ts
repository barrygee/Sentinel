import { describe, it, expect } from 'vitest'
import { SIDEBAR_PANE_IDS, sidebarPaneSelector } from './sidebarPanes'

describe('sidebarPaneSelector', () => {
  it('returns a CSS id-selector for every declared pane', () => {
    for (const paneId of Object.keys(SIDEBAR_PANE_IDS) as (keyof typeof SIDEBAR_PANE_IDS)[]) {
      expect(sidebarPaneSelector(paneId)).toBe(`#${SIDEBAR_PANE_IDS[paneId]}`)
    }
  })

  it('matches the ids MapSidebar renders', () => {
    expect(SIDEBAR_PANE_IDS).toEqual({
      search: 'msb-pane-search',
      alerts: 'msb-pane-alerts',
      tracking: 'msb-pane-tracking',
      passes: 'msb-pane-passes',
      playback: 'msb-pane-playback',
      radio: 'msb-pane-radio',
    })
  })
})
