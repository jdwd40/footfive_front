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
    ['SETUP', 'QF_BREAK', 'SF_BREAK', 'FINAL_BREAK'].includes(state)
  )
}
