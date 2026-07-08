import { describe, it, expect } from 'vitest'
import {
  isTournamentPlayingState,
  isTournamentBreakLikeState,
  getNextKickoffAt,
  formatCountdown,
} from './tournamentPhases'

describe('tournamentPhases', () => {
  it('detects ROUND_ACTIVE as playing', () => {
    expect(isTournamentPlayingState('ROUND_ACTIVE')).toBe(true)
  })

  it('detects legacy final states', () => {
    expect(isTournamentPlayingState('FINAL')).toBe(true)
  })

  it('detects inter-round delay as break', () => {
    expect(isTournamentBreakLikeState('INTER_ROUND_DELAY')).toBe(true)
  })

  it('detects tournament break as break-like', () => {
    expect(isTournamentBreakLikeState('TOURNAMENT_BREAK')).toBe(true)
  })
})

describe('getNextKickoffAt', () => {
  it('returns null without tournament or timing fields', () => {
    expect(getNextKickoffAt(null)).toBeNull()
    expect(getNextKickoffAt({ state: 'QF_BREAK' })).toBeNull()
  })

  it('prefers round kickoff time (epoch ms)', () => {
    const at = Date.now() + 60000
    expect(getNextKickoffAt({ state: 'QF_BREAK', nextRoundStartAt: at })).toEqual({
      at,
      kind: 'round',
    })
  })

  it('accepts ISO strings', () => {
    const at = new Date(Date.now() + 60000).toISOString()
    const result = getNextKickoffAt({ state: 'INTER_ROUND_DELAY', nextRoundStartAt: at })
    expect(result?.kind).toBe('round')
    expect(result?.at).toBe(new Date(at).getTime())
  })

  it('falls back to tournament break end time', () => {
    const at = Date.now() + 120000
    expect(getNextKickoffAt({ state: 'TOURNAMENT_BREAK', nextTournamentStartAt: at })).toEqual({
      at,
      kind: 'tournament',
    })
  })

  it('ignores unparseable timestamps', () => {
    expect(getNextKickoffAt({ nextRoundStartAt: 'not-a-date' })).toBeNull()
  })
})

describe('formatCountdown', () => {
  it('formats minutes and seconds as MM:SS', () => {
    expect(formatCountdown(45000)).toBe('00:45')
    expect(formatCountdown(80000)).toBe('01:20')
    expect(formatCountdown(5 * 60000)).toBe('05:00')
  })

  it('clamps negative and invalid values to 00:00', () => {
    expect(formatCountdown(-1000)).toBe('00:00')
    expect(formatCountdown(undefined)).toBe('00:00')
  })
})
