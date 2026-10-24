import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SdrManagerApiError, jsonInit, requestJson } from './sdrManagerRequest'

function mockFetch(response: Partial<Response> | (() => Promise<Response>)): void {
  global.fetch = vi.fn(
    typeof response === 'function' ? response : () => Promise.resolve(response as Response),
  ) as unknown as typeof fetch
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('SdrManagerApiError', () => {
  it('carries status, code, message and an empty context by default', () => {
    const error = new SdrManagerApiError(409, 'port_conflict', 'Port in use.')
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('SdrManagerApiError')
    expect(error.status).toBe(409)
    expect(error.code).toBe('port_conflict')
    expect(error.message).toBe('Port in use.')
    expect(error.context).toEqual({})
  })

  it('keeps the context it is given', () => {
    const error = new SdrManagerApiError(409, 'port_conflict', 'x', { conflicting_device_id: 'a' })
    expect(error.context).toEqual({ conflicting_device_id: 'a' })
  })
})

describe('requestJson success', () => {
  it('parses and returns the JSON body, passing the url and init to fetch', async () => {
    mockFetch({ ok: true, status: 200, json: () => Promise.resolve({ value: 1 }) })
    const init = { method: 'GET' }
    await expect(requestJson('/api/x', init)).resolves.toEqual({ value: 1 })
    expect(global.fetch).toHaveBeenCalledWith('/api/x', init)
  })

  it('resolves to undefined on a 204 without reading a body', async () => {
    const json = vi.fn()
    mockFetch({ ok: true, status: 204, json })
    await expect(requestJson('/api/x')).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })
})

describe('requestJson failure envelopes', () => {
  function failWith(status: number, body: unknown): void {
    mockFetch({ ok: false, status, json: () => Promise.resolve(body) })
  }

  it('throws a network_error with status 0 when fetch rejects', async () => {
    mockFetch(() => Promise.reject(new TypeError('offline')))
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      name: 'SdrManagerApiError',
      status: 0,
      code: 'network_error',
      message: 'Could not reach Sentinel.',
    })
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('bad')) })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      status: 502,
      code: 'unknown_error',
      message: 'Request failed (HTTP 502).',
    })
  })

  it('falls back when the body is null', async () => {
    failWith(500, null)
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      code: 'unknown_error',
      message: 'Request failed (HTTP 500).',
    })
  })

  it('falls back when the body has no detail key', async () => {
    failWith(500, { oops: true })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      code: 'unknown_error',
      message: 'Request failed (HTTP 500).',
    })
  })

  it('parses a {code, message} envelope and keeps the extra keys as context', async () => {
    failWith(409, {
      detail: { code: 'port_conflict', message: 'Port 1234 in use.', conflicting_device_id: 'u' },
    })
    const error = (await requestJson('/api/x').catch(
      (caught: unknown) => caught,
    )) as SdrManagerApiError
    expect(error).toBeInstanceOf(SdrManagerApiError)
    expect(error.status).toBe(409)
    expect(error.code).toBe('port_conflict')
    expect(error.message).toBe('Port 1234 in use.')
    expect(error.context).toEqual({ conflicting_device_id: 'u' })
  })

  it('defaults code and message when the envelope omits them or types them wrongly', async () => {
    failWith(400, { detail: { code: 7, message: null, extra: 'x' } })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      code: 'unknown_error',
      message: 'Request failed (HTTP 400).',
      context: { extra: 'x' },
    })
  })

  it('joins FastAPI 422 entries, dropping the body/query/path prefix of each location', async () => {
    failWith(422, {
      detail: [
        { loc: ['body', 'address'], msg: ' field required ' },
        { loc: ['query', 'port'], msg: 'must be an integer' },
        { loc: ['path', 'host', 'id'], msg: 'bad' },
      ],
    })
    const error = (await requestJson('/api/x').catch(
      (caught: unknown) => caught,
    )) as SdrManagerApiError
    expect(error.code).toBe('validation_error')
    expect(error.message).toBe('address: field required; port: must be an integer; host.id: bad')
    expect(error.context.errors).toHaveLength(3)
  })

  it('describes a 422 entry without a location (or with a non-array one) by its message alone', async () => {
    failWith(422, { detail: [{ msg: 'general' }, { loc: 'body', msg: 'other' }] })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      code: 'validation_error',
      message: 'general; other',
    })
  })

  it('describes a 422 entry whose location is only a prefix by its message alone', async () => {
    failWith(422, { detail: [{ loc: ['body'], msg: 'whole body wrong' }] })
    await expect(requestJson('/api/x')).rejects.toMatchObject({ message: 'whole body wrong' })
  })

  it('falls back to the generic message when no 422 entry has a usable message', async () => {
    failWith(422, { detail: [{ msg: '   ' }, { loc: ['body'] }, { msg: 5 }] })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      code: 'validation_error',
      message: 'Request failed (HTTP 422).',
    })
  })

  it('uses a bare string detail as the message', async () => {
    failWith(403, { detail: 'Not authorized.' })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      status: 403,
      code: 'unknown_error',
      message: 'Not authorized.',
    })
  })

  it('falls back when detail is a shape no parser handles', async () => {
    failWith(500, { detail: 42 })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      code: 'unknown_error',
      message: 'Request failed (HTTP 500).',
    })
  })

  it('falls back when detail is null', async () => {
    failWith(500, { detail: null })
    await expect(requestJson('/api/x')).rejects.toMatchObject({
      message: 'Request failed (HTTP 500).',
    })
  })
})

describe('jsonInit', () => {
  it('serialises the body and sets the JSON content type', () => {
    expect(jsonInit('PUT', { name: 'x' })).toEqual({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"x"}',
    })
  })

  it('sends no body at all when none is given', () => {
    expect(jsonInit('POST').body).toBeUndefined()
  })

  it('still serialises falsy bodies such as null', () => {
    expect(jsonInit('POST', null).body).toBe('null')
  })
})
