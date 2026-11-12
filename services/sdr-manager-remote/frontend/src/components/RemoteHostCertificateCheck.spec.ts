import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import RemoteHostCertificateCheck from './RemoteHostCertificateCheck.vue'
import type { SdrManagerCertificatePreview } from '../api/sdrManagerRemoteApi'

const PAIRS = Array.from({ length: 32 }, (_unused, index) =>
  index.toString(16).padStart(2, '0').toUpperCase(),
)
const FINGERPRINT = PAIRS.join(':')

const TLS: SdrManagerCertificatePreview = {
  tls_available: true,
  detail: 'ok',
  fingerprint: FINGERPRINT,
  subject: 'CN=Roof Pi authority',
  not_valid_after: 'Nov 10 12:00:00 2036 GMT',
  matches_pinned: null,
}
const NO_TLS: SdrManagerCertificatePreview = {
  tls_available: false,
  detail:
    "This SDR host doesn't offer HTTPS: its console password would cross the network unencrypted.",
}

function mountCheck(
  props: Partial<InstanceType<typeof RemoteHostCertificateCheck>['$props']> = {},
) {
  return mount(RemoteHostCertificateCheck, {
    props: { preview: TLS, ...props },
    attachTo: document.body,
  })
}

describe('RemoteHostCertificateCheck', () => {
  it('shows the fingerprint as two even lines of sixteen pairs', () => {
    const wrapper = mountCheck()
    expect(wrapper.get('.remote-host-certificate-fingerprint').text()).toBe(
      `${PAIRS.slice(0, 16).join(':')}\n${PAIRS.slice(16).join(':')}`,
    )
    wrapper.unmount()
  })

  it('names who the authority was issued to and until when', () => {
    const wrapper = mountCheck()
    const facts = wrapper.findAll('.remote-host-certificate-facts dd').map((fact) => fact.text())
    expect(facts.slice(1)).toEqual(['CN=Roof Pi authority', 'Nov 10 12:00:00 2036 GMT'])
    wrapper.unmount()
  })

  it('leaves out facts the host did not give', () => {
    const wrapper = mountCheck({ preview: { ...TLS, subject: null, not_valid_after: null } })
    expect(wrapper.findAll('.remote-host-certificate-facts dt').map((term) => term.text())).toEqual(
      ['FINGERPRINT (SHA-256)'],
    )
    wrapper.unmount()
  })

  it('shows an empty fingerprint when the preview has none', () => {
    const wrapper = mountCheck({ preview: { ...TLS, fingerprint: undefined } })
    expect(wrapper.get('.remote-host-certificate-fingerprint').text()).toBe('')
    wrapper.unmount()
  })

  it('tells the operator when this is the certificate already trusted', () => {
    const matching = mountCheck({ preview: { ...TLS, matches_pinned: true } })
    expect(matching.text()).toContain('already trusted for this host')
    matching.unmount()
    for (const matches of [false, null]) {
      const other = mountCheck({ preview: { ...TLS, matches_pinned: matches } })
      expect(other.text()).not.toContain('already trusted')
      other.unmount()
    }
  })

  it('confirms with the given words, and TRUST by default', async () => {
    const plain = mountCheck()
    expect(plain.get('.sdr-devices-btn--primary').text()).toBe('TRUST')
    plain.unmount()
    const wrapper = mountCheck({ trustLabel: 'TRUST AND ADD' })
    await wrapper.get('.sdr-devices-btn--primary').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    await wrapper.get('.sdr-devices-btn:not(.sdr-devices-btn--primary)').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    wrapper.unmount()
  })

  it('holds the confirm button while busy', () => {
    const wrapper = mountCheck({ busy: true })
    expect(wrapper.get('.sdr-devices-btn--primary').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  describe('a host without HTTPS', () => {
    it('warns, and offers to add it without encryption only when adding', () => {
      const adding = mountCheck({ preview: NO_TLS, allowPlainHttp: true })
      expect(adding.get('.remote-host-certificate-heading').text()).toBe('NO ENCRYPTION')
      expect(adding.get('.remote-host-certificate-warning').text()).toBe(NO_TLS.detail)
      expect(adding.text()).toContain('only on a network you trust')
      expect(adding.get('.sdr-devices-btn--primary').text()).toBe('ADD WITHOUT ENCRYPTION')
      expect(adding.get('.sdr-devices-btn:not(.sdr-devices-btn--primary)').text()).toBe('CANCEL')
      adding.unmount()
    })

    it('has nothing to confirm for an existing host, only CLOSE', () => {
      const wrapper = mountCheck({ preview: NO_TLS })
      expect(wrapper.find('.sdr-devices-btn--primary').exists()).toBe(false)
      expect(wrapper.get('.sdr-devices-btn').text()).toBe('CLOSE')
      expect(wrapper.text()).not.toContain('only on a network you trust')
      wrapper.unmount()
    })
  })

  it('moves focus to its heading, so the check is announced', async () => {
    const wrapper = mountCheck()
    await flushPromises()
    expect(document.activeElement).toBe(wrapper.get('.remote-host-certificate-heading').element)
    wrapper.unmount()
  })

  it('is a group named by its heading and described by its instructions', () => {
    const wrapper = mountCheck()
    const group = wrapper.get('[role="group"]')
    expect(wrapper.get(`#${group.attributes('aria-labelledby')}`).text()).toBe(
      "CHECK THE HOST'S CERTIFICATE",
    )
    expect(wrapper.get(`#${group.attributes('aria-describedby')}`).text()).toContain(
      'Compare this fingerprint',
    )
    wrapper.unmount()
  })

  it('gives two checks in one app different ids', () => {
    // useId is unique per app, which is what the shell is: one app, every remote inside it.
    const TwoChecks = defineComponent({
      components: { RemoteHostCertificateCheck },
      setup: () => ({ preview: TLS }),
      template:
        '<div><RemoteHostCertificateCheck :preview="preview" /><RemoteHostCertificateCheck :preview="preview" /></div>',
    })
    const wrapper = mount(TwoChecks, { attachTo: document.body })
    const [first, second] = wrapper.findAll('[role="group"]')
    expect(first!.attributes('aria-labelledby')).not.toBe(second!.attributes('aria-labelledby'))
    wrapper.unmount()
  })

  it.each([
    ['with HTTPS', TLS],
    ['without HTTPS', NO_TLS],
  ])('has no accessibility violations %s', async (_label, preview) => {
    const wrapper = mountCheck({ preview, allowPlainHttp: true })
    expect(await axe(wrapper.element)).toHaveNoViolations()
    wrapper.unmount()
  })
})
