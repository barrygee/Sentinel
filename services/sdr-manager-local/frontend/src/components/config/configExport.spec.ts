import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../../api/sdrManagerLocalApi'
import { CONFIG_EXPORT_FILE_NAME, sdrManagerLocalConfigExport } from './configExport'

vi.mock('../../api/sdrManagerLocalApi')

describe('sdrManagerLocalConfigExport', () => {
  beforeEach(() => {
    vi.mocked(api.getConfig).mockReset()
  })

  it('is saved under the same name DOWNLOAD CONFIGURATION gives it', () => {
    expect(CONFIG_EXPORT_FILE_NAME).toBe('sdr-manager-local-config.json')
    expect(sdrManagerLocalConfigExport.filename).toBe(CONFIG_EXPORT_FILE_NAME)
  })

  it('reads this machine’s configuration as the API exports it', async () => {
    const config = { version: 1, devices: [] }
    vi.mocked(api.getConfig).mockResolvedValue(config)

    await expect(sdrManagerLocalConfigExport.read()).resolves.toBe(config)
    expect(api.getConfig).toHaveBeenCalledTimes(1)
  })

  it('asks the operator to sign in when the console is signed out', async () => {
    const unauthorized = new SdrManagerApiError(401, 'unauthorized', 'Sign in first.')
    vi.mocked(api.getConfig).mockRejectedValue(unauthorized)

    const error = await sdrManagerLocalConfigExport.read().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('sign in to this machine’s SDR Manager first')
    expect((error as Error).cause).toBe(unauthorized)
  })

  it('says the SDR Manager is not answering for any other API refusal', async () => {
    vi.mocked(api.getConfig).mockRejectedValue(
      new SdrManagerApiError(503, 'unavailable', 'Service unavailable'),
    )

    await expect(sdrManagerLocalConfigExport.read()).rejects.toThrow(
      'this machine’s SDR Manager is not answering',
    )
  })

  it('says the SDR Manager is not answering when the request never reaches it', async () => {
    const networkFailure = new TypeError('Failed to fetch')
    vi.mocked(api.getConfig).mockRejectedValue(networkFailure)

    const error = await sdrManagerLocalConfigExport.read().catch((caught: unknown) => caught)
    expect((error as Error).message).toBe('this machine’s SDR Manager is not answering')
    expect((error as Error).cause).toBe(networkFailure)
  })
})
