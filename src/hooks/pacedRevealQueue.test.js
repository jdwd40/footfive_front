import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createPacedRevealQueue,
  getEventDedupeKey,
  getReadableEventDelay,
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

describe('getReadableEventDelay', () => {
  it('uses ~3.5s for normal flow events', () => {
    expect(getReadableEventDelay({ type: 'possession' })).toBe(3500)
  })

  it('uses ~3.2s for build-up chain events', () => {
    expect(getReadableEventDelay({ type: 'goal_build_up' })).toBe(3200)
    expect(getReadableEventDelay({ type: 'midfield_battle' })).toBe(3200)
  })

  it('uses ~3.8s for shot results', () => {
    expect(getReadableEventDelay({ type: 'shot_saved' })).toBe(3800)
  })

  it('uses ~4.8s for goals and match-end events', () => {
    expect(getReadableEventDelay({ type: 'goal' })).toBe(4800)
    expect(getReadableEventDelay({ type: 'match_end' })).toBe(4800)
  })

  it('uses ~2s for penalty and shootout process events', () => {
    expect(getReadableEventDelay({ type: 'penalty_walkup' })).toBe(2000)
    expect(getReadableEventDelay({ type: 'shootout_walkup' })).toBe(2000)
    expect(getReadableEventDelay({ type: 'possession', chain_type: 'penalty' })).toBe(2000)
  })

  it('uses ~2.8s for kickoff_restart', () => {
    expect(getReadableEventDelay({ type: 'kickoff_restart' })).toBe(2800)
  })

  it('ignores short backend delays below type base (uses base, not 800ms)', () => {
    expect(
      getReadableEventDelay({ type: 'possession', metadata: { pacing: { delay_ms: 800 } } })
    ).toBe(3500)
    expect(
      getReadableEventDelay({ type: 'possession', pacing: { delay_ms: 1200 } })
    ).toBe(3500)
  })

  it('honours longer backend delays within readable maximum', () => {
    expect(getReadableEventDelay({ type: 'possession', pacing: { delay_ms: 4200 } })).toBe(4200)
  })

  it('does not rush major events when queue is long', () => {
    expect(getReadableEventDelay({ type: 'goal' }, 20)).toBe(4800)
  })

  it('gentle catch-up for long non-major queues', () => {
    expect(getReadableEventDelay({ type: 'possession' }, 10)).toBe(3000)
    expect(getReadableEventDelay({ type: 'possession' }, 16)).toBe(2500)
  })

  it('supports event_type alias', () => {
    expect(getReadableEventDelay({ event_type: 'counter_attack' })).toBe(3200)
  })
})

describe('getEventPacingDelayMs', () => {
  it('delegates to getReadableEventDelay', () => {
    expect(getEventPacingDelayMs({ type: 'goal' })).toBe(4800)
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

  it('enqueue reveals one event at a time with readable pacing delays', () => {
    let visible = []
    const queue = createPacedRevealQueue({
      onVisibleChange: (events) => {
        visible = events
      },
    })

    queue.enqueue({ seq: 1, type: 'possession' })
    expect(visible).toHaveLength(0)

    vi.advanceTimersByTime(3500)
    expect(visible).toHaveLength(1)
    expect(visible[0].seq).toBe(1)

    queue.enqueue({ seq: 2, type: 'goal_build_up', pacing: { delay_ms: 500 } })
    vi.advanceTimersByTime(3200)
    expect(visible).toHaveLength(2)
    expect(visible[0].seq).toBe(2)

    queue.dispose()
  })

  it('dedupes visible and queued events by seq', () => {
    let visible = []
    const queue = createPacedRevealQueue({
      onVisibleChange: (events) => {
        visible = events
      },
    })
    const event = { seq: 10, type: 'goal' }

    queue.setVisibleImmediately([event])
    queue.enqueue(event)
    vi.advanceTimersByTime(10000)

    expect(visible).toHaveLength(1)
    queue.dispose()
  })

  it('appendVisibleImmediately merges catch-up batch', () => {
    let visible = []
    const queue = createPacedRevealQueue({
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
      onVisibleChange: () => {},
    })

    queue.enqueue({ seq: 99, type: 'goal' })
    queue.dispose()
    vi.advanceTimersByTime(10000)
    expect(queue.getVisibleEvents()).toHaveLength(0)
  })

  it('onEventRevealed fires only for paced enqueue, not bootstrap or catch-up', () => {
    const revealed = []
    const queue = createPacedRevealQueue({
      onVisibleChange: () => {},
      onEventRevealed: (event) => revealed.push(event),
    })

    queue.setVisibleImmediately([{ seq: 1, type: 'goal' }])
    expect(revealed).toHaveLength(0)

    queue.appendVisibleImmediately([{ seq: 2, type: 'goal' }])
    expect(revealed).toHaveLength(0)

    queue.enqueue({ seq: 3, type: 'goal' })
    vi.advanceTimersByTime(4800)
    expect(revealed).toHaveLength(1)
    expect(revealed[0].seq).toBe(3)

    queue.dispose()
  })

  it('reveals scoring events before onEventRevealed can apply score (paced order)', () => {
    const revealed = []
    let visible = []
    const queue = createPacedRevealQueue({
      onVisibleChange: (events) => {
        visible = events
      },
      onEventRevealed: (event) => revealed.push(event),
    })

    queue.enqueue({ seq: 1, type: 'goal_build_up' })
    queue.enqueue({ seq: 2, type: 'goal', score: { home: 1, away: 0 } })

    vi.advanceTimersByTime(3200)
    expect(visible.map((e) => e.type)).toEqual(['goal_build_up'])
    expect(revealed.map((e) => e.type)).toEqual(['goal_build_up'])

    vi.advanceTimersByTime(4800)
    expect(visible.map((e) => e.type)).toEqual(['goal', 'goal_build_up'])
    expect(revealed.map((e) => e.type)).toEqual(['goal_build_up', 'goal'])

    queue.dispose()
  })
})
