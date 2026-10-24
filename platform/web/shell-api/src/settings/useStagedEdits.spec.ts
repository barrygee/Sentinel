import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { useSettingsStore } from '../stores/settings'
import { StagedEditsError, useStagedEdits, type StagedEdits } from './useStagedEdits'

type Edits = StagedEdits<number, string>

function setup(save: (key: number, draft: string) => Promise<void> = async () => {}) {
  const stage = vi.fn()
  let edits!: Edits
  const wrapper = mount(
    defineComponent({
      setup() {
        edits = useStagedEdits<number, string>({ save, stage })
        return () => h('div')
      },
    }),
  )
  return { edits, stage, wrapper, save }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('useStagedEdits', () => {
  it('stores a draft and hands APPLY CHANGES the applyAll closure', () => {
    const { edits, stage } = setup()
    edits.set(1, 'one')
    expect(edits.drafts.get(1)).toBe('one')
    expect(stage).toHaveBeenCalledTimes(1)
    expect(stage).toHaveBeenCalledWith(edits.applyAll)
  })

  it('replaces an earlier draft of the same record', () => {
    const { edits } = setup()
    edits.set(1, 'first')
    edits.set(1, 'second')
    expect(edits.drafts.size).toBe(1)
    expect(edits.drafts.get(1)).toBe('second')
  })

  it('discards a single record without touching the others', () => {
    const { edits } = setup()
    edits.set(1, 'one')
    edits.set(2, 'two')
    edits.discard(1)
    expect([...edits.drafts.keys()]).toEqual([2])
  })

  it('saves every draft in order, one after another, and clears them', async () => {
    const log: string[] = []
    const { edits } = setup(async (key) => {
      log.push(`start ${key}`)
      await Promise.resolve()
      log.push(`end ${key}`)
    })
    edits.set(1, 'one')
    edits.set(2, 'two')
    await edits.applyAll()
    expect(log).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
    expect(edits.drafts.size).toBe(0)
  })

  it('passes the key and draft to save', async () => {
    const { edits, save } = setup(vi.fn(async () => {}))
    edits.set(7, 'seven')
    await edits.applyAll()
    expect(save).toHaveBeenCalledWith(7, 'seven')
  })

  it('does nothing and resolves when there are no drafts', async () => {
    const { edits, save } = setup(vi.fn(async () => {}))
    await expect(edits.applyAll()).resolves.toBeUndefined()
    expect(save).not.toHaveBeenCalled()
  })

  it('keeps going past a failure, keeps only the failed drafts, and throws StagedEditsError', async () => {
    const { edits } = setup(async (key) => {
      if (key === 2) throw new Error('refused')
    })
    edits.set(1, 'one')
    edits.set(2, 'two')
    edits.set(3, 'three')
    const error = (await edits
      .applyAll()
      .catch((caught: unknown) => caught)) as StagedEditsError<number>
    expect(error).toBeInstanceOf(StagedEditsError)
    expect(error.name).toBe('StagedEditsError')
    expect(error.failedKeys).toEqual([2])
    expect(error.message).toBe('1 staged edit(s) failed to save')
    expect([...edits.drafts.keys()]).toEqual([2])
  })

  it('clears every draft when the Settings panel opens again', async () => {
    const { edits } = setup()
    const settings = useSettingsStore()
    edits.set(1, 'one')
    settings.open = true
    await nextTick()
    expect(edits.drafts.size).toBe(0)
  })

  it('keeps drafts when the panel closes', async () => {
    const { edits } = setup()
    const settings = useSettingsStore()
    settings.open = true
    await nextTick()
    edits.set(1, 'one')
    settings.open = false
    await nextTick()
    expect(edits.drafts.size).toBe(1)
  })

  it('clears every draft on unmount', () => {
    const { edits, wrapper } = setup()
    edits.set(1, 'one')
    wrapper.unmount()
    expect(edits.drafts.size).toBe(0)
  })
})
