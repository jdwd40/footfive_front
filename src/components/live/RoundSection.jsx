import { Link } from 'react-router-dom'

const ROUND_CONFIG = {
  'Round of 16': { icon: '🏟️', color: 'from-blue-500/20 to-blue-600/10', matches: 8 },
  'Quarter-finals': { icon: '🔥', color: 'from-orange-500/20 to-orange-600/10', matches: 4 },
  'Semi-finals': { icon: '⚡', color: 'from-purple-500/20 to-purple-600/10', matches: 2 },
  'Final': { icon: '🏆', color: 'from-gold/20 to-yellow-600/10', matches: 1 },
}

const MATCH_STATE_LABELS = {
  SCHEDULED: { label: 'Upcoming', color: 'text-text-muted bg-card-hover' },
  FIRST_HALF: { label: '1st Half', color: 'text-live bg-live/20', live: true },
  HALFTIME: { label: 'HT', color: 'text-amber-400 bg-amber-500/20' },
  SECOND_HALF: { label: '2nd Half', color: 'text-live bg-live/20', live: true },
  EXTRA_TIME_1: { label: 'ET 1st', color: 'text-orange-400 bg-orange-500/20', live: true },
  ET_HALFTIME: { label: 'ET Break', color: 'text-amber-400 bg-amber-500/20' },
  EXTRA_TIME_2: { label: 'ET 2nd', color: 'text-orange-400 bg-orange-500/20', live: true },
  PENALTIES: { label: 'Pens', color: 'text-live bg-live/20', live: true },
  FINISHED: { label: 'FT', color: 'text-primary bg-primary/20' },
}

export default function RoundSection({
  round,
  matches,
  isCurrentRound = false,
  isCompleted = false,
  isPending = false,
  onTeamClick
}) {
  const config = ROUND_CONFIG[round] || ROUND_CONFIG['Round of 16']

  // Get winners from this round
  const winners = matches
    .filter(m => m.isFinished || m.state === 'FINISHED')
    .map(m => {
      const winnerId = m.winnerId || m.winner?.id
      if (winnerId) {
        if (m.homeTeam?.id === winnerId) return m.homeTeam
        if (m.awayTeam?.id === winnerId) return m.awayTeam
      }
      const homeScore = Number(m.score?.home ?? 0)
      const awayScore = Number(m.score?.away ?? 0)
      const homePens = Number(m.penaltyScore?.home ?? 0)
      const awayPens = Number(m.penaltyScore?.away ?? 0)

      // Check if there's an outright winner (either by regular score or penalties)
      if (homeScore > awayScore) return m.homeTeam
      if (awayScore > homeScore) return m.awayTeam

      // Scores are tied - check penalties (only if penalties were actually taken)
      if (homePens > 0 || awayPens > 0) {
        if (homePens > awayPens) return m.homeTeam
        if (awayPens > homePens) return m.awayTeam
      }

      // No clear winner (draw - shouldn't happen in knockout)
      return null
    })
    .filter(Boolean) // Remove null entries (draws)

  return (
    <div className={`
      rounded-2xl border overflow-hidden transition-all duration-300
      ${isCurrentRound
        ? 'border-primary/40 shadow-lg shadow-primary/10 glow-primary'
        : isCompleted
          ? 'border-border bg-card/50'
          : 'border-border/50 bg-card/30'}
    `}>
      {/* Round Header */}
      <div className={`
        px-5 py-4 bg-gradient-to-r ${config.color}
        flex items-center justify-between
      `}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{config.icon}</span>
          <div>
            <h3 className="font-bold text-text text-lg">{round}</h3>
            <p className="text-sm text-text-muted">
              {config.matches} {config.matches === 1 ? 'match' : 'matches'}
            </p>
          </div>
        </div>

        {/* Status Badge */}
        {isCurrentRound && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-live/20 border border-live/30">
            <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
            <span className="text-sm font-bold text-live">LIVE</span>
          </div>
        )}
        {isCompleted && !isCurrentRound && (
          <div className="px-3 py-1.5 rounded-full bg-primary/20 text-primary text-sm font-semibold">
            Complete
          </div>
        )}
        {isPending && (
          <div className="px-3 py-1.5 rounded-full bg-card-hover text-text-muted text-sm">
            Upcoming
          </div>
        )}
      </div>

      {/* Matches Grid */}
      <div className={`p-4 ${matches.length > 2 ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-3'}`}>
        {matches.length > 0 ? (
          matches.map((match, idx) => (
            <MatchCard
              key={match.fixtureId || idx}
              match={match}
              isCurrentRound={isCurrentRound}
              onTeamClick={onTeamClick}
            />
          ))
        ) : (
          <div className="text-center py-6 text-text-muted">
            <p>Waiting for previous round to complete...</p>
          </div>
        )}
      </div>

      {/* Winners Summary (for completed rounds) */}
      {isCompleted && winners.length > 0 && (
        <div className="px-4 pb-4">
          <div className="bg-card-hover/50 rounded-xl p-3">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Advanced to next round</p>
            <div className="flex flex-wrap gap-2">
              {winners.map((team, idx) => (
                <button
                  key={team?.id || idx}
                  onClick={() => onTeamClick?.(team)}
                  className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  {team?.name || 'TBD'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MatchCard({ match, isCurrentRound, onTeamClick }) {
  const { fixtureId, state, minute, score, penaltyScore, homeTeam, awayTeam } = match

  // Determine if match has scores (even 0-0 counts as having a score)
  const hasScore = score?.home != null || score?.away != null
  // Only trust explicit FINISHED state - backend handles extra time and penalties
  const isFinished = state === 'FINISHED' || match.isFinished === true

  // Get state config - use actual state from backend
  // Special handling: if match is SCHEDULED but we're in the current round,
  // it means the round just started and matches should be starting soon
  const getStateConfig = () => {
    if (MATCH_STATE_LABELS[state]) {
      // Override SCHEDULED label if this is the current round or has any score
      if (state === 'SCHEDULED') {
        // If we're in the current round, show "Starting..." instead of "Upcoming"
        if (isCurrentRound) {
          return { label: 'Starting...', color: 'text-amber-400 bg-amber-500/20', live: false }
        }
        // If it has a score (even 0-0), it's actually live
        if (hasScore) {
          return { label: 'Live', color: 'text-live bg-live/20', live: true }
        }
      }
      return MATCH_STATE_LABELS[state]
    }
    if (isFinished) return MATCH_STATE_LABELS.FINISHED
    // If match has scores but unknown state, show as in progress
    if (hasScore) return { label: 'Live', color: 'text-live bg-live/20', live: true }
    return MATCH_STATE_LABELS.SCHEDULED
  }
  const stateConfig = getStateConfig()
  const isLive = stateConfig.live

  const homeWon = isFinished && (
    (score?.home > score?.away) ||
    (score?.home === score?.away && penaltyScore?.home > penaltyScore?.away)
  )
  const awayWon = isFinished && (
    (score?.away > score?.home) ||
    (score?.home === score?.away && penaltyScore?.away > penaltyScore?.home)
  )

  return (
    <Link
      to={`/live/${fixtureId}`}
      className={`
        block p-4 rounded-xl border transition-all duration-200
        ${isLive
          ? 'bg-card border-live/30 shadow-md shadow-live/10 hover:shadow-lg hover:shadow-live/20'
          : 'bg-card border-border hover:border-primary/30'}
      `}
    >
      {/* Status Bar */}
      <div className="flex items-center justify-between mb-3">
        <span className={`
          inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold
          ${stateConfig.color}
        `}>
          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />}
          {isLive && minute !== undefined ? `${minute}'` : stateConfig.label}
        </span>

        {(penaltyScore?.home > 0 || penaltyScore?.away > 0) && (
          <span className="text-xs text-text-muted">
            Pens: {penaltyScore.home}-{penaltyScore.away}
          </span>
        )}
      </div>

      {/* Teams & Score */}
      <div className="space-y-2">
        {/* Home Team */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={(e) => { e.preventDefault(); onTeamClick?.(homeTeam); }}
            className={`
              flex-1 text-left font-medium truncate transition-colors
              ${homeWon ? 'text-primary' : isFinished && awayWon ? 'text-text-muted' : 'text-text'}
              hover:text-primary
            `}
          >
            {homeWon && <span className="mr-1">✓</span>}
            {homeTeam?.name || 'TBD'}
          </button>
          <span className={`
            score-display text-xl
            ${homeWon ? 'text-primary' : isFinished && awayWon ? 'text-text-muted' : 'text-text'}
          `}>
            {score?.home ?? '-'}
          </span>
        </div>

        {/* Away Team */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={(e) => { e.preventDefault(); onTeamClick?.(awayTeam); }}
            className={`
              flex-1 text-left font-medium truncate transition-colors
              ${awayWon ? 'text-primary' : isFinished && homeWon ? 'text-text-muted' : 'text-text'}
              hover:text-primary
            `}
          >
            {awayWon && <span className="mr-1">✓</span>}
            {awayTeam?.name || 'TBD'}
          </button>
          <span className={`
            score-display text-xl
            ${awayWon ? 'text-primary' : isFinished && homeWon ? 'text-text-muted' : 'text-text'}
          `}>
            {score?.away ?? '-'}
          </span>
        </div>
      </div>
    </Link>
  )
}


