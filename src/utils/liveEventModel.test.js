import { describe, it, expect } from 'vitest'
import {
  normalizeLiveEvent,
  dedupeLiveEventsBySeq,
  compareLiveEventsDesc,
  LIVE_SSE_EVENT_TYPES,
  canApplyMatchScoreFromEvent,
  canApplyPenaltyScoreFromEvent,
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

describe('score application guards', () => {
  it('allows match score only on scoring types', () => {
    const score = { home: 1, away: 0 }
    expect(canApplyMatchScoreFromEvent({ type: 'goal', score })).toBe(true)
    expect(canApplyMatchScoreFromEvent({ type: 'penalty_scored', score })).toBe(true)
    expect(canApplyMatchScoreFromEvent({ type: 'goal_build_up', score })).toBe(false)
    expect(canApplyMatchScoreFromEvent({ type: 'shot_saved', score })).toBe(false)
  })

  it('allows penalty score only on shootout-related types', () => {
    const penaltyScore = { home: 1, away: 0 }
    expect(canApplyPenaltyScoreFromEvent({ type: 'shootout_goal', penaltyScore })).toBe(true)
    expect(canApplyPenaltyScoreFromEvent({ type: 'goal_build_up', penaltyScore })).toBe(false)
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
    // Flow / narration / event chains
    'possession',
    'possession_play',
    'build_up',
    'build_up_play',
    'ball_progression',
    'keeper_distribution',
    'defensive_action',
    'midfield_battle',
    'goal_build_up',
    'attack_breakdown',
    'chance_created',
    'shot',
    'save',
    'miss',
    'block',
    'counter_attack',
    'counter_breakdown',
    'breakaway',
    'final_score',
    'match_winner',
    'match_draw',
    // Match-state lifecycle
    'kickoff',
    'kickoff_restart',
    'match_recap',
    // Goals / shots / discipline
    'goal',
    'shot_saved',
    'shot_missed',
    'shot_blocked',
    'corner',
    'foul',
    'penalty_awarded',
    'penalty_walkup',
    'penalty_run_up',
    'penalty_scored',
    'penalty_missed',
    'penalty_saved',
    // Shootout sub-events
    'shootout_walkup',
    'shootout_goal',
    'shootout_save',
    'shootout_miss',
    'shootout_reaction',
    'shootout_end',
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

describe('normalizeLiveEvent chain and bundle fields', () => {
  it('lifts bundleId and bundleStep from snake_case top-level', () => {
    const n = normalizeLiveEvent(
      { seq: 1, bundle_id: 'b1', bundle_step: 2, chain_type: 'attack', chain_terminal: true },
      { sseType: 'goal_build_up' }
    )
    expect(n.bundleId).toBe('b1')
    expect(n.bundleStep).toBe(2)
    expect(n.chain_type).toBe('attack')
    expect(n.chainType).toBe('attack')
    expect(n.chain_terminal).toBe(true)
    expect(n.chainTerminal).toBe(true)
  })

  it('lifts bundleId and chainType from camelCase payload', () => {
    const n = normalizeLiveEvent(
      {
        seq: 2,
        payload: {
          bundleId: 'b2',
          bundleStep: 0,
          chainType: 'counter',
          chainTerminal: false,
        },
      },
      { sseType: 'counter_attack' }
    )
    expect(n.bundleId).toBe('b2')
    expect(n.bundleStep).toBe(0)
    expect(n.chain_type).toBe('counter')
    expect(n.chainType).toBe('counter')
    expect(n.chain_terminal).toBe(false)
    expect(n.chainTerminal).toBe(false)
  })

  it('preserves null bundleStep for historical events', () => {
    const n = normalizeLiveEvent(
      { seq: 3, bundle_id: 'b3', bundle_step: null },
      { sseType: 'midfield_battle' }
    )
    expect(n.bundleId).toBe('b3')
    expect(n.bundleStep).toBeNull()
  })
})

describe('normalizeLiveEvent pacing', () => {
  it('normalizes pacing from top-level with camelCase aliases', () => {
    const n = normalizeLiveEvent(
      { seq: 1, pacing: { delayMs: 100, holdMs: 200 } },
      { sseType: 'attack_breakdown' }
    )
    expect(n.pacing).toEqual({ delay_ms: 100, hold_ms: 200 })
  })

  it('lifts pacing from metadata when not on flattened data', () => {
    const n = normalizeLiveEvent({
      event_type: 'shot_blocked',
      event_id: 4,
      metadata: { pacing: { delay_ms: 50, hold_ms: 80 } },
    })
    expect(n.pacing).toEqual({ delay_ms: 50, hold_ms: 80 })
  })

  it('uses flattened top-level pacing when metadata has no pacing', () => {
    const n = normalizeLiveEvent({
      event_type: 'counter_breakdown',
      event_id: 5,
      pacing: { delay_ms: 10, hold_ms: 20 },
      metadata: { description: 'breakdown' },
    })
    expect(n.pacing).toEqual({ delay_ms: 10, hold_ms: 20 })
  })

  it('falls back to metadata pacing when merge clears data.pacing', () => {
    const n = normalizeLiveEvent({
      event_type: 'penalty_walkup',
      event_id: 6,
      payload: { pacing: null },
      metadata: { pacing: { delay_ms: 30, hold_ms: 40 } },
    })
    expect(n.pacing).toEqual({ delay_ms: 30, hold_ms: 40 })
  })

  it('leaves pacing undefined when absent', () => {
    const n = normalizeLiveEvent({ seq: 6 }, { sseType: 'foul' })
    expect(n.pacing).toBeUndefined()
  })

  it('normalizes kickoff_restart with pacing but no chain_type', () => {
    const n = normalizeLiveEvent(
      { seq: 7, pacing: { delay_ms: 0, hold_ms: 500 } },
      { sseType: 'kickoff_restart' }
    )
    expect(n.type).toBe('kickoff_restart')
    expect(n.pacing).toEqual({ delay_ms: 0, hold_ms: 500 })
    expect(n.chain_type).toBeNull()
    expect(n.chainType).toBeNull()
  })
})
