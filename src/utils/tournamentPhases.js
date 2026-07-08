/** Legacy backend states where matches run */
export const LEGACY_ROUND_PLAY_STATES = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL']

/** True when the tournament is in a playing phase (v2 + legacy). */
export function isTournamentPlayingState(state) {
  if (!state) return false
  return state === 'ROUND_ACTIVE' || LEGACY_ROUND_PLAY_STATES.includes(state)
}

/** Break / setup / between-rounds (v2 + legacy). */
export function isTournamentBreakLikeState(state) {
  if (!state) return false
  return (
    state === 'INTER_ROUND_DELAY' ||
    state === 'ROUND_COMPLETE' ||
    ['SETUP', 'QF_BREAK', 'SF_BREAK', 'FINAL_BREAK', 'TOURNAMENT_BREAK'].includes(state)
  )
}

/**
 * Next kickoff timestamp from tournament status, if the backend exposes one.
 * Returns { at: epochMs, kind: 'round' | 'tournament' } or null.
 */
export function getNextKickoffAt(tournament) {
  if (!tournament) return null
  const toMs = (v) => {
    if (v == null) return null
    const ms = new Date(v).getTime()
    return Number.isFinite(ms) ? ms : null
  }
  const roundAt = toMs(tournament.nextRoundStartAt)
  if (roundAt) return { at: roundAt, kind: 'round' }
  const tournamentAt = toMs(tournament.nextTournamentStartAt)
  if (tournamentAt) return { at: tournamentAt, kind: 'tournament' }
  return null
}

/** Format ms remaining as MM:SS (clamped at 0). */
export function formatCountdown(remainingMs) {
  const ms = Math.max(0, Number(remainingMs) || 0)
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
