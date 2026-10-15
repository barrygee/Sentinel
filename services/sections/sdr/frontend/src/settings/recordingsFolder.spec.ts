import { describe, it, expect } from 'vitest'
import {
  MAX_RECORDINGS_FOLDER_DEPTH,
  MAX_RECORDINGS_FOLDER_LENGTH,
  recordingsFolderError,
} from './recordingsFolder'

describe('recordingsFolderError', () => {
  it.each([
    ['empty (the root)', ''],
    ['blank (the root)', '   '],
    ['a folder', 'noaa'],
    ['nested folders', 'satellites/noaa'],
    ['doubled and trailing slashes', 'satellites//noaa/'],
    ['spaces and dashes', 'my recordings/2026-10'],
    ['dots inside a name', 'v1.2'],
    ['three dots', '...'],
  ])('accepts %s', (_case, text) => {
    expect(recordingsFolderError(text)).toBeNull()
  })

  it.each([
    ['an absolute path', '/etc'],
    ['the filesystem root', '/'],
    ['a Windows drive path', 'C:/recordings'],
    ['a bare drive', 'd:'],
  ])('refuses %s as a full path', (_case, text) => {
    expect(recordingsFolderError(text)).toBe(
      'Use a folder inside the recordings folder, not a full path',
    )
  })

  it.each([
    ['a parent folder', '..'],
    ['an escape', '../escape'],
    ['an escape further in', 'noaa/../../escape'],
    ['a padded parent', 'noaa/ .. /x'],
    ['the current folder', '.'],
    ['a leading current folder', './noaa'],
  ])('refuses %s', (_case, text) => {
    expect(recordingsFolderError(text)).toBe('Folder names cannot be . or ..')
  })

  it.each([
    ['a backslash', 'noaa\\escape'],
    ['a NUL', 'noaa\u0000'],
    ['a newline', 'noaa\nnext'],
  ])('refuses %s', (_case, text) => {
    expect(recordingsFolderError(text)).toBe('Use forward slashes and printable characters only')
  })

  it('accepts the longest and deepest allowed and refuses one more of each', () => {
    expect(recordingsFolderError('a'.repeat(MAX_RECORDINGS_FOLDER_LENGTH))).toBeNull()
    expect(recordingsFolderError('a'.repeat(MAX_RECORDINGS_FOLDER_LENGTH + 1))).toBe(
      'Use at most 200 characters',
    )
    expect(recordingsFolderError(Array(MAX_RECORDINGS_FOLDER_DEPTH).fill('a').join('/'))).toBeNull()
    expect(
      recordingsFolderError(
        Array(MAX_RECORDINGS_FOLDER_DEPTH + 1)
          .fill('a')
          .join('/'),
      ),
    ).toBe('Use at most 8 nested folders')
  })

  it('matches the backend limits', () => {
    // sentinel_sdr.services.recording_folders.MAX_FOLDER_LENGTH / MAX_FOLDER_DEPTH
    expect(MAX_RECORDINGS_FOLDER_LENGTH).toBe(200)
    expect(MAX_RECORDINGS_FOLDER_DEPTH).toBe(8)
  })
})
