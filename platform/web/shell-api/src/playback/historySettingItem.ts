import HistoryRecordingControl from '@sentinel/shell-api/settings/HistoryRecordingControl.vue'
import type { PlaybackSectionId } from '@sentinel/shell-api/playback/playbackSections'
import type { SettingItem } from '@sentinel/shell-api/types/settings'

/**
 * The REPLAY group's settings item for a section: record history on/off, days
 * to keep and what is stored. Every recording section registers the same item
 * through this, so the four stay identical.
 *
 * @param sectionId    The section's id and settings namespace (`air`).
 * @param sectionLabel The Settings section label (`AIR`).
 * @param what         What gets recorded, for the description (`aircraft positions`).
 */
export function historySettingItem(
  sectionId: PlaybackSectionId,
  sectionLabel: string,
  what: string,
): SettingItem {
  const sectionName = sectionLabel.charAt(0) + sectionLabel.slice(1).toLowerCase()
  return {
    section: sectionId,
    sectionLabel,
    id: `${sectionId}-history`,
    label: 'History & Replay',
    desc: `Records ${what} for up to 7 rolling days, kept across restarts, so the map can replay them. Works online and off grid`,
    searchTerms:
      'history replay playback record recording timeline rewind scrub past movement days storage',
    control: {
      component: HistoryRecordingControl,
      props: { sectionId, sectionLabel: sectionName },
      emits: ['stage'],
      naturalHeight: true,
    },
    groupLabel: 'REPLAY',
  }
}
