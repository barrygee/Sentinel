import { expect, type MockInstance } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { put } from '@sentinel/shell-api/services/settingsApi'

/**
 * Proves that a setting's staged work hands its backend save back to APPLY.
 *
 * Settings' APPLY runs every staged callback, waits for whatever they return,
 * and then re-reads every setting from the backend. A callback that starts its
 * save but returns nothing lets that re-read overtake the save, and the old
 * value is put back into the app.
 *
 * Every save the mocked `put` is asked for is held open. The staged work must
 * return a promise, and that promise must stay unsettled until every held save
 * has been let go. Asserts with vitest's `expect`, so the calling spec fails on
 * either count.
 *
 * @param mockedPut the spec's `vi.mocked(settingsApi.put)`; its implementation
 *   is replaced, so the spec's `beforeEach` should reset it.
 * @param runStagedWork runs the callback the control emitted with `stage`.
 * @returns the arguments of every save the staged work asked for, so the spec
 *   can check what was written.
 */
export async function expectStagedWorkAwaitsSave(
  mockedPut: MockInstance<typeof put>,
  runStagedWork: () => unknown,
): Promise<Parameters<typeof put>[]> {
  const releaseHeldSaves: Array<() => void> = []
  const requestedSaves: Parameters<typeof put>[] = []
  mockedPut.mockImplementation((...saveArguments) => {
    requestedSaves.push(saveArguments)
    return new Promise<void>((resolve) => releaseHeldSaves.push(resolve))
  })

  const stagedResult = runStagedWork()
  expect(stagedResult, 'the staged work must return its save').toBeInstanceOf(Promise)
  let settled = false
  const watched = (stagedResult as Promise<unknown>).then(() => {
    settled = true
  })
  await flushPromises()
  expect(requestedSaves.length, 'the staged work must save something').toBeGreaterThan(0)
  expect(settled, 'the staged work must not finish before its save').toBe(false)

  // Let the saves go one at a time, in the order they were asked for: work that
  // waits for its first save but not the rest finishes early, and fails here.
  for (const [index, release] of releaseHeldSaves.entries()) {
    release()
    await flushPromises()
    const isLastSave = index === releaseHeldSaves.length - 1
    if (!isLastSave) {
      expect(settled, `the staged work must also wait for save ${index + 2}`).toBe(false)
    }
  }
  await watched
  expect(settled).toBe(true)
  return requestedSaves
}
