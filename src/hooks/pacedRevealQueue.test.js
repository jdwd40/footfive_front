import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createPacedRevealQueue,
  getEventDedupeKey,
  getEventPacingDelayMs,
} from './pacedRevealQueue'

describe('getEventDedupeKey', () => {
  it('prefers seq when present', () => {
    expect(getEventDedupeKey({ seq: 5, event_id: 9 })).toBe('seq:5')
  })

  it('falls back to event_id, eventId, id', () => {
    expect(getEventDedupeKey({ event_id: 9 })).toBe('event_id:9')
    expect(getEventDedupeKey({ eventId: 8 })).toBe('eventId:8')
    expect(getEventDedupeKey({ id: 7 })).toBe('id:7')
  })

  it('uses composite fallback when no ids', () => {
    const key = getEventDedupeKey({ type: 'possession', minute: 10, second: 0, fixtureId: 1 })
    expect(key).toBe('n:possession:10:0:1:undefined')
  })
})

describe('getEventPacingDelayMs', () => {
  it('reads top-level pacing.delay_ms', () => {
    expect(getEventPacingDelayMs({ pacing: { delay_ms: 2500 } }, 1000)).toBe(2500)
  })

  it('reads metadata.pacing.delay_ms', () => {
    expect(getEventPacingDelayMs({ metadata: { pacing: { delay_ms: 800 } } }, 1000)).toBe(800)
  })

  it('defaults when pacing absent (kickoff_restart without chain_type)', () => {
    expect(getEventPacingDelayMs({ type: 'kickoff_restart' }, 1000)).toBe(1000)
  })

  it('accepts zero delay', () => {
    expect(getEventPacingDelayMs({ pacing: { delay_ms: 0 } }, 1000)).toBe(0)
  })
})

describe('createPacedRevealQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setVisibleImmediately shows all bootstrap events without pacing', () => {
    const queue = createPacedRevealQueue({
      defaultDelayMs: 1000,
      onVisibleChange: () => {},
    })

    queue.setVisibleImmediately([
      { seq: 2, type: 'goal' },
      { seq: 1, type: 'possession' },
    ])

    expect(queue.getVisibleEvents()).toHaveLength(2)
    expect(queue.getVisibleEvents()[0].seq).toBe(2)
    queue.dispose()
  })

  it('enqueue reveals one event at a time with pacing delays', () => {
    let visible = []
    const queue = createPacedRevealQueue({
      defaultDelayMs: 1000,
      onVisibleChange: (events) => {
        visible = events
      },
    })

    queue.enqueue({ seq: 1, type: 'possession' })
    expect(visible).toHaveLength(0)

    vi.advanceTimersByTime(1000)
    expect(visible).toHaveLength(1)
    expect(visible[0].seq).toBe(1)

    queue.enqueue({ seq: 2, type: 'build_up', pacing: { delay_ms: 500 } })
    vi.advanceTimersByTime(500)
    expect(visible).toHaveLength(2)
    expect(visible[0].seq).toBe(2)

    queue.dispose()
  })

  it('dedupes visible and queued events by seq', () => {
    let visible = []
    const queue = createPacedRevealQueue({
      defaultDelayMs: 1000,
      onVisibleChange: (events) => {
        visible = events
      },
    })
    const event = { seq: 10, type: 'goal' }

    queue.setVisibleImmediately([event])
    queue.enqueue(event)
    vi.advanceTimersByTime(2000)

    expect(visible).toHaveLength(1)
    queue.dispose()
  })

  it('appendVisibleImmediately merges catch-up batch', () => {
    let visible = []
    const queue = createPacedRevealQueue({
      defaultDelayMs: 1000,
      onVisibleChange: (events) => {
        visible = events
      },
    })

    queue.setVisibleImmediately([{ seq: 1, type: 'possession' }])
    queue.appendVisibleImmediately([
      { seq: 2, type: 'build_up' },
      { seq: 3, type: 'shot' },
    ])

    expect(visible.map((e) => e.seq)).toEqual([3, 2, 1])
    queue.dispose()
  })

  it('clears timer on dispose', () => {
    const queue = createPacedRevealQueue({
      defaultDelayMs: 1000,
      onVisibleChange: () => {},
    })

    queue.enqueue({ seq: 99, type: 'goal' })
    queue.dispose()
    vi.advanceTimersByTime(5000)
    expect(queue.getVisibleEvents()).toHaveLength(0)
  })

  it('onEventRevealed fires only for paced enqueue, not bootstrap or catch-up', () => {
    const revealed = []
    const queue = createPacedRevealQueue({
      defaultDelayMs: 1000,
      onVisibleChange: () => {},
      onEventRevealed: (event) => revealed.push(event),
    })

    queue.setVisibleImmediately([{ seq: 1, type: 'goal' }])
    expect(revealed).toHaveLength(0)

    queue.appendVisibleImmediately([{ seq: 2, type: 'goal' }])
    expect(revealed).toHaveLength(0)

    queue.enqueue({ seq: 3, type: 'goal' })
    vi.advanceTimersByTime(1000)
    expect(revealed).toHaveLength(1)
    expect(revealed[0].seq).toBe(3)

    queue.dispose()
  })
})
