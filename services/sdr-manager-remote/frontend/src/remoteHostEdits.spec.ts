import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SdrManagerHost } from '@sentinel/shell-api/types/sdrManager'
import { SdrManagerApiError } from './api/sdrManagerRemoteApi'

vi.mock('./api/sdrManagerRemoteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/sdrManagerRemoteApi')>()
  return { ...actual, updateHost: vi.fn() }
})

import { updateHost } from './api/sdrManagerRemoteApi'
import { RemoteHostSaveError, saveRemoteHostDraft, type RemoteHostDraft } from './remoteHostEdits'

const mockUpdateHost = vi.mocked(updateHost)

const REMOTE_HOST: SdrManagerHost = {
  id: 5,
  name: 'Roof Pi',
  address: '192.168.1.50',
  port: 8000,
  enabled: true,
  auth_token_set: true,
  is_local: false,
  created_at: 0,
  last_seen_at: 100,
  last_error: null,
  reachable: true,
  api_version: '1.0.0',
}
const LOCAL_HOST: SdrManagerHost = {
  ...REMOTE_HOST,
  id: 9,
  name: null,
  address: 'host.docker.internal',
  is_local: true,
}

function draftOf(overrides: Partial<RemoteHostDraft> = {}): RemoteHostDraft {
  return { address: '192.168.1.50', name: 'Roof Pi', port: 8000, authToken: '', ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdateHost.mockResolvedValue(REMOTE_HOST)
})

describe('saveRemoteHostDraft for a remote host', () => {
  it('sends name, address and port, and no auth_token when none was typed', async () => {
    await saveRemoteHostDraft(REMOTE_HOST, draftOf())
    expect(mockUpdateHost).toHaveBeenCalledTimes(1)
    const [hostId, patch] = mockUpdateHost.mock.calls[0]!
    expect(hostId).toBe(5)
    expect(patch).toEqual({ name: 'Roof Pi', address: '192.168.1.50', port: 8000 })
    expect(patch).not.toHaveProperty('auth_token')
  })

  it('sends the console password when one was typed', async () => {
    await saveRemoteHostDraft(REMOTE_HOST, draftOf({ authToken: 'new-token' }))
    expect(mockUpdateHost.mock.calls[0]![1]).toMatchObject({ auth_token: 'new-token' })
  })

  it('trims the label and the address', async () => {
    await saveRemoteHostDraft(REMOTE_HOST, draftOf({ name: '  Attic ', address: ' 10.0.0.9 ' }))
    expect(mockUpdateHost.mock.calls[0]![1]).toMatchObject({ name: 'Attic', address: '10.0.0.9' })
  })

  it.each(['', '   '])('clears a blank label (%j) to an explicit null', async (name) => {
    await saveRemoteHostDraft(REMOTE_HOST, draftOf({ name }))
    const patch = mockUpdateHost.mock.calls[0]![1]
    expect(patch).toHaveProperty('name', null)
  })

  it.each([0, Number.NaN])('falls back to port 8000 when the port is %s', async (port) => {
    await saveRemoteHostDraft(REMOTE_HOST, draftOf({ port }))
    expect(mockUpdateHost.mock.calls[0]![1]).toMatchObject({ port: 8000 })
  })

  it('keeps a non-default port', async () => {
    await saveRemoteHostDraft(REMOTE_HOST, draftOf({ port: 9000 }))
    expect(mockUpdateHost.mock.calls[0]![1]).toMatchObject({ port: 9000 })
  })

  it.each(['', '   '])('refuses a blank address (%j) without calling the API', async (address) => {
    const failure = await saveRemoteHostDraft(REMOTE_HOST, draftOf({ address })).catch(
      (caught: unknown) => caught,
    )
    expect(failure).toBeInstanceOf(RemoteHostSaveError)
    expect((failure as Error).message).toBe('IP address is required.')
    expect(mockUpdateHost).not.toHaveBeenCalled()
  })
})

describe("saveRemoteHostDraft for this machine's row", () => {
  it('sends only the label', async () => {
    await saveRemoteHostDraft(
      LOCAL_HOST,
      draftOf({ name: ' Shack ', address: 'ignored', port: 1, authToken: 'ignored' }),
    )
    expect(mockUpdateHost).toHaveBeenCalledWith(9, { name: 'Shack' })
  })

  it('clears a blank label to null', async () => {
    await saveRemoteHostDraft(LOCAL_HOST, draftOf({ name: '  ' }))
    expect(mockUpdateHost).toHaveBeenCalledWith(9, { name: null })
  })

  it('does not require an address', async () => {
    await expect(saveRemoteHostDraft(LOCAL_HOST, draftOf({ address: '' }))).resolves.toBeUndefined()
    expect(mockUpdateHost).toHaveBeenCalledTimes(1)
  })
})

describe('saveRemoteHostDraft failures', () => {
  it("surfaces the API's rejection message verbatim as a RemoteHostSaveError", async () => {
    mockUpdateHost.mockRejectedValue(
      new SdrManagerApiError(409, 'port_conflict', 'Port 1234 is already in use by rtl-3.'),
    )
    const failure = await saveRemoteHostDraft(REMOTE_HOST, draftOf()).catch(
      (caught: unknown) => caught,
    )
    expect(failure).toBeInstanceOf(RemoteHostSaveError)
    expect((failure as Error).name).toBe('RemoteHostSaveError')
    expect((failure as Error).message).toBe('Port 1234 is already in use by rtl-3.')
  })

  it('falls back to a generic message for any other failure', async () => {
    mockUpdateHost.mockRejectedValue(new TypeError('boom'))
    await expect(saveRemoteHostDraft(REMOTE_HOST, draftOf())).rejects.toMatchObject({
      name: 'RemoteHostSaveError',
      message: 'Save failed.',
    })
  })

  it("reports a refusal of this machine's label too", async () => {
    mockUpdateHost.mockRejectedValue(
      new SdrManagerApiError(409, 'local_host_managed', 'This machine is managed by Sentinel.'),
    )
    await expect(saveRemoteHostDraft(LOCAL_HOST, draftOf())).rejects.toThrow(
      'This machine is managed by Sentinel.',
    )
  })
})
