import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import useLiveStore from '../stores/useLiveStore'
import useLiveEvents from '../hooks/useLiveEvents'
import LoadingSpinner from '../components/common/LoadingSpinner'
import { useToast } from '../components/common/Toast'
import { isTournamentPlayingState, isTournamentBreakLikeState } from '../utils/tournamentPhases'

const ROUNDS_ORDER = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

const ROUND_NORMALIZATION = [
  { keys: ['roundof16', 'r16', 'round16', 'roundofsixteen'], value: 'Round of 16' },
  { keys: ['quarterfinals', 'quarter-finals', 'quarterfinal', 'quarter-finals', 'quarterfinals', 'quarter finals', 'qf'], value: 'Quarter-finals' },
  { keys: ['semifinals', 'semi-finals', 'semifinal', 'semi final', 'sf'], value: 'Semi-finals' },
  { keys: ['final', 'finals'], value: 'Final' },
]

function normalizeRound(name) {
  if (!name) return null
  const key = name.toString().toLowerCase().replace(/[\s-]/g, '')
  const found = ROUND_NORMALIZATION.find(entry => entry.keys.includes(key))
  return found ? found.value : null
}

const MATCH_STATE_CONFIG = {
  SCHEDULED: { label: 'Upcoming', color: 'bg-card-hover text-text-muted', dot: 'bg-text-muted' },
  FIRST_HALF: { label: '1H', color: 'bg-live/20 text-live', dot: 'bg-live', live: true },
  HALFTIME: { label: 'HT', color: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400' },
  SECOND_HALF: { label: '2H', color: 'bg-live/20 text-live', dot: 'bg-live', live: true },
  EXTRA_TIME_1: { label: 'ET1', color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-400', live: true },
  ET_HALFTIME: { label: 'ET-HT', color: 'bg-amber-500/20 text-amber-400', dot: 'bg-amber-400' },
  EXTRA_TIME_2: { label: 'ET2', color: 'bg-orange-500/20 text-orange-400', dot: 'bg-orange-400', live: true },
  PENALTIES: { label: 'PENS', color: 'bg-live/20 text-live', dot: 'bg-live', live: true },
  FINISHED: { label: 'FT', color: 'bg-primary/20 text-primary', dot: 'bg-primary' },
}

const TOURNAMENT_STATE_TO_ROUND = {
  ROUND_OF_16: 'Round of 16',
  QF_BREAK: 'Quarter-finals',
  QUARTER_FINALS: 'Quarter-finals',
  SF_BREAK: 'Semi-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL_BREAK: 'Final',
  FINAL: 'Final',
}

export default function FixtureList() {
  const { addToast } = useToast()
  
  const {
    tournament,
    fixtures,
    matches,
    completedMatches,
    lastCompletedTournament,
    lastCompletedFixtures,
    upcomingFixtures,
    error,
    isLoading,
    isInitialLoad,
    fetchSnapshot,
    handleEvent,
  } = useLiveStore()

  // Handle SSE events
  const onEvent = useCallback((event) => {
    handleEvent(event)
    
    if (event.type === 'goal') {
      const teamName = event.homeTeam?.id === event.teamId ? event.homeTeam?.name : event.awayTeam?.name
      addToast(`⚽ GOAL! ${event.displayName || ''} - ${teamName || ''}`, 'goal', 4000)
    } else if (event.type === 'match_end') {
      addToast(`🏁 Full Time: ${event.homeTeam?.name} ${event.score?.home}-${event.score?.away} ${event.awayTeam?.name}`, 'info', 5000)
    }
  }, [handleEvent, addToast])

  // Connect to SSE
  const { connected } = useLiveEvents({
    tournamentId: tournament?.tournamentId,
    onEvent,
    enabled: true,
  })

  // Fetch and poll for updates
  useEffect(() => {
    fetchSnapshot().catch(() => {})
    
    const pollInterval = setInterval(() => {
      fetchSnapshot().catch(() => {})
    }, 8000) // Poll every 8 seconds

    return () => clearInterval(pollInterval)
  }, [fetchSnapshot])

  // Determine if we're in a waiting state (SETUP/IDLE)
  const isWaitingState = !tournament?.state || tournament?.state === 'IDLE' || tournament?.state === 'SETUP'
  
  // For display purposes, prefer showing last completed tournament during waiting states
  const displayTournament = isWaitingState && lastCompletedTournament 
    ? lastCompletedTournament 
    : tournament

  // Use fixtures from current tournament, or fall back to last completed
  const baseFixtures = fixtures.length > 0 
    ? fixtures 
    : (lastCompletedFixtures?.length > 0 ? lastCompletedFixtures : [])
  const allMatches = baseFixtures.length > 0 
    ? baseFixtures 
    : [...(completedMatches || []), ...(matches || [])]

  // Debug logging
  useEffect(() => {
    console.log('[Fixtures] State:', {
      tournamentState: tournament?.state,
      tournamentId: tournament?.tournamentId,
      fixtures: fixtures?.length,
      lastCompletedFixtures: lastCompletedFixtures?.length,
      activeMatches: matches?.length,
      completedMatches: completedMatches?.length,
      totalMatches: allMatches.length,
      upcomingFixtures: upcomingFixtures?.length,
      isWaitingState,
    })
  }, [tournament, fixtures, lastCompletedFixtures, matches, completedMatches, allMatches.length, upcomingFixtures, isWaitingState])
  
  const currentRoundFromApi = normalizeRound(
    tournament?.currentRound ?? tournament?.currentRoundName ?? tournament?.currentRoundKey
  )
  const currentRound =
    currentRoundFromApi || normalizeRound(TOURNAMENT_STATE_TO_ROUND[tournament?.state])
  const isRoundActive = isTournamentPlayingState(tournament?.state)
  const isBreak =
    isTournamentBreakLikeState(tournament?.state) ||
    tournament?.state === 'ROUND_COMPLETE' ||
    tournament?.state?.includes('BREAK')

  const nextRound = normalizeRound(
    getNextRound(tournament?.state, tournament?.currentRound ?? tournament?.currentRoundName)
  )

  // Group matches by round
  const matchesByRound = ROUNDS_ORDER.reduce((acc, round) => {
    acc[round] = []
    return acc
  }, {})

  allMatches.forEach(match => {
    const round = normalizeRound(match?.round)
    if (round && matchesByRound[round]) {
      matchesByRound[round].push(match)
    }
  })

  // Add upcoming fixtures to next round if available
  if (nextRound && upcomingFixtures?.length > 0) {
    matchesByRound[nextRound] = [...(matchesByRound[nextRound] || []), ...upcomingFixtures.filter(f => 
      !matchesByRound[nextRound]?.some(m => m.fixtureId == f.fixtureId || String(m.fixtureId) === String(f.fixtureId))
    )]
  }

  // Calculate stats
  const liveMatches = allMatches.filter(m => MATCH_STATE_CONFIG[m.state]?.live)
  const completedCount = allMatches.filter(m => m.state === 'FINISHED' || m.isFinished).length
  const totalGoals = allMatches.reduce((sum, m) => sum + (m.score?.home || 0) + (m.score?.away || 0), 0)

  // Find current round index
  const currentRoundIndex = currentRound ? ROUNDS_ORDER.indexOf(currentRound) : -1
  const nextRoundIndex = nextRound ? ROUNDS_ORDER.indexOf(nextRound) : -1
  const activeRoundIndex = isRoundActive ? currentRoundIndex : nextRoundIndex

  if (isInitialLoad && isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center py-20">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-text-muted">Loading championship...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Championship Header */}
      <div className="bg-gradient-to-br from-card via-card to-primary/5 rounded-3xl border border-border p-6 mb-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-3 mb-2">
              <span className="text-3xl">🏆</span>
              <h1 className="text-2xl font-bold text-text">Championship</h1>
              {connected && (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/20 text-primary text-xs font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            <p className="text-text-muted">
              {tournament?.tournamentId 
                ? `Tournament #${tournament.tournamentId}`
                : 'Waiting for tournament...'}
              {tournament?.state && ` • ${formatTournamentState(tournament.state)}`}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex gap-4">
            <QuickStat value={liveMatches.length} label="Live" icon="🔴" highlight={liveMatches.length > 0} />
            <QuickStat value={completedCount} label="Played" icon="✅" />
            <QuickStat value={totalGoals} label="Goals" icon="⚽" />
          </div>
        </div>

        {/* Round Progress Bar */}
        <div className="mt-6 flex items-center justify-between gap-2">
          {ROUNDS_ORDER.map((round, idx) => {
            const roundMatches = matchesByRound[round] || []
            const isComplete = roundMatches.length > 0 && roundMatches.every(m => m.state === 'FINISHED' || m.isFinished)
            const isCurrent = currentRound === round && isRoundActive
            const isNext = nextRound === round
            const hasMatches = roundMatches.length > 0

            return (
              <div key={round} className="flex-1 flex items-center gap-2">
                <div className={`
                  flex-1 h-2 rounded-full transition-all
                  ${isComplete ? 'bg-primary' : 
                    isCurrent ? 'bg-live animate-pulse' : 
                    isNext ? 'bg-amber-500/50' : 
                    'bg-border'}
                `} />
                {idx < ROUNDS_ORDER.length - 1 && (
                  <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-primary' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-text-muted">
          {ROUNDS_ORDER.map(round => (
            <span key={round} className="text-center flex-1">{round.replace('Quarter-finals', 'QF').replace('Semi-finals', 'SF').replace('Round of 16', 'R16')}</span>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-live/10 border border-live/20">
          <div className="flex items-center justify-between">
            <p className="text-live text-sm">{error}</p>
            <button onClick={() => fetchSnapshot()} className="btn btn-secondary text-xs">Retry</button>
          </div>
        </div>
      )}


      {/* Current/Next Round - Featured Section (only show if we have matches or if actively playing) */}
      {(isRoundActive || (isBreak && (allMatches.length > 0 || upcomingFixtures?.length > 0))) && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            {isRoundActive && <span className="w-3 h-3 rounded-full bg-live animate-pulse" />}
            <h2 className="text-xl font-bold text-text">
              {isRoundActive ? `🔴 ${currentRound} - Live` : `📋 ${nextRound || 'Next Round'} - Coming Up`}
            </h2>
          </div>

          <div className={`
            rounded-2xl border p-4
            ${isRoundActive ? 'bg-card border-live/30 shadow-lg shadow-live/10' : 'bg-card border-border'}
          `}>
            {(() => {
              const roundToShow = isRoundActive ? currentRound : nextRound
              const roundMatches = matchesByRound[roundToShow] || []
              
              // During breaks, if no matches for next round, show upcoming fixtures if available
              if (roundMatches.length === 0 && !isRoundActive && upcomingFixtures?.length > 0) {
                return (
                  <div className={`grid gap-3 ${
                    upcomingFixtures.length === 1 ? 'max-w-lg mx-auto' :
                    upcomingFixtures.length === 2 ? 'sm:grid-cols-2' :
                    'sm:grid-cols-2 lg:grid-cols-4'
                  }`}>
                    {upcomingFixtures.map((match, idx) => (
                      <UpcomingMatchCard key={match.fixtureId || idx} match={match} />
                    ))}
                  </div>
                )
              }
              
              if (roundMatches.length === 0) {
                return (
                  <div className="text-center py-8 text-text-muted">
                    <span className="text-4xl block mb-2">{isBreak ? '☕' : '⏳'}</span>
                    <p>{isBreak ? 'Fixtures will appear when the round starts' : 'Waiting for matches...'}</p>
                  </div>
                )
              }

              return (
                <div className={`grid gap-3 ${
                  roundMatches.length === 1 ? 'max-w-lg mx-auto' :
                  roundMatches.length === 2 ? 'sm:grid-cols-2' :
                  'sm:grid-cols-2 lg:grid-cols-4'
                }`}>
                  {roundMatches.map((match, idx) => (
                    <MatchCard key={match.fixtureId || idx} match={match} featured />
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* Coming Up Next - Show next round fixtures during active rounds */}
      {isRoundActive && nextRound && upcomingFixtures?.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">📋</span>
            <h2 className="text-xl font-bold text-text">
              Coming Up: {nextRound}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold">
              Next Round
            </span>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-card/50 p-4">
            <div className={`grid gap-3 ${
              upcomingFixtures.length === 1 ? 'max-w-lg mx-auto' :
              upcomingFixtures.length === 2 ? 'sm:grid-cols-2' :
              'sm:grid-cols-2 lg:grid-cols-4'
            }`}>
              {upcomingFixtures.map((match, idx) => (
                <UpcomingMatchCard key={match.fixtureId || idx} match={match} />
              ))}
            </div>
            <p className="text-center text-xs text-text-muted mt-4">
              These matches will start after the current round completes
            </p>
          </div>
        </div>
      )}

      {/* Show last tournament results during SETUP/IDLE if we have them */}
      {isWaitingState && lastCompletedTournament && allMatches.length > 0 && (
        <div className="mb-8 bg-gradient-to-br from-primary/5 via-card to-primary/5 rounded-2xl border border-primary/20 p-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xl">🏆</span>
            <h2 className="text-lg font-bold text-text">
              Previous Tournament #{lastCompletedTournament.tournamentId}
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
              Complete
            </span>
          </div>
          {lastCompletedTournament.winner && (
            <p className="text-sm text-text-muted mb-2">
              Winner: <span className="text-primary font-semibold">{lastCompletedTournament.winner?.name || lastCompletedTournament.winner}</span>
              {lastCompletedTournament.runnerUp && (
                <> • Runner-up: {lastCompletedTournament.runnerUp?.name || lastCompletedTournament.runnerUp}</>
              )}
            </p>
          )}
        </div>
      )}

      {/* Tournament Winner */}
      {tournament?.winner && (
        <div className="mb-8 bg-gradient-to-br from-gold/10 via-card to-gold/10 rounded-2xl border border-gold/30 p-6 text-center">
          <span className="text-5xl mb-3 block">🏆</span>
          <p className="text-gold text-sm font-semibold uppercase tracking-wider mb-1">Champion</p>
          <h3 className="text-2xl font-bold text-text mb-1">
            {tournament.winner?.name || tournament.winner}
          </h3>
          {tournament.runnerUp && (
            <p className="text-text-muted text-sm">
              Runner-up: {tournament.runnerUp?.name || tournament.runnerUp}
            </p>
          )}
        </div>
      )}

      {/* Previous Rounds Results - only show if we have matches */}
      {allMatches.length > 0 && (
      <div className="space-y-6">
        <h2 className="text-lg font-bold text-text-muted uppercase tracking-wider">
          All Rounds
        </h2>

        {[...ROUNDS_ORDER].reverse().map((round, roundIdx) => {
          const roundMatches = matchesByRound[round] || []
          const isCurrentlyFeatured = (isRoundActive && currentRound === round) || (!isRoundActive && nextRound === round)
          
          // Skip if already shown in featured section and has matches
          if (isCurrentlyFeatured && roundMatches.length > 0) return null

          const isComplete = roundMatches.length > 0 && roundMatches.every(m => m.state === 'FINISHED' || m.isFinished)
          const hasLive = roundMatches.some(m => MATCH_STATE_CONFIG[m.state]?.live)

          return (
            <div 
              key={round}
              className={`
                rounded-2xl border overflow-hidden
                ${hasLive ? 'border-live/30' : isComplete ? 'border-primary/20' : 'border-border'}
              `}
            >
              {/* Round Header */}
              <div className={`
                px-4 py-3 flex items-center justify-between
                ${hasLive ? 'bg-live/10' : isComplete ? 'bg-primary/5' : 'bg-card-hover/50'}
              `}>
                <div className="flex items-center gap-3">
                  <span className="text-xl">{getRoundIcon(round)}</span>
                  <h3 className="font-bold text-text">{round}</h3>
                  {hasLive && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-live/20 text-live text-xs font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-live animate-pulse" />
                      LIVE
                    </span>
                  )}
                  {isComplete && !hasLive && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-semibold">
                      Complete
                    </span>
                  )}
                </div>
                <span className="text-sm text-text-muted">
                  {roundMatches.length} {roundMatches.length === 1 ? 'match' : 'matches'}
                </span>
              </div>

              {/* Matches */}
              <div className="p-4">
                {roundMatches.length === 0 ? (
                  <div className="text-center py-6 text-text-muted">
                    <p>Waiting for previous round to complete...</p>
                  </div>
                ) : (
                  <div className={`grid gap-3 ${
                    roundMatches.length === 1 ? 'max-w-lg mx-auto' :
                    roundMatches.length === 2 ? 'sm:grid-cols-2' :
                    'sm:grid-cols-2 lg:grid-cols-4'
                  }`}>
                    {roundMatches.map((match, idx) => (
                      <MatchCard key={match.fixtureId || idx} match={match} />
                    ))}
                  </div>
                )}
              </div>

              {/* Winners Summary */}
              {isComplete && roundMatches.length > 0 && (
                <div className="px-4 pb-4">
                  <div className="bg-primary/5 rounded-xl p-3">
                    <p className="text-xs text-text-muted mb-2">
                      {round === 'Final' ? '🏆 Winner' : '➡️ Advanced'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {roundMatches.map((m, idx) => {
                        const winner = getMatchWinner(m)
                        return winner ? (
                          <span key={idx} className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                            {winner}
                          </span>
                        ) : null
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}

      {/* No Tournament/Waiting State */}
      {(!tournament || tournament?.state === 'IDLE' || (tournament?.state === 'SETUP' && allMatches.length === 0)) && (
        <div className="text-center py-12 bg-card rounded-2xl border border-border">
          <span className="text-6xl block mb-4">{tournament?.state === 'SETUP' ? '🏟️' : '⏳'}</span>
          <h3 className="text-xl font-bold text-text mb-2">
            {tournament?.state === 'SETUP' ? 'Tournament Starting Soon' : 'Waiting for Tournament'}
          </h3>
          <p className="text-text-muted mb-4">
            {tournament?.state === 'SETUP' 
              ? 'Round of 16 fixtures will appear shortly when generated by the backend'
              : 'The next tournament starts 5 minutes after the previous one finishes'}
          </p>
          <div className="flex justify-center gap-4">
            <Link to="/live" className="btn btn-primary">
              Go to Live Dashboard
            </Link>
          </div>
          {tournament?.tournamentId && (
            <p className="text-xs text-text-muted mt-4">
              Tournament #{tournament.tournamentId}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// Helper Components
function QuickStat({ value, label, icon, highlight }) {
  return (
    <div className={`text-center px-3 py-2 rounded-xl ${highlight ? 'bg-live/10' : 'bg-card-hover/50'}`}>
      <span className="text-sm">{icon}</span>
      <p className={`text-xl font-bold ${highlight ? 'text-live' : 'text-text'}`}>{value}</p>
      <p className="text-xs text-text-muted">{label}</p>
    </div>
  )
}

function MatchCard({ match, featured = false }) {
  const { fixtureId, state, minute, score, penaltyScore, homeTeam, awayTeam } = match
  
  // Determine if match is finished - only trust explicit FINISHED state from backend
  // The backend handles extra time and penalties, so we must wait for actual FINISHED state
  const hasScore = score?.home != null || score?.away != null
  const isFinished = state === 'FINISHED' || match.isFinished === true
  
  // Get state config - use actual state from backend, don't assume finished just because there's a score
  const getStateConfig = () => {
    if (MATCH_STATE_CONFIG[state]) return MATCH_STATE_CONFIG[state]
    // Only mark as finished if explicitly finished
    if (isFinished) return MATCH_STATE_CONFIG.FINISHED
    // If match has scores but unknown state, show as in progress (not finished!)
    if (hasScore) return { label: 'Live', color: 'bg-live/20 text-live', dot: 'bg-live', live: true }
    return MATCH_STATE_CONFIG.SCHEDULED
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
        block p-3 rounded-xl border transition-all
        ${isLive 
          ? 'bg-card border-live/40 shadow-md shadow-live/10' 
          : 'bg-card border-border hover:border-primary/30'}
        ${featured ? 'p-4' : ''}
      `}
    >
      {/* Status */}
      <div className="flex items-center justify-between mb-2">
        <span className={`
          inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold
          ${stateConfig.color}
        `}>
          {isLive && <span className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot} animate-pulse`} />}
          {isLive && minute !== undefined ? `${minute}'` : stateConfig.label}
        </span>
        
        {(penaltyScore?.home > 0 || penaltyScore?.away > 0) && (
          <span className="text-xs text-text-muted">
            P: {penaltyScore.home}-{penaltyScore.away}
          </span>
        )}
      </div>

      {/* Teams & Score */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`
            flex-1 text-sm font-medium truncate
            ${homeWon ? 'text-primary' : isFinished && awayWon ? 'text-text-muted' : 'text-text'}
          `}>
            {homeWon && '✓ '}{homeTeam?.name || 'TBD'}
          </span>
          <span className={`
            text-lg font-bold font-mono min-w-[24px] text-right
            ${homeWon ? 'text-primary' : isFinished && awayWon ? 'text-text-muted' : 'text-text'}
            ${isLive ? 'animate-pulse' : ''}
          `}>
            {score?.home ?? '-'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className={`
            flex-1 text-sm font-medium truncate
            ${awayWon ? 'text-primary' : isFinished && homeWon ? 'text-text-muted' : 'text-text'}
          `}>
            {awayWon && '✓ '}{awayTeam?.name || 'TBD'}
          </span>
          <span className={`
            text-lg font-bold font-mono min-w-[24px] text-right
            ${awayWon ? 'text-primary' : isFinished && homeWon ? 'text-text-muted' : 'text-text'}
            ${isLive ? 'animate-pulse' : ''}
          `}>
            {score?.away ?? '-'}
          </span>
        </div>
      </div>
    </Link>
  )
}

// Upcoming match card - styled differently to indicate these are scheduled
function UpcomingMatchCard({ match }) {
  const { fixtureId, homeTeam, awayTeam } = match

  return (
    <Link
      to={`/live/${fixtureId}`}
      className="block p-3 rounded-xl border border-amber-500/20 bg-card/80 hover:border-amber-500/40 transition-all"
    >
      {/* Status */}
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400">
          Scheduled
        </span>
      </div>

      {/* Teams */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="flex-1 text-sm font-medium truncate text-text">
            {homeTeam?.name || 'TBD'}
          </span>
          <span className="text-lg font-bold font-mono min-w-[24px] text-right text-text-muted">
            -
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="flex-1 text-sm font-medium truncate text-text">
            {awayTeam?.name || 'TBD'}
          </span>
          <span className="text-lg font-bold font-mono min-w-[24px] text-right text-text-muted">
            -
          </span>
        </div>
      </div>
    </Link>
  )
}

// Helper Functions
function getNextRound(state, currentRoundName) {
  const fromApi = normalizeRound(
    typeof currentRoundName === 'object' ? currentRoundName?.name : currentRoundName
  )
  if (fromApi) {
    const idx = ROUNDS_ORDER.indexOf(fromApi)
    if (idx >= 0 && idx < ROUNDS_ORDER.length - 1) return ROUNDS_ORDER[idx + 1]
  }
  const map = {
    SETUP: 'Round of 16',
    ROUND_ACTIVE: null,
    ROUND_COMPLETE: null,
    INTER_ROUND_DELAY: null,
    ROUND_OF_16: 'Quarter-finals',
    QF_BREAK: 'Quarter-finals',
    QUARTER_FINALS: 'Semi-finals',
    SF_BREAK: 'Semi-finals',
    SEMI_FINALS: 'Final',
    FINAL_BREAK: 'Final',
  }
  return map[state] || null
}

function getRoundIcon(round) {
  const icons = {
    'Round of 16': '🏟️',
    'Quarter-finals': '🔥',
    'Semi-finals': '⚡',
    'Final': '🏆',
  }
  return icons[round] || '📋'
}

function formatTournamentState(state) {
  const labels = {
    IDLE: 'Waiting',
    SETUP: 'Starting Soon',
    ROUND_ACTIVE: 'Live round',
    ROUND_COMPLETE: 'Round complete',
    INTER_ROUND_DELAY: 'Inter-round break',
    ROUND_OF_16: 'Round of 16',
    QF_BREAK: 'QF Starting',
    QUARTER_FINALS: 'Quarter-Finals',
    SF_BREAK: 'SF Starting',
    SEMI_FINALS: 'Semi-Finals',
    FINAL_BREAK: 'Final Starting',
    FINAL: 'The Final',
    RESULTS: 'Complete',
    COMPLETE: 'Complete',
  }
  return labels[state] || state
}

function getMatchWinner(match) {
  if (match.state !== 'FINISHED' && !match.isFinished) return null

  // Prefer explicit winnerId if provided by backend
  const winnerId = match.winnerId || match.winner?.id
  if (winnerId) {
    if (match.homeTeam?.id === winnerId) return match.homeTeam?.name
    if (match.awayTeam?.id === winnerId) return match.awayTeam?.name
  }
  
  const homeScore = Number(match.score?.home ?? 0)
  const awayScore = Number(match.score?.away ?? 0)
  const homePens = Number(match.penaltyScore?.home ?? 0)
  const awayPens = Number(match.penaltyScore?.away ?? 0)
  
  // Check if there's an outright winner (either by regular score or penalties)
  if (homeScore > awayScore) return match.homeTeam?.name
  if (awayScore > homeScore) return match.awayTeam?.name
  
  // Scores are tied - check penalties (only if penalties were actually taken)
  if (homePens > 0 || awayPens > 0) {
    if (homePens > awayPens) return match.homeTeam?.name
    if (awayPens > homePens) return match.awayTeam?.name
  }
  
  // No clear winner (shouldn't happen in knockout, but return null for safety)
  return null
}
