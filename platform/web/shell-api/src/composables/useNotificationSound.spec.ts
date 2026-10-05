import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// A minimal fake Web Audio graph that records how it was driven.
function makeFakeAudioContext(state = 'running') {
  const osc = {
    type: '',
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
  }
  return {
    state,
    currentTime: 0,
    destination: {},
    resume: vi.fn(),
    createOscillator: vi.fn(() => osc),
    createGain: vi.fn(() => gain),
  }
}

// A constructable mock (arrow functions can't be used with `new`).
function ctorReturning(ctx: unknown): typeof AudioContext {
  return function MockAudioContext() {
    return ctx
  } as unknown as typeof AudioContext
}

function setAudioCtor(name: 'AudioContext' | 'webkitAudioContext', ctor: unknown) {
  Object.defineProperty(window, name, { configurable: true, value: ctor })
}
function clearAudioCtors() {
  for (const name of ['AudioContext', 'webkitAudioContext'] as const) {
    Object.defineProperty(window, name, { configurable: true, value: undefined })
  }
}

async function loadPlay() {
  return (await import('./useNotificationSound')).playNotificationSound
}

describe('playNotificationSound', () => {
  beforeEach(() => {
    vi.resetModules() // clear the module-level cached AudioContext
    clearAudioCtors()
  })
  afterEach(() => {
    clearAudioCtors()
    vi.restoreAllMocks()
  })

  it('does nothing when no AudioContext implementation exists', async () => {
    const play = await loadPlay()
    expect(() => play()).not.toThrow()
  })

  it('plays two notes when AudioContext is available', async () => {
    const ctx = makeFakeAudioContext()
    setAudioCtor('AudioContext', ctorReturning(ctx))
    const play = await loadPlay()
    play()
    expect(ctx.createOscillator).toHaveBeenCalledTimes(2)
    expect(ctx.createGain).toHaveBeenCalledTimes(2)
  })

  it('reuses the cached AudioContext across calls', async () => {
    const ctx = makeFakeAudioContext()
    let constructed = 0
    const Ctor = function MockAudioContext() {
      constructed++
      return ctx
    } as unknown as typeof AudioContext
    setAudioCtor('AudioContext', Ctor)
    const play = await loadPlay()
    play()
    play()
    expect(constructed).toBe(1) // context built once, reused on the second call
    expect(ctx.createOscillator).toHaveBeenCalledTimes(4)
  })

  it('uses the webkitAudioContext fallback', async () => {
    const ctx = makeFakeAudioContext()
    setAudioCtor('webkitAudioContext', ctorReturning(ctx))
    const play = await loadPlay()
    play()
    expect(ctx.createOscillator).toHaveBeenCalled()
  })

  it('resumes a suspended context', async () => {
    const ctx = makeFakeAudioContext('suspended')
    setAudioCtor('AudioContext', ctorReturning(ctx))
    const play = await loadPlay()
    play()
    expect(ctx.resume).toHaveBeenCalled()
  })

  it('raises pitch for the emphasis (emergency) variant', async () => {
    const ctx = makeFakeAudioContext()
    setAudioCtor('AudioContext', ctorReturning(ctx))
    const play = await loadPlay()
    play(true)
    const firstOsc = ctx.createOscillator.mock.results[0]!.value
    expect(firstOsc.frequency.setValueAtTime).toHaveBeenCalledWith(740, 0)
  })

  it('stays silent when the constructor throws', async () => {
    const throwingCtor = function MockAudioContext() {
      throw new Error('blocked')
    } as unknown as typeof AudioContext
    setAudioCtor('AudioContext', throwingCtor)
    const play = await loadPlay()
    expect(() => play()).not.toThrow()
  })

  it('swallows errors raised while building the audio graph', async () => {
    const ctx = makeFakeAudioContext()
    ctx.createOscillator = vi.fn(() => {
      throw new Error('node failure')
    })
    setAudioCtor('AudioContext', ctorReturning(ctx))
    const play = await loadPlay()
    expect(() => play()).not.toThrow()
  })
})
