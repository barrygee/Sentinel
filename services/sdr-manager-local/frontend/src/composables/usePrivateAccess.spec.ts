import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import * as api from '../api/sdrManagerLocalApi'
import { useLocalSdrStore } from '../stores/localSdrStore'
import { usePrivateAccess } from './usePrivateAccess'

vi.mock('../api/sdrManagerLocalApi')

const passwordRequired = new SdrManagerApiError(409, 'console_password_required', 'refused')

describe('usePrivateAccess', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('loads the stored list', async () => {
    vi.mocked(api.getPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1'] })
    const access = usePrivateAccess()

    await access.load()

    expect(access.addresses.value).toEqual(['10.0.0.1'])
    expect(access.errorMessage.value).toBeNull()
  })

  it('reports a failed load, and clears it on the next good one', async () => {
    vi.mocked(api.getPrivateAccess).mockRejectedValueOnce(new Error('network'))
    const access = usePrivateAccess()

    await access.load()
    expect(access.errorMessage.value).toBe('The address list could not be loaded.')

    vi.mocked(api.getPrivateAccess).mockResolvedValue({ addresses: [] })
    await access.load()
    expect(access.errorMessage.value).toBeNull()
  })

  it('adds to the end of the list and shows what the host stored', async () => {
    vi.mocked(api.getPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1'] })
    vi.mocked(api.setPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1', '2001:db8::1'] })
    const access = usePrivateAccess()
    await access.load()

    await expect(access.add('2001:DB8::1')).resolves.toBe(true)

    expect(api.setPrivateAccess).toHaveBeenCalledWith(['10.0.0.1', '2001:DB8::1'])
    expect(access.addresses.value).toEqual(['10.0.0.1', '2001:db8::1'])
  })

  it('removes only the address named', async () => {
    vi.mocked(api.getPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1', '10.0.0.2'] })
    vi.mocked(api.setPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.2'] })
    const access = usePrivateAccess()
    await access.load()

    await expect(access.remove('10.0.0.1')).resolves.toBe(true)

    expect(api.setPrivateAccess).toHaveBeenCalledWith(['10.0.0.2'])
  })

  it('announces a change', async () => {
    vi.useFakeTimers()
    vi.mocked(api.setPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1'] })
    const announce = vi.spyOn(useLocalSdrStore(), 'announce')
    const access = usePrivateAccess()

    await access.add('10.0.0.1')
    await access.remove('10.0.0.1')

    expect(announce.mock.calls).toEqual([['10.0.0.1 added.'], ['10.0.0.1 removed.']])
    vi.useRealTimers()
  })

  it('keeps the list and says why when a change is refused', async () => {
    vi.mocked(api.getPrivateAccess).mockResolvedValue({ addresses: ['10.0.0.1'] })
    vi.mocked(api.setPrivateAccess).mockRejectedValue(passwordRequired)
    const access = usePrivateAccess()
    await access.load()

    await expect(access.add('10.0.0.2')).resolves.toBe(false)

    expect(access.addresses.value).toEqual(['10.0.0.1'])
    expect(access.errorMessage.value).toContain('Set a console password first')
    expect(access.saving.value).toBe(false)
  })

  it('is saving only while a request is in flight', async () => {
    let finish: (value: { addresses: string[] }) => void = () => undefined
    vi.mocked(api.setPrivateAccess).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const access = usePrivateAccess()

    const adding = access.add('10.0.0.1')
    expect(access.saving.value).toBe(true)

    finish({ addresses: ['10.0.0.1'] })
    await adding
    expect(access.saving.value).toBe(false)
  })
})
