import { describe, it, expect } from 'vitest'
import { isTournamentPlayingState, isTournamentBreakLikeState } from './tournamentPhases'

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
})
