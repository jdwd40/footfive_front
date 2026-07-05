/**
 * Pure helpers for the virtual betting UI.
 * All amounts are virtual FootFive Credits (FC) - never real money.
 */

export const MAX_STAKE = 10000

export function formatFC(amount) {
  if (amount == null || amount === '') return '—'
  const value = Number(amount)
  if (!Number.isFinite(value)) return '—'
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FC`
}

export function formatOdds(odds) {
  const value = Number(odds)
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

export function computePotentialReturn(stake, odds) {
  const s = Number(stake)
  const o = Number(odds)
  if (!Number.isFinite(s) || !Number.isFinite(o) || s <= 0 || o <= 0) return 0
  return Math.round(s * o * 100) / 100
}

/**
 * Validate a stake input against the user's balance.
 * @returns {{ valid: boolean, error: string|null, value: number|null }}
 */
export function validateStake(input, balance) {
  const value = Number(input)

  if (input === '' || input == null || !Number.isFinite(value)) {
    return { valid: false, error: 'Enter a stake', value: null }
  }
  if (value <= 0) {
    return { valid: false, error: 'Stake must be positive', value: null }
  }
  if (value > MAX_STAKE) {
    return { valid: false, error: `Max stake is ${MAX_STAKE} FC`, value: null }
  }
  if (balance != null && value > balance) {
    return { valid: false, error: 'Not enough virtual funds', value: null }
  }
  return { valid: true, error: null, value: Math.round(value * 100) / 100 }
}

/**
 * Same-side rule: if the user already has bets on this fixture, they may
 * only add bets on the same selected team.
 * @param {Array} fixtureBets - user's existing bets on this fixture
 * @returns {number|null} the only allowed teamId, or null if any side is allowed
 */
export function getLockedTeamId(fixtureBets) {
  if (!fixtureBets || fixtureBets.length === 0) return null
  return fixtureBets[0].selectedTeamId ?? null
}

/**
 * Can the user pick this team for a new bet on this fixture?
 */
export function canSelectTeam(fixtureBets, teamId) {
  const locked = getLockedTeamId(fixtureBets)
  return locked == null || locked === teamId
}

export function summarizeFixtureBets(fixtureBets) {
  if (!fixtureBets || fixtureBets.length === 0) return null
  const totalStake = fixtureBets.reduce((sum, b) => sum + (Number(b.stake) || 0), 0)
  const totalPotential = fixtureBets.reduce((sum, b) => sum + (Number(b.potentialReturn) || 0), 0)
  return {
    count: fixtureBets.length,
    teamId: getLockedTeamId(fixtureBets),
    teamName: fixtureBets[0].selectedTeamName || null,
    totalStake: Math.round(totalStake * 100) / 100,
    totalPotential: Math.round(totalPotential * 100) / 100,
  }
}

export const BET_STATUS_STYLES = {
  pending: { label: 'Pending', className: 'bg-amber-500/20 text-amber-400' },
  won: { label: 'Won', className: 'bg-primary/20 text-primary' },
  lost: { label: 'Lost', className: 'bg-live/20 text-live' },
  void: { label: 'Void', className: 'bg-card-hover text-text-muted' },
}

export const BET_TYPE_LABELS = {
  fixture_winner: 'Match Winner',
  live_fixture_winner: 'Live Winner',
  championship_winner: 'Championship',
}
