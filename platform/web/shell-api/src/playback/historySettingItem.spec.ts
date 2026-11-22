import { describe, it, expect } from 'vitest'
import { historySettingItem } from './historySettingItem'
import HistoryRecordingControl from '../settings/HistoryRecordingControl.vue'

describe('historySettingItem', () => {
  it('builds the REPLAY group item for a section', () => {
    const item = historySettingItem('air', 'AIR', 'aircraft positions')
    expect(item).toMatchObject({
      section: 'air',
      sectionLabel: 'AIR',
      id: 'air-history',
      label: 'History & Replay',
      groupLabel: 'REPLAY',
      docPath: 'use/replay',
    })
    expect(item.desc).toContain('Records aircraft positions for up to 7 rolling days')
    expect(item.searchTerms).toContain('replay')
    expect(item.control.component).toBe(HistoryRecordingControl)
    expect(item.control.props).toEqual({ sectionId: 'air', sectionLabel: 'Air' })
    expect(item.control.emits).toEqual(['stage'])
  })

  it('names the section in sentence case for the control', () => {
    expect(historySettingItem('space', 'SPACE', 'orbits').control.props).toEqual({
      sectionId: 'space',
      sectionLabel: 'Space',
    })
  })
})
