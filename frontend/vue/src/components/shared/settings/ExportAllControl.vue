<script setup lang="ts">
import { ref } from 'vue'

// Standalone "export everything" control. Writes the full Sentinel configuration
// — the app config plus the two SDR data files that live outside it
// (frequencies/groups and the band plan) — into a single user-chosen directory.
// Lives in its own settings section so the descriptive copy can spell out
// exactly which files are produced.

// Every config EXPORT ALL writes into the chosen directory. Each entry pairs the
// source endpoint with the filename written and a short description shown in the
// file list above the button.
const ALL_CONFIG_EXPORTS: { url: string; filename: string; description: string }[] = [
  {
    url: '/api/settings/config/preview',
    filename: 'sentinel_config.json',
    description: 'all app settings',
  },
  {
    url: '/api/sdr/data/frequencies',
    filename: 'sdr_frequencies.json',
    description: 'SDR groups, frequencies & search ranges',
  },
  {
    url: '/api/sdr/data/bandplan',
    filename: 'sdr_bandplan.json',
    description: 'the RF band plan',
  },
]

// Transient confirmation/error text shown beside the button.
const status = ref('')

// Briefly surface a status message, then clear it. Errors are held longer than
// the success line so the user has time to read what failed.
function showStatus(message: string, isError: boolean): void {
  status.value = message
  setTimeout(() => (status.value = ''), isError ? 6000 : 3000)
}

// Fetch one config endpoint and return it as a pretty-printed JSON string ready
// to write to disk, matching the single-file EXPORT formatting elsewhere.
async function fetchConfigJson(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return JSON.stringify(await res.json(), null, 2)
}

// Export the app config and both SDR data files together into a single
// user-chosen directory. Prefers the File System Access directory picker so all
// three land side by side in one folder; where that API is unavailable
// (Firefox/Safari) it falls back to downloading the three files individually.
async function exportAllConfigs(): Promise<void> {
  status.value = ''
  let files: { filename: string; content: string }[]
  try {
    files = await Promise.all(
      ALL_CONFIG_EXPORTS.map(async (target) => ({
        filename: target.filename,
        content: await fetchConfigJson(target.url),
      })),
    )
  } catch (err) {
    showStatus('Export failed: ' + (err as Error).message, true)
    return
  }

  if ('showDirectoryPicker' in window) {
    try {
      // The File System Access API isn't in the TS DOM lib; cast to its shape.
      const pickDirectory = (
        window as unknown as {
          showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
        }
      ).showDirectoryPicker
      const directoryHandle = await pickDirectory()
      for (const file of files) {
        const fileHandle = await directoryHandle.getFileHandle(file.filename, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(file.content)
        await writable.close()
      }
      showStatus(`Exported ${files.length} files`, false)
      return
    } catch (err) {
      // A user cancelling the directory picker is not an error — say nothing.
      if (err instanceof DOMException && err.name === 'AbortError') return
      showStatus('Export failed: ' + (err as Error).message, true)
      return
    }
  }

  // Fallback: no directory picker, so trigger one download per file. The browser
  // routes them all to the same Downloads folder — a single directory in spirit.
  for (const file of files) {
    const blob = new Blob([file.content], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = file.filename
    anchor.click()
    URL.revokeObjectURL(url)
  }
  showStatus(`Downloaded ${files.length} files`, false)
}
</script>

<template>
  <div class="settings-export-all-wrap">
    <div class="settings-export-all-action">
      <button class="settings-config-btn" @click="exportAllConfigs">EXPORT ALL</button>
      <span v-if="status" class="settings-export-all-status" role="status">{{ status }}</span>
    </div>
  </div>
</template>

<style scoped>
.settings-export-all-wrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settings-export-all-action {
  display: flex;
  align-items: center;
  gap: 10px;
}

.settings-export-all-status {
  font-family: 'Barlow', 'Helvetica Neue', Arial, sans-serif;
  font-size: 11px;
  color: rgba(16, 19, 29, 0.5);
}
</style>
