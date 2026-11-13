import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import { SdrManagerApiError } from '@sentinel/shell-api/services/sdrManagerRequest'
import CertificateFingerprintControl from './CertificateFingerprintControl.vue'

vi.mock('../../api/sdrManagerLocalApi', () => ({ getCertificateAuthority: vi.fn() }))

import { getCertificateAuthority } from '../../api/sdrManagerLocalApi'

const mockGetCertificateAuthority = vi.mocked(getCertificateAuthority)
const FINGERPRINT = Array(32).fill('5E').join(':')

function mountControl() {
  return mount(CertificateFingerprintControl, { attachTo: document.body })
}

describe('CertificateFingerprintControl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCertificateAuthority.mockResolvedValue({
      certificate_authority: '-----BEGIN CERTIFICATE-----',
      fingerprint: FINGERPRINT,
    })
  })

  it('says it is reading until the fingerprint arrives', () => {
    mockGetCertificateAuthority.mockReturnValue(new Promise(() => {}))
    const wrapper = mountControl()
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Reading…')
    wrapper.unmount()
  })

  it('shows the fingerprint other Sentinels see, and says what it is for', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.get('.certificate-fingerprint-value code').text()).toBe(FINGERPRINT)
    expect(wrapper.get('.certificate-fingerprint-label').text()).toBe('FINGERPRINT (SHA-256)')
    expect(wrapper.text()).toContain('Other Sentinels show this fingerprint')
    expect(wrapper.find('[aria-live="polite"]').exists()).toBe(false)
    expect(mockGetCertificateAuthority).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('is a settings card like the others, its note at the description size', async () => {
    const wrapper = mountControl()
    await flushPromises()
    const card = wrapper.get('.sdr-devices-accordion')
    expect(card.get('.sdr-devices-note').text()).toContain('Other Sentinels show this fingerprint')
    // The caption and value share one row, like a field's label and input.
    const row = card.get('.certificate-fingerprint-value')
    expect(row.element.children).toHaveLength(2)
    expect(row.element.children[0]?.textContent).toBe('FINGERPRINT (SHA-256)')
    wrapper.unmount()
  })

  it.each([
    [
      new SdrManagerApiError(404, 'no_certificate_authority', 'none'),
      'No certificate yet: run docker compose up -d on this machine.',
    ],
    [
      new SdrManagerApiError(502, 'network_error', 'down'),
      "Could not read this machine's certificate.",
    ],
    [new Error('boom'), "Could not read this machine's certificate."],
  ])('explains a failed read (%#)', async (error, message) => {
    mockGetCertificateAuthority.mockRejectedValue(error)
    const wrapper = mountControl()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(message)
    expect(wrapper.find('.certificate-fingerprint-value').exists()).toBe(false)
    wrapper.unmount()
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountControl()
    await flushPromises()
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
