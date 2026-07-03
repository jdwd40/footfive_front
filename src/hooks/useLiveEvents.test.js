import { describe, it, expect } from 'vitest'
import { createSeenSeqTracker } from './useLiveEvents'
import { normalizeLiveEvent, LIVE_SSE_EVENT_TYPES } from '../utils/liveEventModel'

describe('createSeenSeqTracker', () => {
  it('flags a repeated seq as duplicate', () => {
    const tracker = createSeenSeqTracker()
    expect(tracker.check(5)).toBe(false)
    expect(tracker.check(5)).toBe(true)
  })

  it('never dedupes non-positive or missing seq', () => {
    const tracker = createSeenSeqTracker()
    expect(tracker.check(0)).toBe(false)
    expect(tracker.check(0)).toBe(false)
    expect(tracker.check(-1)).toBe(false)
    expect(tracker.check(null)).toBe(false)
    expect(tracker.check(undefined)).toBe(false)
    expect(tracker.check('abc')).toBe(false)
  })

  it('evicts oldest entries past the limit', () => {
    const tracker = createSeenSeqTracker(3)
    tracker.check(1)
    tracker.check(2)
    tracker.check(3)
    tracker.check(4) // evicts 1
    expect(tracker.check(1)).toBe(false) // forgotten, accepted again
    expect(tracker.check(4)).toBe(true) // still remembered
  })

  it('clear() forgets everything (full-replay reconnect)', () => {
    const tracker = createSeenSeqTracker()
    tracker.check(7)
    tracker.clear()
    expect(tracker.check(7)).toBe(false)
  })
})

describe('generic (data-only) SSE delivery', () => {
  it('normalizes an unknown event type not in LIVE_SSE_EVENT_TYPES', () => {
    // Simulates the onmessage path: no sseType, type comes from the JSON.
    const raw = JSON.stringify({
      type: 'var_check',
      fixtureId: 42,
      minute: 63,
      seq: 910,
      payload: { teamId: 3, description: 'VAR is checking for a possible penalty.' },
    })
    expect(LIVE_SSE_EVENT_TYPES).not.toContain('var_check')

    const normalized = normalizeLiveEvent(raw)
    expect(normalized).not.toBeNull()
    expect(normalized.type).toBe('var_check')
    expect(normalized.fixtureId).toBe(42)
    expect(normalized.minute).toBe(63)
    expect(normalized.seq).toBe(910)
    expect(normalized.teamId).toBe(3)
    expect(normalized.description).toBe('VAR is checking for a possible penalty.')
  })

  it('still normalizes a known type identically with or without sseType', () => {
    const raw = JSON.stringify({
      type: 'goal',
      fixtureId: 1,
      minute: 12,
      seq: 33,
      payload: { teamId: 9, description: 'GOAL!', score: { home: 1, away: 0 } },
    })
    const viaNamed = normalizeLiveEvent(JSON.parse(raw), { sseType: 'goal' })
    const viaDefault = normalizeLiveEvent(JSON.parse(raw))
    expect(viaDefault).toEqual(viaNamed)
  })
})
