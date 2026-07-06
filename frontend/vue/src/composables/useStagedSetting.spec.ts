import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useStagedSetting, type UseStagedSetting } from './useStagedSetting'
import * as settingsApi from '@/services/settingsApi'

// Mount the composable inside a minimal host component, matching the pattern
// used by other composable specs in this project (e.g. useConnectivity.spec.ts).
function mountStagedSetting<SettingValue>(
  options: Parameters<typeof useStagedSetting<SettingValue>>[0],
): { result: UseStagedSetting<SettingValue>; unmount: () => void } {
  let result!: UseStagedSetting<SettingValue>
  const Harness = defineComponent({
    setup() {
      result = useStagedSetting(options)
      return () => h('div')
    },
  })
  const wrapper = mount(Harness)
  return { result, unmount: () => wrapper.unmount() }
}

describe('useStagedSetting', () => {
  beforeEach(() => {
    vi.spyOn(settingsApi, 'put').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('boolean instantiation (toggle controls)', () => {
    function makeBooleanOptions() {
      let storeValue = false
      const hydrateFromDb = vi.fn().mockImplementation(async () => {
        storeValue = true // simulates the DB holding a different value than the initial store state
      })
      const readFromStore = vi.fn(() => storeValue)
      const mirrorToStore = vi.fn((newValue: boolean) => {
        storeValue = newValue
      })
      const stageWrite = vi.fn()
      return {
        options: {
          namespace: 'sdr',
          key: 'autoCenterWaterfallOnTune',
          hydrateFromDb,
          readFromStore,
          mirrorToStore,
          stageWrite,
        },
        hydrateFromDb,
        readFromStore,
        mirrorToStore,
        stageWrite,
      }
    }

    it('initializes the local value from the store synchronously', () => {
      const { options, hydrateFromDb } = makeBooleanOptions()
      const { result, unmount } = mountStagedSetting<boolean>(options)
      // Initial ref value comes from readFromStore() called synchronously at
      // setup time, before the async hydrate resolves.
      expect(result.value.value).toBe(false)
      expect(hydrateFromDb).toHaveBeenCalledTimes(1) // fired by onMounted
      unmount()
    })

    it('re-syncs from the DB after mount resolves', async () => {
      const { options } = makeBooleanOptions()
      const { result, unmount } = mountStagedSetting<boolean>(options)
      await flushPromises()
      expect(result.value.value).toBe(true)
      unmount()
    })

    it('re-syncs from the DB when sentinel:config-uploaded fires', async () => {
      const { options, hydrateFromDb } = makeBooleanOptions()
      const { unmount } = mountStagedSetting<boolean>(options)
      await flushPromises()
      hydrateFromDb.mockClear()
      document.dispatchEvent(new Event('sentinel:config-uploaded'))
      await flushPromises()
      expect(hydrateFromDb).toHaveBeenCalledTimes(1)
      unmount()
    })

    it('does not re-sync after unmount', async () => {
      const { options, hydrateFromDb } = makeBooleanOptions()
      const { unmount } = mountStagedSetting<boolean>(options)
      await flushPromises()
      unmount()
      hydrateFromDb.mockClear()
      document.dispatchEvent(new Event('sentinel:config-uploaded'))
      await flushPromises()
      expect(hydrateFromDb).not.toHaveBeenCalled()
    })

    it('mirrors the change into the store immediately and stages the write on applyChange', async () => {
      const { options, mirrorToStore, stageWrite } = makeBooleanOptions()
      const { result, unmount } = mountStagedSetting<boolean>(options)
      await flushPromises() // let the initial hydrate settle first

      result.applyChange(false)

      expect(result.value.value).toBe(false)
      expect(mirrorToStore).toHaveBeenCalledWith(false)
      // The DB write must NOT have happened yet — only staged.
      expect(settingsApi.put).not.toHaveBeenCalled()
      expect(stageWrite).toHaveBeenCalledTimes(1)
      unmount()
    })

    it('invokes settingsApi.put with the right namespace/key/value only when the staged writer runs', async () => {
      const { options, stageWrite } = makeBooleanOptions()
      const { result, unmount } = mountStagedSetting<boolean>(options)
      await flushPromises()

      result.applyChange(true)
      expect(settingsApi.put).not.toHaveBeenCalled()

      const stagedWriter = stageWrite.mock.calls[0]?.[0] as () => Promise<unknown>
      await stagedWriter()
      expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'autoCenterWaterfallOnTune', true)
      unmount()
    })

    it('defers the store mirror until the staged writer runs when deferMirror is set', async () => {
      const { options, mirrorToStore, stageWrite } = makeBooleanOptions()
      const { result, unmount } = mountStagedSetting<boolean>({ ...options, deferMirror: true })
      await flushPromises()

      result.applyChange(false)

      // Local value flips immediately (the switch position), but the store
      // mirror must NOT have run yet.
      expect(result.value.value).toBe(false)
      expect(mirrorToStore).not.toHaveBeenCalled()
      expect(settingsApi.put).not.toHaveBeenCalled()
      expect(stageWrite).toHaveBeenCalledTimes(1)

      const stagedWriter = stageWrite.mock.calls[0]?.[0] as () => Promise<unknown>
      await stagedWriter()
      expect(mirrorToStore).toHaveBeenCalledWith(false)
      expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'autoCenterWaterfallOnTune', false)
      unmount()
    })
  })

  describe('number instantiation (validated numeric inputs)', () => {
    function makeNumberOptions() {
      let storeValue = 5
      const hydrateFromDb = vi.fn().mockImplementation(async () => {
        storeValue = 12
      })
      const readFromStore = vi.fn(() => storeValue)
      const mirrorToStore = vi.fn((newValue: number) => {
        storeValue = newValue
      })
      const stageWrite = vi.fn()
      return {
        options: {
          namespace: 'sdr',
          key: 'resumeDelaySec',
          hydrateFromDb,
          readFromStore,
          mirrorToStore,
          stageWrite,
        },
        stageWrite,
      }
    }

    it('initializes from the store, re-syncs from the DB, and stages a numeric write', async () => {
      const { options, stageWrite } = makeNumberOptions()
      const { result, unmount } = mountStagedSetting<number>(options)
      expect(result.value.value).toBe(5)

      await flushPromises()
      expect(result.value.value).toBe(12)

      result.applyChange(20)
      expect(result.value.value).toBe(20)
      expect(settingsApi.put).not.toHaveBeenCalled()

      const stagedWriter = stageWrite.mock.calls[0]?.[0] as () => Promise<unknown>
      await stagedWriter()
      expect(settingsApi.put).toHaveBeenCalledWith('sdr', 'resumeDelaySec', 20)
      unmount()
    })
  })

  it('exposes syncFromDb for manual re-sync', async () => {
    let storeValue = false
    const hydrateFromDb = vi.fn().mockImplementation(async () => {
      storeValue = !storeValue
    })
    const readFromStore = vi.fn(() => storeValue)
    const { result, unmount } = mountStagedSetting<boolean>({
      namespace: 'sdr',
      key: 'showBandPlan',
      hydrateFromDb,
      readFromStore,
      mirrorToStore: vi.fn(),
      stageWrite: vi.fn(),
    })
    await flushPromises()
    expect(result.value.value).toBe(true)

    await result.syncFromDb()
    expect(result.value.value).toBe(false)
    unmount()
  })
})
