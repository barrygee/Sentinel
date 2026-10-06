import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { registerRemotes, loadRemote } = vi.hoisted(() => ({
  registerRemotes: vi.fn(),
  loadRemote: vi.fn(),
}))
vi.mock('@module-federation/runtime', () => ({ registerRemotes, loadRemote }))

import { sectionSources } from './sections.federated'

/** Stubs `fetch('/api/app/sections')` with the given JSON body and status. */
function serveSectionList(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchStub = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
  vi.stubGlobal('fetch', fetchStub)
  return fetchStub
}

function section(id: string): { id: string; remoteEntry: string } {
  return { id, remoteEntry: `/remotes/${id}/remoteEntry.js` }
}

describe('shell/sections.federated', () => {
  beforeEach(() => {
    registerRemotes.mockReset()
    loadRemote.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('reading the section list', () => {
    it('asks the backend which sections this deployment includes', async () => {
      const fetchStub = serveSectionList({ sections: [] })

      await sectionSources()

      expect(fetchStub).toHaveBeenCalledWith('/api/app/sections')
    })

    it('boots with no sections when the request fails', async () => {
      const networkError = new TypeError('Failed to fetch')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

      expect(await sectionSources()).toEqual([])
      expect(registerRemotes).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(
        '[sentinel] could not read the section list:',
        networkError,
      )
    })

    it('boots with no sections when the backend answers with an error status', async () => {
      serveSectionList({ detail: 'down' }, 503)

      expect(await sectionSources()).toEqual([])
      expect(registerRemotes).not.toHaveBeenCalled()
      expect(console.error).toHaveBeenCalledWith(
        '[sentinel] could not read the section list:',
        new Error('HTTP 503'),
      )
    })

    it('boots with no sections when the body is not JSON', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 200 })))

      expect(await sectionSources()).toEqual([])
      expect(registerRemotes).not.toHaveBeenCalled()
    })

    it('treats a body without a sections array as an empty list', async () => {
      serveSectionList({ sections: 'air' })

      expect(await sectionSources()).toEqual([])
      expect(registerRemotes).toHaveBeenCalledWith([])
      expect(console.error).not.toHaveBeenCalled()
    })
  })

  describe('registering the remotes', () => {
    it('registers each listed section as a module remote, in list order', async () => {
      serveSectionList({ sections: [section('air'), section('sea'), section('sdr')] })

      const sources = await sectionSources()

      expect(sources.map((source) => source.id)).toEqual(['air', 'sea', 'sdr'])
      expect(registerRemotes).toHaveBeenCalledWith([
        { name: 'section_air', entry: '/remotes/air/remoteEntry.js', type: 'module' },
        { name: 'section_sea', entry: '/remotes/sea/remoteEntry.js', type: 'module' },
        { name: 'section_sdr', entry: '/remotes/sdr/remoteEntry.js', type: 'module' },
      ])
      expect(console.error).not.toHaveBeenCalled()
    })

    it('accepts section ids with digits and hyphens', async () => {
      serveSectionList({ sections: [section('hf-2')] })

      expect((await sectionSources()).map((source) => source.id)).toEqual(['hf-2'])
    })

    it.each([
      [
        'another origin',
        { id: 'air', remoteEntry: 'https://evil.example/remotes/air/remoteEntry.js' },
      ],
      ['a protocol-relative URL', { id: 'air', remoteEntry: '//evil.example/remoteEntry.js' }],
      ['a path outside /remotes/', { id: 'air', remoteEntry: '/spa-assets/remoteEntry.js' }],
      ["another section's entry", { id: 'air', remoteEntry: '/remotes/sea/remoteEntry.js' }],
      ['a path-traversal id', { id: '../air', remoteEntry: '/remotes/../air/remoteEntry.js' }],
      ['an id with capitals', { id: 'Air', remoteEntry: '/remotes/Air/remoteEntry.js' }],
      ['an id starting with a digit', { id: '1air', remoteEntry: '/remotes/1air/remoteEntry.js' }],
      ['a non-string id', { id: 7, remoteEntry: '/remotes/7/remoteEntry.js' }],
      ['a missing remoteEntry', { id: 'air' }],
      ['null', null],
      ['a string', '/remotes/air/remoteEntry.js'],
    ])('refuses an entry with %s and loads the rest', async (_description, entry) => {
      serveSectionList({ sections: [section('space'), entry] })

      const sources = await sectionSources()

      expect(sources.map((source) => source.id)).toEqual(['space'])
      expect(registerRemotes).toHaveBeenCalledWith([
        { name: 'section_space', entry: '/remotes/space/remoteEntry.js', type: 'module' },
      ])
      expect(console.error).toHaveBeenCalledWith(
        '[sentinel] ignored section list entries that are not same-origin remotes',
      )
    })
  })

  describe('loading a section', () => {
    it("loads the remote's ./register entry", async () => {
      serveSectionList({ sections: [section('land')] })
      const registerModule = { default: vi.fn() }
      loadRemote.mockResolvedValue(registerModule)

      const [land] = await sectionSources()

      expect(loadRemote).not.toHaveBeenCalled()
      await expect(land!.load()).resolves.toBe(registerModule)
      expect(loadRemote).toHaveBeenCalledWith('section_land/register')
    })

    it('fails the load when the remote exposes no ./register', async () => {
      serveSectionList({ sections: [section('land')] })
      loadRemote.mockResolvedValue(null)

      const [land] = await sectionSources()

      await expect(land!.load()).rejects.toThrow('remote "land" exposed no ./register')
    })

    it("passes on the federation runtime's error when the remote is down", async () => {
      serveSectionList({ sections: [section('sea')] })
      const runtimeError = new Error('Failed to fetch remoteEntry.js')
      loadRemote.mockRejectedValue(runtimeError)

      const [sea] = await sectionSources()

      await expect(sea!.load()).rejects.toBe(runtimeError)
    })
  })
})
