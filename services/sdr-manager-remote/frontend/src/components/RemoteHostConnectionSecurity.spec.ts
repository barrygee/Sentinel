import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import type { SdrManagerHost, SdrManagerTlsState } from '@sentinel/shell-api/types/sdrManager'
import RemoteHostConnectionSecurity from './RemoteHostConnectionSecurity.vue'
import { SdrManagerApiError } from '../api/sdrManagerRemoteApi'

vi.mock('../api/sdrManagerRemoteApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/sdrManagerRemoteApi')>()
  return { ...actual, previewHostCertificate: vi.fn(), trustHostCertificate: vi.fn() }
})
vi.mock('../hostsChanged', () => ({ announceHostsChanged: vi.fn() }))

import { previewHostCertificate, trustHostCertificate } from '../api/sdrManagerRemoteApi'
import { announceHostsChanged } from '../hostsChanged'

const mockPreview = vi.mocked(previewHostCertificate)
const mockTrust = vi.mocked(trustHostCertificate)
const mockAnnounce = vi.mocked(announceHostsChanged)

const FINGERPRINT = Array(32).fill('AB').join(':')
const NEW_FINGERPRINT = Array(32).fill('CD').join(':')

function host(overrides: Partial<SdrManagerHost> = {}): SdrManagerHost {
  return {
    id: 7,
    name: 'Roof Pi',
    address: '192.168.1.50',
    port: 8000,
    enabled: true,
    auth_token_set: true,
    is_local: false,
    may_use_private: false,
    auto_add_sdrs: false,
    created_at: 0,
    last_seen_at: null,
    last_error: null,
    reachable: true,
    api_version: null,
    transport: 'https',
    tls_fingerprint: FINGERPRINT,
    tls_state: 'pinned',
    ...overrides,
  }
}

function mountSecurity(overrides: Partial<SdrManagerHost> = {}) {
  return mount(RemoteHostConnectionSecurity, {
    props: { host: host(overrides) },
    attachTo: document.body,
  })
}

const checkButton = (wrapper: ReturnType<typeof mountSecurity>) =>
  wrapper.get('.sdr-devices-form-actions .sdr-devices-btn')

describe('RemoteHostConnectionSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPreview.mockResolvedValue({
      tls_available: true,
      detail: 'ok',
      fingerprint: NEW_FINGERPRINT,
      subject: 'CN=Roof Pi authority',
      not_valid_after: 'Nov 10 12:00:00 2036 GMT',
      matches_pinned: false,
    })
    mockTrust.mockResolvedValue(host({ tls_fingerprint: NEW_FINGERPRINT }))
  })

  it.each([
    ['pinned', 'ENCRYPTED', 'good'],
    ['deployment', 'ENCRYPTED', 'good'],
    ['changed', 'CERTIFICATE CHANGED', 'warn'],
    ['untrusted', 'NOT TRUSTED YET', 'warn'],
    ['insecure', 'NOT ENCRYPTED', 'warn'],
  ] as const)('says %s as %s', (state: SdrManagerTlsState, label, tone) => {
    const wrapper = mountSecurity({ tls_state: state })
    expect(wrapper.get('.remote-host-security-label').text()).toBe(label)
    expect(wrapper.get('.remote-host-security-state').classes()).toContain(
      `remote-host-security-state--${tone}`,
    )
    wrapper.unmount()
  })

  it('reads a host list from before HTTPS as plain HTTP', () => {
    const wrapper = mountSecurity({ tls_state: undefined as unknown as SdrManagerTlsState })
    expect(wrapper.get('.remote-host-security-label').text()).toBe('NOT ENCRYPTED')
    wrapper.unmount()
  })

  it('shows the trusted fingerprint, and none for a host without one', () => {
    const pinned = mountSecurity()
    // Two lines of sixteen pairs, broken between pairs, as the certificate check shows it.
    const half = Array(16).fill('AB').join(':')
    expect(pinned.get('.remote-host-security-fingerprint code').text()).toBe(`${half}\n${half}`)
    pinned.unmount()
    const insecure = mountSecurity({ tls_state: 'insecure', tls_fingerprint: null })
    expect(insecure.find('.remote-host-security-fingerprint').exists()).toBe(false)
    insecure.unmount()
  })

  it('CHECK CERTIFICATE reads what the host presents now', async () => {
    const wrapper = mountSecurity({ tls_state: 'changed' })
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    expect(mockPreview).toHaveBeenCalledWith(7)
    expect(wrapper.get('.remote-host-certificate-fingerprint').text()).toContain('CD:CD')
    // The old fingerprint line gives way to the check while it is open.
    expect(wrapper.find('.remote-host-security-fingerprint').exists()).toBe(false)
    expect(mockTrust).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('says CHECKING, and waits, while it reads', async () => {
    let finish: (value: Awaited<ReturnType<typeof previewHostCertificate>>) => void = () => {}
    mockPreview.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = mountSecurity()
    await checkButton(wrapper).trigger('click')
    expect(checkButton(wrapper).text()).toBe('CHECKING')
    expect(checkButton(wrapper).attributes('disabled')).toBeDefined()
    finish({ tls_available: false, detail: 'no https' })
    await flushPromises()
    wrapper.unmount()
  })

  it('trusts the fingerprint it showed, then tells the host list', async () => {
    const wrapper = mountSecurity({ tls_state: 'changed' })
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.get('.remote-host-certificate .sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(mockTrust).toHaveBeenCalledWith(7, NEW_FINGERPRINT)
    expect(mockAnnounce).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.remote-host-certificate').exists()).toBe(false)
    wrapper.unmount()
  })

  it('cancelling the check trusts nothing', async () => {
    const wrapper = mountSecurity()
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.get('.remote-host-certificate .sdr-devices-btn').trigger('click')
    expect(wrapper.find('.remote-host-certificate').exists()).toBe(false)
    expect(mockTrust).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('a host without HTTPS can only be closed, not trusted', async () => {
    mockPreview.mockResolvedValue({ tls_available: false, detail: "doesn't offer HTTPS" })
    const wrapper = mountSecurity({ tls_state: 'insecure', tls_fingerprint: null })
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.find('.remote-host-certificate .sdr-devices-btn--primary').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does nothing if asked to trust with no fingerprint on screen', async () => {
    const wrapper = mountSecurity()
    await (wrapper.vm as unknown as { trust: () => Promise<void> }).trust()
    expect(mockTrust).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([
    [
      new SdrManagerApiError(
        502,
        'host_unreachable',
        'Could not reach SDR host 192.168.1.50:8000.',
      ),
      'Could not reach SDR host 192.168.1.50:8000.',
    ],
    [new Error('boom'), "Could not read the host's certificate."],
  ])('shows why the certificate could not be read (%#)', async (error, message) => {
    mockPreview.mockRejectedValue(error)
    const wrapper = mountSecurity()
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    wrapper.unmount()
  })

  it.each([
    [new SdrManagerApiError(409, 'certificate_changed', 'Check it again.'), 'Check it again.'],
    [new Error('boom'), 'Could not trust the certificate.'],
  ])('closes a check the trust refused, saying why (%#)', async (error, message) => {
    mockTrust.mockRejectedValue(error)
    const wrapper = mountSecurity()
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    await wrapper.get('.remote-host-certificate .sdr-devices-btn--primary').trigger('click')
    await flushPromises()
    expect(wrapper.find('.remote-host-certificate').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(mockAnnounce).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('has no accessibility violations, closed or checking', async () => {
    const wrapper = mountSecurity({ tls_state: 'changed' })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    await checkButton(wrapper).trigger('click')
    await flushPromises()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
