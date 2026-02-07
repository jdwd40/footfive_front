import { Link } from 'react-router-dom'

const MATCH_STATE_CONFIG = {
  SCHEDULED: { label: 'Upcoming', color: 'bg-slate-500/20 text-slate-400', pulse: false },
  FIRST_HALF: { label: '1st Half', color: 'bg-emerald-500/20 text-emerald-400', pulse: true },
  HALFTIME: { label: 'HT', color: 'bg-amber-500/20 text-amber-400', pulse: false },
  SECOND_HALF: { label: '2nd Half', color: 'bg-emerald-500/20 text-emerald-400', pulse: true },
  EXTRA_TIME_1: { label: 'ET 1st', color: 'bg-orange-500/20 text-orange-400', pulse: true },
  ET_HALFTIME: { label: 'ET Break', color: 'bg-amber-500/20 text-amber-400', pulse: false },
  EXTRA_TIME_2: { label: 'ET 2nd', color: 'bg-orange-500/20 text-orange-400', pulse: true },
  PENALTIES: { label: 'Pens', color: 'bg-red-500/20 text-red-400', pulse: true },
  FINISHED: { label: 'FT', color: 'bg-slate-500/20 text-slate-400', pulse: false },
}

export default function LiveMatchCard({ match, compact = false }) {
  const {
    fixtureId,
    state,
    minute,
    score,
    penaltyScore,
    homeTeam,
    awayTeam,
    isFinished
  } = match

  // Determine if match has scores (even 0-0 counts as having a score)
  const hasScore = score?.home != null || score?.away != null
  // Only trust explicit FINISHED state - backend handles extra time and penalties
  const matchIsFinished = state === 'FINISHED' || isFinished === true

  // Get state config - use actual state from backend
  // Special handling: if match is SCHEDULED but has scores, it's actually playing
  const getStateConfig = () => {
    if (MATCH_STATE_CONFIG[state]) {
      // Override SCHEDULED if match has any score (means it's actually playing)
      if (state === 'SCHEDULED' && hasScore) {
        return { label: 'Live', color: 'bg-emerald-500/20 text-emerald-400', pulse: true }
      }
      return MATCH_STATE_CONFIG[state]
    }
    if (matchIsFinished) return MATCH_STATE_CONFIG.FINISHED
    // If match has scores but unknown state, show as in progress
    if (hasScore) return MATCH_STATE_CONFIG.FIRST_HALF
    return MATCH_STATE_CONFIG.SCHEDULED
  }
  const stateConfig = getStateConfig()
  const isLive = ['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME_1', 'EXTRA_TIME_2', 'PENALTIES'].includes(state)
  const hasPenalties = penaltyScore?.home > 0 || penaltyScore?.away > 0

  if (compact) {
    return (
      <Link
        to={`/live/${fixtureId}`}
        className="block p-3 rounded-xl bg-card hover:bg-card-hover border border-border transition-all hover:border-primary/30"
      >
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex-1 min-w-0">
            <p className={`font-medium truncate ${score?.home > score?.away ? 'text-primary' : 'text-text'}`}>
              {homeTeam?.name || 'TBD'}
            </p>
          </div>

          {/* Score */}
          <div className="flex items-center gap-1 px-2">
            <span className={`text-lg font-bold ${score?.home > score?.away ? 'text-primary' : 'text-text'}`}>
              {score?.home ?? '-'}
            </span>
            <span className="text-text-muted">-</span>
            <span className={`text-lg font-bold ${score?.away > score?.home ? 'text-primary' : 'text-text'}`}>
              {score?.away ?? '-'}
            </span>
          </div>

          {/* Away Team */}
          <div className="flex-1 min-w-0 text-right">
            <p className={`font-medium truncate ${score?.away > score?.home ? 'text-primary' : 'text-text'}`}>
              {awayTeam?.name || 'TBD'}
            </p>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center justify-center mt-2">
          <span className={`text-xs px-2 py-0.5 rounded-full ${stateConfig.color} ${stateConfig.pulse ? 'animate-pulse' : ''}`}>
            {isLive && minute !== undefined ? `${minute}'` : stateConfig.label}
          </span>
        </div>
      </Link>
    )
  }

  return (
    <Link
      to={`/live/${fixtureId}`}
      className={`
        block p-4 sm:p-5 rounded-2xl bg-card border transition-all duration-300
        hover:shadow-lg hover:shadow-primary/10
        ${isLive ? 'border-primary/40 shadow-md shadow-primary/20' : 'border-border hover:border-primary/30'}
      `}
    >
      {/* Status Badge */}
      <div className="flex items-center justify-center mb-4">
        <span className={`
          inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold
          ${stateConfig.color}
        `}>
          {stateConfig.pulse && (
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          )}
          {isLive && minute !== undefined ? `${minute}'` : stateConfig.label}
        </span>
      </div>

      {/* Teams and Score */}
      <div className="flex items-center justify-between gap-3">
        {/* Home Team */}
        <div className="flex-1 min-w-0 text-center">
          <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-2xl">
            ⚽
          </div>
          <p className={`font-semibold text-sm truncate ${score?.home > score?.away ? 'text-primary' : 'text-text'}`}>
            {homeTeam?.name || 'TBD'}
          </p>
        </div>

        {/* Score */}
        <div className="text-center px-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className={`
              text-3xl sm:text-4xl font-bold transition-all
              ${score?.home > score?.away ? 'text-primary' : 'text-text'}
            `}>
              {score?.home ?? 0}
            </span>
            <span className="text-xl text-text-muted">-</span>
            <span className={`
              text-3xl sm:text-4xl font-bold transition-all
              ${score?.away > score?.home ? 'text-primary' : 'text-text'}
            `}>
              {score?.away ?? 0}
            </span>
          </div>

          {/* Penalty Score */}
          {hasPenalties && (
            <p className="text-xs text-text-muted mt-1">
              ({penaltyScore.home} - {penaltyScore.away} pens)
            </p>
          )}
        </div>

        {/* Away Team */}
        <div className="flex-1 min-w-0 text-center">
          <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-500/10 flex items-center justify-center text-2xl">
            ⚽
          </div>
          <p className={`font-semibold text-sm truncate ${score?.away > score?.home ? 'text-primary' : 'text-text'}`}>
            {awayTeam?.name || 'TBD'}
          </p>
        </div>
      </div>

      {/* View Match Link */}
      {isLive && (
        <div className="mt-4 text-center">
          <span className="text-xs text-primary font-medium">
            Tap to view live →
          </span>
        </div>
      )}
    </Link>
  )
}

