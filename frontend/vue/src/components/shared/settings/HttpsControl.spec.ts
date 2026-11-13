import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { axe } from 'jest-axe'
import HttpsControl from './HttpsControl.vue'
import { pageLocation } from './pageLocation'

vi.mock('./pageLocation', () => ({ pageLocation: vi.fn() }))

const PAIRS = Array.from({ length: 32 }, (_unused, index) =>
  index.toString(16).padStart(2, '0').toUpperCase(),
)
const AUTHORITY = {
  certificate_authority: '-----BEGIN CERTIFICATE-----',
  fingerprint: PAIRS.join(':'),
  https_port: 9443,
}

function onPage(protocol: 'http:' | 'https:'): void {
  vi.mocked(pageLocation).mockReturnValue({
    protocol,
    hostname: '192.168.5.67',
    pathname: '/settings/app',
    search: '?q=1',
    hash: '#https',
  } as Location)
}

function answer(response: Response | Error): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  )
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

async function mountControl() {
  const wrapper = mount(HttpsControl)
  await flushPromises()
  return wrapper
}

describe('HttpsControl', () => {
  beforeEach(() => {
    onPage('http:')
    answer(json(AUTHORITY))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('says a plain HTTP page is not encrypted, and what that exposes', async () => {
    const wrapper = await mountControl()
    expect(wrapper.get('.settings-https-label').text()).toBe('NOT ENCRYPTED')
    expect(wrapper.get('.settings-https-state').text()).toContain('a console password included')
  })

  it('says an HTTPS page is encrypted, and offers no link to itself', async () => {
    onPage('https:')
    const wrapper = await mountControl()
    expect(wrapper.get('.settings-https-label').text()).toBe('ENCRYPTED')
    expect(wrapper.text()).not.toContain('OPEN OVER HTTPS')
  })

  it('reads the certificate authority from core', async () => {
    await mountControl()
    expect(fetch).toHaveBeenCalledWith('/api/app/certificate-authority')
  })

  it('shows the fingerprint as two lines of sixteen pairs, broken between pairs', async () => {
    const wrapper = await mountControl()
    expect(wrapper.get('.settings-https-fingerprint').text()).toBe(
      `${PAIRS.slice(0, 16).join(':')}\n${PAIRS.slice(16).join(':')}`,
    )
  })

  it('downloads the certificate from its own link, not a blob', async () => {
    const download = (await mountControl())
      .findAll('a')
      .find((link) => link.text() === 'DOWNLOAD CERTIFICATE')!
    expect(download.attributes('href')).toBe('/api/app/certificate-authority.crt')
    expect(download.attributes('download')).toBe('sentinel-certificate-authority.crt')
  })

  it('links to this same page over HTTPS on the port core reports', async () => {
    const open = (await mountControl())
      .findAll('a')
      .find((link) => link.text() === 'OPEN OVER HTTPS')!
    expect(open.attributes('href')).toBe('https://192.168.5.67:9443/settings/app?q=1#https')
  })

  it('says it is reading until core answers', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => undefined)),
    )
    const wrapper = mount(HttpsControl)
    expect(wrapper.get('.settings-https-note').text()).toBe('Reading…')
    expect(wrapper.text()).not.toContain('DOWNLOAD CERTIFICATE')
  })

  it('says how to make a certificate when there is none yet', async () => {
    answer(json({ detail: { code: 'no_certificate_authority' } }, 404))
    const wrapper = await mountControl()
    expect(wrapper.get('[role="alert"]').text()).toContain('run docker compose up -d')
    expect(wrapper.text()).not.toContain('DOWNLOAD CERTIFICATE')
  })

  it.each([
    ['an error status', json({}, 503)],
    ['an unreachable core', new TypeError('offline')],
  ])('says it could not read the certificate on %s', async (_kind, response) => {
    answer(response)
    const wrapper = await mountControl()
    expect(wrapper.get('[role="alert"]').text()).toBe('Could not read this Sentinel’s certificate.')
  })

  it.each(['http:', 'https:'] as const)(
    'has no accessibility violations (%s)',
    async (protocol) => {
      onPage(protocol)
      const wrapper = await mountControl()
      expect(
        await axe(wrapper.html(), { rules: { region: { enabled: false } } }),
      ).toHaveNoViolations()
    },
  )
})
