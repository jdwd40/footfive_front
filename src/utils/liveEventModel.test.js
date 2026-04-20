import { describe, it, expect } from 'vitest'
import {
  normalizeLiveEvent,
  dedupeLiveEventsBySeq,
  compareLiveEventsDesc,
} from './liveEventModel'

describe('normalizeLiveEvent', () => {
  it('merges SSE type with JSON body', () => {
    const n = normalizeLiveEvent(
      { seq: 5, fixtureId: 10, minute: 12, score: { home: 1, away: 0 } },
      { sseType: 'goal' }
    )
    expect(n.type).toBe('goal')
    expect(n.seq).toBe(5)
    expect(n.fixtureId).toBe(10)
  })

  it('maps legacy fixture row', () => {
    const n = normalizeLiveEvent({
      event_type: 'yellow_card',
      event_id: 99,
      minute: 44,
      team_name: 'A',
    })
    expect(n.type).toBe('yellow_card')
    expect(n.seq).toBe(99)
  })
})

describe('dedupeLiveEventsBySeq', () => {
  it('removes duplicate seq', () => {
    const a = { type: 'goal', seq: 1, fixtureId: 1 }
    const b = { type: 'goal', seq: 1, fixtureId: 1 }
    expect(dedupeLiveEventsBySeq([a, b])).toHaveLength(1)
  })
})

describe('compareLiveEventsDesc', () => {
  it('orders by seq descending', () => {
    const a = { seq: 1 }
    const b = { seq: 2 }
    expect(compareLiveEventsDesc(a, b)).toBeGreaterThan(0)
  })
})
