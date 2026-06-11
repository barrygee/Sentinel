import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { nextTick } from 'vue'
import { axe } from 'jest-axe'

import AirReplayPanel from './AirReplayPanel.vue'
import { usePlaybackStore } from '@/stores/playback'

// Capture ResizeObserver / MutationObserver instances so their callbacks can be
// driven deterministically.
const shared = vi.hoisted(() => ({
  resize: null as null | {
    cb: () => void
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  },
  mutation: null as null | {
    cb: () => void
    observe: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  },
}))

// A recording 2D context fake (jsdom returns null from getContext).
function makeCtx() {
  return {
    scale: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 12 })),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
  }
}
let fakeCtx: ReturnType<typeof makeCtx>

// Available recorded windows for June/July 2026 (today is 2026-06-10).
function availableDates() {
  return [
    {
      date: '2026-06-10',
      start_ms: Date.UTC(2026, 5, 10, 8, 30),
      end_ms: Date.UTC(2026, 5, 10, 17, 45),
    },
    {
      date: '2026-06-15',
      start_ms: Date.UTC(2026, 5, 15, 0, 0),
      end_ms: Date.UTC(2026, 5, 15, 23, 59),
    },
    {
      date: '2026-07-05',
      start_ms: Date.UTC(2026, 6, 5, 9, 0),
      end_ms: Date.UTC(2026, 6, 5, 12, 0),
    },
  ]
}

function okFetch(body: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => body })
}

function mountPanel(attachTo?: HTMLElement) {
  return mount(AirReplayPanel, attachTo ? { attachTo } : {})
}

// ---- DOM helpers ----------------------------------------------------------
function ddItems(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll('.apb-dd-item'))
}

function clickEl(el: Element): void {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

enableAutoUnmount(afterEach)

describe('AirReplayPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.body.innerHTML = ''
    fakeCtx = makeCtx()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => fakeCtx) as never
    vi.stubGlobal('fetch', okFetch(availableDates()))
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn()
        disconnect = vi.fn()
        constructor(cb: () => void) {
          shared.resize = { cb, observe: this.observe, disconnect: this.disconnect }
        }
      },
    )
    vi.stubGlobal(
      'MutationObserver',
      class {
        observe = vi.fn()
        disconnect = vi.fn()
        constructor(cb: () => void) {
          shared.mutation = { cb, observe: this.observe, disconnect: this.disconnect }
        }
      },
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  // Open the start calendar and pick a day in the current (June) month.
  async function pickStartDay(wrapper: ReturnType<typeof mountPanel>, day: number) {
    await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
    const cell = wrapper
      .findAll('.apb-cal-cell')
      .find(
        (node) =>
          node.text().trim() === String(day) && !node.classes().includes('apb-cal-cell--other'),
      )!
    await cell.trigger('click')
  }

  describe('available dates', () => {
    it('fetches recorded dates on mount and enables their calendar cells', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      expect(fetch).toHaveBeenCalledWith('/api/air/recordings/available-dates')
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      const enabled = wrapper
        .findAll('.apb-cal-cell')
        .filter(
          (node) =>
            !node.classes().includes('apb-cal-cell--disabled') &&
            !node.classes().includes('apb-cal-cell--other'),
        )
      // June 10 and June 15 are the available in-month days.
      expect(enabled.length).toBe(2)
    })

    it('stays silent when the fetch is not ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      const wrapper = mountPanel()
      await flushPromises()
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      const enabled = wrapper
        .findAll('.apb-cal-cell')
        .filter((node) => !node.classes().includes('apb-cal-cell--disabled'))
      expect(enabled.length).toBe(0)
    })

    it('swallows a rejected fetch', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
      const wrapper = mountPanel()
      await expect(flushPromises()).resolves.not.toThrow()
      expect(wrapper.find('#air-playback-panel').exists()).toBe(true)
    })
  })

  describe('date + time selection', () => {
    it('prefills the start and end times from the recorded extent', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 10)
      await nextTick()
      // start 08:30, end 17:45 from the June 10 extent.
      const selects = wrapper.findAll('.apb-time-select')
      expect(selects[0]!.text()).toContain('08')
      expect(selects[1]!.text()).toContain('30')
      expect(selects[2]!.text()).toContain('17')
      expect(selects[3]!.text()).toContain('45')
    })

    it('opens the hour dropdown and selects an available hour', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 10)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // open startHH
      const items = ddItems()
      expect(items.length).toBe(24)
      clickEl(items[9]!) // hour 09 (available)
      await nextTick()
      expect(wrapper.findAll('.apb-time-select')[0]!.text()).toContain('09')
    })

    it('selects start minute, end hour and end minute via their dropdowns', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 15) // full-day extent → all times available
      await nextTick()

      await wrapper.findAll('.apb-time-select')[1]!.trigger('click') // startMM
      clickEl(ddItems()[15]!)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[2]!.trigger('click') // endHH
      clickEl(ddItems()[20]!)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[3]!.trigger('click') // endMM
      clickEl(ddItems()[30]!)
      await nextTick()

      const selects = wrapper.findAll('.apb-time-select')
      expect(selects[1]!.text()).toContain('15')
      expect(selects[2]!.text()).toContain('20')
      expect(selects[3]!.text()).toContain('30')
    })

    it('toggles a dropdown closed when its button is clicked again', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 15)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // open
      expect(ddItems().length).toBe(24)
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // close
      await nextTick()
      expect(ddItems().length).toBe(0)
    })

    it('disables every hour before a date is chosen', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // open startHH, no date
      const items = ddItems()
      expect(items.length).toBe(24)
      expect(items.every((item) => item.disabled)).toBe(true)
    })

    it('disables times when the selected date is no longer recorded', async () => {
      const pane = document.createElement('div')
      pane.id = 'msb-pane-playback'
      pane.classList.add('msb-pane-active')
      document.body.appendChild(pane)
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 10) // startHH prefilled to 8
      await nextTick()
      // The recordings disappear; an observer refresh reloads an empty list.
      ;(fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => [] })
      shared.mutation!.cb()
      await flushPromises()
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // startHH
      expect(ddItems().every((item) => item.disabled)).toBe(true)
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // close
      await wrapper.findAll('.apb-time-select')[1]!.trigger('click') // startMM
      expect(ddItems().every((item) => item.disabled)).toBe(true)
    })

    it('renders same-day end-time gating relative to the start time', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 15) // full-day extent
      await nextTick()
      // start 10:30
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click')
      clickEl(ddItems()[10]!)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[1]!.trigger('click')
      clickEl(ddItems()[30]!)
      await nextTick()
      // end hour 10 (same as start hour)
      await wrapper.findAll('.apb-time-select')[2]!.trigger('click')
      clickEl(ddItems()[10]!)
      await nextTick()
      // Open end minutes: minutes <= 30 are disabled (same hour as start).
      await wrapper.findAll('.apb-time-select')[3]!.trigger('click')
      const minuteItems = ddItems()
      expect(minuteItems[20]!.disabled).toBe(true) // 20 <= 30 → disabled
      expect(minuteItems[45]!.disabled).toBe(false) // 45 > 30 → allowed
    })

    it('closes an open dropdown on an outside document click', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 15)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click')
      expect(ddItems().length).toBe(24)
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(ddItems().length).toBe(0)
    })

    it('keeps the dropdown open on a click inside its wrap', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 15)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click')
      expect(ddItems().length).toBe(24)
      // A bubbling click whose target is inside the wrap must not close it.
      wrapper.find('.apb-dd-wrap').element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(ddItems().length).toBe(24)
    })
  })

  describe('calendars', () => {
    it('navigates months on the start calendar', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      const label = () => wrapper.find('.apb-cal-month-label').text()
      expect(label()).toContain('June 2026')
      await wrapper.findAll('.apb-cal-nav')[1]!.trigger('click') // next
      expect(label()).toContain('July 2026')
      await wrapper.findAll('.apb-cal-nav')[0]!.trigger('click') // prev
      expect(label()).toContain('June 2026')
    })

    it('selecting an other-month available cell jumps the view to that month', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      // July 5 shows as a trailing "other" cell and is available.
      const otherCell = wrapper
        .findAll('.apb-cal-cell')
        .find(
          (node) =>
            node.classes().includes('apb-cal-cell--other') &&
            !node.classes().includes('apb-cal-cell--disabled'),
        )!
      await otherCell.trigger('click')
      await nextTick()
      // Re-open and confirm the view moved to July.
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      expect(wrapper.find('.apb-cal-month-label').text()).toContain('July 2026')
    })

    it('ignores clicks on disabled calendar cells', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      const disabled = wrapper
        .findAll('.apb-cal-cell')
        .find((node) => node.classes().includes('apb-cal-cell--disabled'))!
      await disabled.trigger('click')
      // No date chosen → the button keeps its placeholder.
      expect(wrapper.findAll('.apb-date-btn')[0]!.text()).toContain('DD / MM / YYYY')
    })

    it('navigates and selects on the end calendar', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 10)
      await nextTick()
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click') // open end cal
      await wrapper.findAll('.apb-cal-nav')[1]!.trigger('click') // next month
      await wrapper.findAll('.apb-cal-nav')[0]!.trigger('click') // prev month
      const endCell = wrapper
        .findAll('.apb-cal-cell')
        .find(
          (node) => node.text().trim() === '15' && !node.classes().includes('apb-cal-cell--other'),
        )!
      await endCell.trigger('click')
      await nextTick()
      expect(wrapper.findAll('.apb-date-btn')[1]!.text()).not.toContain('DD / MM / YYYY')
    })

    it('selecting an other-month cell on the end calendar jumps that view', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 10)
      await nextTick()
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click')
      const otherCell = wrapper
        .findAll('.apb-cal-cell')
        .find(
          (node) =>
            node.classes().includes('apb-cal-cell--other') &&
            !node.classes().includes('apb-cal-cell--disabled'),
        )!
      await otherCell.trigger('click')
      await nextTick()
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click')
      expect(wrapper.find('.apb-cal-month-label').text()).toContain('July 2026')
    })

    it('builds end-calendar cells with no minimum date before a start is chosen', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      // Open the end calendar with no start date selected (minIso undefined).
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click')
      expect(wrapper.find('.apb-cal-popup').exists()).toBe(true)
    })

    it('stops mousedown from bubbling out of the calendar and dropdown popups', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      // Start calendar popup: open, mousedown on the popup, pick a day (cal open).
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      await wrapper.find('.apb-cal-popup').trigger('mousedown')
      const day15 = wrapper
        .findAll('.apb-cal-cell')
        .find(
          (node) => node.text().trim() === '15' && !node.classes().includes('apb-cal-cell--other'),
        )!
      await day15.trigger('click')
      await nextTick()
      // End calendar popup.
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click')
      await wrapper.find('.apb-cal-popup').trigger('mousedown')
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click') // close
      // Each of the four time dropdown lists.
      for (let index = 0; index < 4; index++) {
        await wrapper.findAll('.apb-time-select')[index]!.trigger('click')
        const list = document.querySelector('.apb-dd-list')!
        list.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
        await wrapper.findAll('.apb-time-select')[index]!.trigger('click') // close
      }
      expect(wrapper.find('#air-playback-panel').exists()).toBe(true)
    })

    it('closes both calendars on an outside document click', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      expect(wrapper.find('.apb-cal-popup').exists()).toBe(true)
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(wrapper.find('.apb-cal-popup').exists()).toBe(false)
    })

    it('keeps a calendar open on a click inside its wrap', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      // Start calendar: a click inside the popup must not close it.
      await wrapper.findAll('.apb-date-btn')[0]!.trigger('click')
      wrapper
        .find('.apb-cal-popup')
        .element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(wrapper.find('.apb-cal-popup').exists()).toBe(true)
      // Pick June 10 from the already-open start calendar, then test the end one.
      const day10 = wrapper
        .findAll('.apb-cal-cell')
        .find(
          (node) => node.text().trim() === '10' && !node.classes().includes('apb-cal-cell--other'),
        )!
      await day10.trigger('click')
      await nextTick()
      await wrapper.findAll('.apb-date-btn')[1]!.trigger('click')
      wrapper
        .find('.apb-cal-popup')
        .element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await nextTick()
      expect(wrapper.find('.apb-cal-popup').exists()).toBe(true)
    })

    it('advances the start date forward past the end date, pulling end with it', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      // Choose June 10 then re-open and choose June 15 → end follows.
      await pickStartDay(wrapper, 10)
      await nextTick()
      await pickStartDay(wrapper, 15)
      await nextTick()
      expect(wrapper.findAll('.apb-date-btn')[1]!.text()).not.toContain('DD / MM / YYYY')
    })
  })

  describe('load + validation', () => {
    it('loads playback when a valid window is selected', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 10) // start 08:30 / end 17:45 prefilled
      await nextTick()
      await wrapper.find('.apb-transport-btn--play').trigger('click')
      expect(playback.status).toBe('loading')
      expect(playback.pendingStartMs).toBe(Date.UTC(2026, 5, 10, 8, 30))
      expect(playback.pendingEndMs).toBe(Date.UTC(2026, 5, 10, 17, 45))
      expect(wrapper.find('.apb-spin').exists()).toBe(true)
    })

    it('does not load when no window is selected (play disabled / no-op)', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      // Button is disabled with nothing chosen; the handler also guards.
      await wrapper.find('.apb-transport-btn--play').trigger('click')
      expect(playback.status).toBe('idle')
    })

    it('shows an error and blocks load when end is not after start', async () => {
      const wrapper = mountPanel()
      await flushPromises()
      await pickStartDay(wrapper, 15) // full-day extent
      await nextTick()
      // Push the start time up to the end time (23:59) so end <= start.
      await wrapper.findAll('.apb-time-select')[0]!.trigger('click') // startHH
      clickEl(ddItems()[23]!)
      await nextTick()
      await wrapper.findAll('.apb-time-select')[1]!.trigger('click') // startMM
      clickEl(ddItems()[59]!)
      await nextTick()
      expect(wrapper.find('.apb-time-error').text()).toContain('END must be after START')
    })

    it('resets the loading flag and refetches when playback goes idle', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      ;(fetch as ReturnType<typeof vi.fn>).mockClear()
      playback.status = 'loading'
      await nextTick()
      playback.status = 'idle'
      await flushPromises()
      expect(fetch).toHaveBeenCalled()
      expect(wrapper.find('.apb-spin').exists()).toBe(false)
    })
  })

  describe('timeline canvas', () => {
    function sizeTimeline(wrapper: ReturnType<typeof mountPanel>, width = 800) {
      const wrap = wrapper.find('.apb-timeline-wrap').element as HTMLElement
      const canvas = wrapper.find('.apb-timeline-canvas').element as HTMLElement
      Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: width })
      Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: 60 })
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: width })
      Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: 60 })
    }

    async function activate(
      wrapper: ReturnType<typeof mountPanel>,
      playback: ReturnType<typeof usePlaybackStore>,
      width = 800,
    ) {
      sizeTimeline(wrapper, width)
      playback.windowStartMs = 1
      playback.windowEndMs = 3_600_001 // ~1h
      playback.cursorMs = 1_800_000 // ~30m
      await nextTick()
      await nextTick()
    }

    it('draws ticks, the cursor and the time labels when active', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      expect(fakeCtx.fillText).toHaveBeenCalled()
      expect(fakeCtx.arc).toHaveBeenCalled() // cursor dot
      expect(fakeCtx.stroke.mock.calls.length).toBeGreaterThan(2) // many ticks
    })

    it('honours a high device pixel ratio when drawing', async () => {
      const original = window.devicePixelRatio
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
      try {
        const playback = usePlaybackStore()
        const wrapper = mountPanel()
        await flushPromises()
        await activate(wrapper, playback)
        expect(fakeCtx.scale).toHaveBeenCalledWith(2, 2)
      } finally {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original })
      }
    })

    it('bails out of drawing when the wrap has no size', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback, 0) // zero width → early return
      expect(fakeCtx.fillText).not.toHaveBeenCalled()
    })

    it('bails out of drawing when the window span is not positive', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      sizeTimeline(wrapper)
      playback.windowStartMs = 1000
      playback.windowEndMs = 1000 // span 0
      playback.cursorMs = 1000
      await nextTick()
      await nextTick()
      expect(fakeCtx.arc).not.toHaveBeenCalled()
    })

    it('scrubs the cursor on mousedown and drag, then resumes on mouseup', async () => {
      const playback = usePlaybackStore()
      const seekSpy = vi.spyOn(playback, 'seek')
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      playback.play()
      await nextTick()
      const canvas = wrapper.find('.apb-timeline-canvas')

      await canvas.trigger('mousedown', { clientX: 200 })
      expect(playback.status).toBe('paused') // playing → paused while dragging
      expect(seekSpy).toHaveBeenCalled()

      await canvas.trigger('mousemove', { clientX: 400 }) // drag → seek
      window.dispatchEvent(new MouseEvent('mouseup'))
      expect(playback.status).toBe('playing') // resumes
    })

    it('scrubs without pausing/resuming when playback was already paused', async () => {
      const playback = usePlaybackStore()
      const pauseSpy = vi.spyOn(playback, 'pause')
      const playSpy = vi.spyOn(playback, 'play')
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback) // status 'ready' (not playing)
      const canvas = wrapper.find('.apb-timeline-canvas')
      await canvas.trigger('mousedown', { clientX: 200 }) // _wasPlaying false → no pause
      window.dispatchEvent(new MouseEvent('mouseup')) // dragging, but no resume
      expect(pauseSpy).not.toHaveBeenCalled()
      expect(playSpy).not.toHaveBeenCalled()
    })

    it('honours a zero device pixel ratio fallback', async () => {
      const original = window.devicePixelRatio
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 0 })
      try {
        const playback = usePlaybackStore()
        const wrapper = mountPanel()
        await flushPromises()
        await activate(wrapper, playback)
        expect(fakeCtx.scale).toHaveBeenCalledWith(1, 1) // 0 || 1 → 1
      } finally {
        Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: original })
      }
    })

    it('shows a hover ghost on mousemove without dragging and clears it on leave', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      const canvas = wrapper.find('.apb-timeline-canvas')
      fakeCtx.setLineDash.mockClear()
      await canvas.trigger('mousemove', { clientX: 300 }) // hover → dashed ghost
      expect(fakeCtx.setLineDash).toHaveBeenCalled()
      await canvas.trigger('mouseleave')
      expect(fakeCtx.clearRect).toHaveBeenCalled()
    })

    it('ignores canvas interaction while inactive', async () => {
      const playback = usePlaybackStore()
      const seekSpy = vi.spyOn(playback, 'seek')
      const wrapper = mountPanel()
      await flushPromises()
      // Not active → the template guard short-circuits the handlers.
      await wrapper.find('.apb-timeline-canvas').trigger('mousedown', { clientX: 100 })
      expect(seekSpy).not.toHaveBeenCalled()
    })

    it('redraws on a ResizeObserver callback and disconnects when deactivated', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      expect(shared.resize).not.toBeNull()
      fakeCtx.fillText.mockClear()
      shared.resize!.cb()
      expect(fakeCtx.fillText).toHaveBeenCalled()
      // Deactivating tears the observer down.
      playback.windowStartMs = null
      await nextTick()
      expect(shared.resize!.disconnect).toHaveBeenCalled()
    })

    it('mouseup without an active drag does nothing', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      expect(() => window.dispatchEvent(new MouseEvent('mouseup'))).not.toThrow()
    })

    it('changes the playback speed via the speed buttons', async () => {
      const playback = usePlaybackStore()
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      const speedButtons = wrapper.findAll('.apb-speed-btn')
      await speedButtons[1]!.trigger('click')
      expect(playback.speedIdx).toBe(1)
    })

    it('exits playback via the stop button', async () => {
      const playback = usePlaybackStore()
      const exitSpy = vi.spyOn(playback, 'exit')
      const wrapper = mountPanel()
      await flushPromises()
      await activate(wrapper, playback)
      await wrapper.find('.apb-transport-btn--stop').trigger('click')
      expect(exitSpy).toHaveBeenCalled()
    })
  })

  describe('lifecycle + observers', () => {
    it('refreshes when the playback pane becomes active', async () => {
      const pane = document.createElement('div')
      pane.id = 'msb-pane-playback'
      document.body.appendChild(pane)
      mountPanel()
      await flushPromises()
      ;(fetch as ReturnType<typeof vi.fn>).mockClear()
      pane.classList.add('msb-pane-active')
      shared.mutation!.cb()
      await flushPromises()
      expect(fetch).toHaveBeenCalled()
    })

    it('does not refresh from the observer when the pane is inactive', async () => {
      const pane = document.createElement('div')
      pane.id = 'msb-pane-playback'
      document.body.appendChild(pane)
      mountPanel()
      await flushPromises()
      ;(fetch as ReturnType<typeof vi.fn>).mockClear()
      shared.mutation!.cb() // no active class
      await flushPromises()
      expect(fetch).not.toHaveBeenCalled()
    })

    it('refreshes on the periodic interval only while inactive', async () => {
      vi.useFakeTimers()
      const playback = usePlaybackStore()
      mountPanel()
      ;(fetch as ReturnType<typeof vi.fn>).mockClear()
      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(fetch).toHaveBeenCalledTimes(1)
      // While a window is active the interval is a no-op (store isActive = status !== idle).
      playback.status = 'playing'
      ;(fetch as ReturnType<typeof vi.fn>).mockClear()
      vi.advanceTimersByTime(5 * 60 * 1000)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('initialises the timeline when mounted with an already-active window', async () => {
      const playback = usePlaybackStore()
      playback.windowStartMs = 0
      playback.windowEndMs = 3_600_000
      playback.cursorMs = 0
      const wrapper = mountPanel()
      const wrap = wrapper.find('.apb-timeline-wrap').element as HTMLElement
      const canvas = wrapper.find('.apb-timeline-canvas').element as HTMLElement
      Object.defineProperty(wrap, 'clientWidth', { configurable: true, value: 800 })
      Object.defineProperty(wrap, 'clientHeight', { configurable: true, value: 60 })
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 })
      await flushPromises()
      await nextTick()
      expect(shared.resize).not.toBeNull()
    })

    it('tears down listeners and observers on unmount', async () => {
      const pane = document.createElement('div')
      pane.id = 'msb-pane-playback'
      document.body.appendChild(pane)
      const removeSpy = vi.spyOn(window, 'removeEventListener')
      const wrapper = mountPanel()
      await flushPromises()
      wrapper.unmount()
      expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
      expect(shared.mutation!.disconnect).toHaveBeenCalled()
    })
  })

  it('has no accessibility violations', async () => {
    const wrapper = mountPanel()
    await flushPromises()
    expect(
      await axe(wrapper.html(), {
        rules: { region: { enabled: false }, 'button-name': { enabled: false } },
      }),
    ).toHaveNoViolations()
  })
})
