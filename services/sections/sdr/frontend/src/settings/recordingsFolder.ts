/**
 * Validation for the `sdr.recordingsFolder` setting, mirroring the backend's
 * (`sentinel_sdr.services.recording_folders.parse_recordings_folder`): the
 * value is a subfolder of the recordings root, so it must stay inside it. The
 * backend checks again and falls back to the root; this only stops the
 * Settings panel staging a value the backend would ignore.
 */

/** Longest folder text accepted, as the backend's `MAX_FOLDER_LENGTH`. */
export const MAX_RECORDINGS_FOLDER_LENGTH = 200
/** Most nested folders accepted, as the backend's `MAX_FOLDER_DEPTH`. */
export const MAX_RECORDINGS_FOLDER_DEPTH = 8

/** Why `text` can't be the recordings folder, or `null` when it can (empty = the root). */
export function recordingsFolderError(text: string): string | null {
  const folder = text.trim()
  if (folder.length > MAX_RECORDINGS_FOLDER_LENGTH) {
    return `Use at most ${MAX_RECORDINGS_FOLDER_LENGTH} characters`
  }
  // Code points below 32 are control characters; a backslash is a Windows separator.
  if ([...folder].some((character) => character.charCodeAt(0) < 32 || character === '\\')) {
    return 'Use forward slashes and printable characters only'
  }
  if (folder.startsWith('/') || /^[A-Za-z]:/.test(folder)) {
    return 'Use a folder inside the recordings folder, not a full path'
  }
  const parts = folder.split('/').filter((part) => part !== '')
  if (parts.some((part) => part.trim() === '.' || part.trim() === '..')) {
    return 'Folder names cannot be . or ..'
  }
  if (parts.length > MAX_RECORDINGS_FOLDER_DEPTH) {
    return `Use at most ${MAX_RECORDINGS_FOLDER_DEPTH} nested folders`
  }
  return null
}
