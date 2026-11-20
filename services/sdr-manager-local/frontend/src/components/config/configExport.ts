import type { ConfigExport } from '@sentinel/shell-api/shell/configExports'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'

/** The file this machine's SDR Manager config is saved as, by DOWNLOAD and by Export All. */
export const CONFIG_EXPORT_FILE_NAME = 'sdr-manager-local-config.json'

/**
 * This machine's SDR Manager config for App Settings › Export All
 * Configuration. When it can't be read, the rejection says why in a few
 * words, which Export All shows beside the files it did write.
 */
export const sdrManagerLocalConfigExport: ConfigExport = {
  filename: CONFIG_EXPORT_FILE_NAME,
  async read() {
    try {
      return await api.getConfig()
    } catch (error) {
      if (error instanceof SdrManagerApiError && error.status === 401) {
        throw new Error('sign in to this machine’s SDR Manager first', { cause: error })
      }
      throw new Error('this machine’s SDR Manager is not answering', { cause: error })
    }
  },
}
