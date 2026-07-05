import { describe, it, expect } from 'vitest'
import {
  formatFC,
  formatOdds,
  computePotentialReturn,
  validateStake,
  getLockedTeamId,
  canSelectTeam,
  summarizeFixtureBets,
  MAX_STAKE,
} from './betting'

describe('betting utils', () => {
  describe('formatFC', () => {
    it('formats amounts with FC suffix', () => {
      expect(formatFC(1000)).toBe('1,000.00 FC')
      expect(formatFC(12.5)).toBe('12.50 FC')
    })

    it('handles invalid values', () => {
      expect(formatFC(null)).toBe('—')
      expect(formatFC('abc')).toBe('—')
    })
  })

  describe('formatOdds', () => {
    it('formats to two decimals', () => {
      expect(formatOdds(1.9)).toBe('1.90')
      expect(formatOdds(12)).toBe('12.00')
    })

    it('handles missing odds', () => {
      expect(formatOdds(undefined)).toBe('—')
    })
  })

  describe('computePotentialReturn', () => {
    it('multiplies stake by odds, rounded to 2dp', () => {
      expect(computePotentialReturn(100, 1.9)).toBe(190)
      expect(computePotentialReturn(33.33, 2.15)).toBe(71.66)
    })

    it('returns 0 for invalid inputs', () => {
      expect(computePotentialReturn(0, 1.9)).toBe(0)
      expect(computePotentialReturn('x', 1.9)).toBe(0)
      expect(computePotentialReturn(10, null)).toBe(0)
    })
  })

  describe('validateStake', () => {
    it('accepts a valid stake within balance', () => {
      const result = validateStake('50', 100)
      expect(result.valid).toBe(true)
      expect(result.value).toBe(50)
    })

    it('rejects empty, zero, and negative stakes', () => {
      expect(validateStake('', 100).valid).toBe(false)
      expect(validateStake('0', 100).valid).toBe(false)
      expect(validateStake('-5', 100).valid).toBe(false)
    })

    it('rejects stakes above the balance', () => {
      const result = validateStake('150', 100)
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/funds/i)
    })

    it('rejects stakes above the maximum', () => {
      const result = validateStake(String(MAX_STAKE + 1), MAX_STAKE * 2)
      expect(result.valid).toBe(false)
      expect(result.error).toMatch(/max/i)
    })

    it('rounds to 2 decimal places', () => {
      expect(validateStake('10.999', 100).value).toBe(11)
    })

    it('allows any stake when balance is unknown', () => {
      expect(validateStake('50', null).valid).toBe(true)
    })
  })

  describe('same-side rule helpers', () => {
    const betsOnTeam1 = [
      { betId: 1, selectedTeamId: 1, selectedTeamName: 'Team A', stake: 50, potentialReturn: 95 },
      { betId: 2, selectedTeamId: 1, selectedTeamName: 'Team A', stake: 25, potentialReturn: 47.5 },
    ]

    it('locks selection to the already-backed team', () => {
      expect(getLockedTeamId(betsOnTeam1)).toBe(1)
      expect(canSelectTeam(betsOnTeam1, 1)).toBe(true)
      expect(canSelectTeam(betsOnTeam1, 2)).toBe(false)
    })

    it('allows any side when there are no existing bets', () => {
      expect(getLockedTeamId([])).toBe(null)
      expect(canSelectTeam([], 1)).toBe(true)
      expect(canSelectTeam(null, 2)).toBe(true)
    })
  })

  describe('summarizeFixtureBets', () => {
    it('sums stakes and potential returns', () => {
      const summary = summarizeFixtureBets([
        { selectedTeamId: 3, selectedTeamName: 'Team C', stake: 50, potentialReturn: 90 },
        { selectedTeamId: 3, selectedTeamName: 'Team C', stake: 10, potentialReturn: 18 },
      ])
      expect(summary.count).toBe(2)
      expect(summary.teamId).toBe(3)
      expect(summary.teamName).toBe('Team C')
      expect(summary.totalStake).toBe(60)
      expect(summary.totalPotential).toBe(108)
    })

    it('returns null with no bets', () => {
      expect(summarizeFixtureBets([])).toBe(null)
      expect(summarizeFixtureBets(null)).toBe(null)
    })
  })
})
