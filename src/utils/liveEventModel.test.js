import { describe, it, expect } from 'vitest'
import {
  normalizeLiveEvent,
  dedupeLiveEventsBySeq,
  compareLiveEventsDesc,
  LIVE_SSE_EVENT_TYPES,
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

describe('LIVE_SSE_EVENT_TYPES', () => {
  // EventSource silently drops named events that have no addEventListener,
  // so the registered list must include every type the backend can emit on
  // a fixture-filtered stream. If the backend adds a new emit type, add it
  // here too or it will be invisible on the live feed.
  const REQUIRED = [
    // Flow / narration
    'possession',
    'possession_play',
    'build_up',
    'build_up_play',
    'ball_progression',
    'keeper_distribution',
    'defensive_action',
    'chance_created',
    'shot',
    'save',
    'miss',
    'block',
    'counter_attack',
    'breakaway',
    'final_score',
    'match_winner',
    'match_draw',
    // Match-state lifecycle
    'kickoff',
    'match_recap',
    // Goals / shots / discipline
    'shot_saved',
    'shot_missed',
    'corner',
    'foul',
    'penalty_awarded',
    'penalty_missed',
    'penalty_saved',
    // Shootout sub-events
    'shootout_walkup',
    'shootout_reaction',
  ]
  it.each(REQUIRED)('includes %s', (type) => {
    expect(LIVE_SSE_EVENT_TYPES).toContain(type)
  })
  it('still includes legacy events', () => {
    for (const t of ['goal', 'yellow_card', 'red_card', 'halftime', 'fulltime', 'match_end']) {
      expect(LIVE_SSE_EVENT_TYPES).toContain(t)
    }
  })
})

describe('normalizeLiveEvent description flattening', () => {
  it('lifts payload.description', () => {
    const n = normalizeLiveEvent(
      { seq: 1, payload: { description: 'pay-desc' } },
      { sseType: 'possession' }
    )
    expect(n.description).toBe('pay-desc')
    expect(n.type).toBe('possession')
  })
  it('lifts metadata.description (REST shape)', () => {
    const n = normalizeLiveEvent({
      event_type: 'shot',
      event_id: 7,
      metadata: { description: 'meta-desc' },
    })
    expect(n.description).toBe('meta-desc')
    expect(n.type).toBe('shot')
  })
  it('keeps top-level description when no wrapper', () => {
    const n = normalizeLiveEvent(
      { seq: 2, description: 'top' },
      { sseType: 'save' }
    )
    expect(n.description).toBe('top')
  })
})

describe('normalizeLiveEvent unknown sse type', () => {
  it('still normalizes so unknown types fall through to fallback display', () => {
    const n = normalizeLiveEvent(
      { seq: 3, payload: { description: 'd' } },
      { sseType: 'totally_new_type' }
    )
    expect(n).toBeTruthy()
    expect(n.type).toBe('totally_new_type')
    expect(n.description).toBe('d')
  })
})
