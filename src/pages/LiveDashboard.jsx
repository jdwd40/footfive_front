import { useEffect, useCallback, useState, useRef } from 'react'
import useLiveStore from '../stores/useLiveStore'
import useLiveEvents from '../hooks/useLiveEvents'
import { liveApi } from '../api/client'
import RoundSection from '../components/live/RoundSection'
import TeamStatsPanel from '../components/live/TeamStatsPanel'
import WinnerCelebration from '../components/live/WinnerCelebration'
import GoalTicker from '../components/live/GoalTicker'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorDisplay from '../components/common/ErrorDisplay'
import { useToast } from '../components/common/Toast'

const ROUNDS = ['Round of 16', 'Quarter-finals', 'Semi-finals', 'Final']

const ROUND_NORMALIZATION = [
  { keys: ['roundof16', 'r16', 'round16', 'roundofsixteen'], value: 'Round of 16' },
  { keys: ['quarterfinals', 'quarter-finals', 'quarterfinal', 'quarter finals', 'qf'], value: 'Quarter-finals' },
  { keys: ['semifinals', 'semi-finals', 'semifinal', 'semi finals', 'sf'], value: 'Semi-finals' },
  { keys: ['final', 'finals'], value: 'Final' },
]

function normalizeRound(name) {
  if (!name) return null
  const key = name.toString().toLowerCase().replace(/[\s-]/g, '')
  const found = ROUND_NORMALIZATION.find(entry => entry.keys.includes(key))
  return found ? found.value : null
}

const TOURNAMENT_STATE_CONFIG = {
  IDLE: { title: 'Waiting for Tournament', subtitle: 'Next tournament starts 5 minutes after the previous one', icon: '⏰', phase: 'idle' },
  SETUP: { title: 'Tournament Starting', subtitle: 'Teams are being shuffled...', icon: '🎲', phase: 'setup' },
  ROUND_OF_16: { title: 'Round of 16', subtitle: '16 teams battle for 8 spots', icon: '🏟️', phase: 'Round of 16' },
  QF_BREAK: { title: 'Quarter-Finals Starting', subtitle: 'Brief intermission...', icon: '☕', phase: 'break' },
  QUARTER_FINALS: { title: 'Quarter-Finals', subtitle: '8 teams fight for the semis', icon: '🔥', phase: 'Quarter-finals' },
  SF_BREAK: { title: 'Semi-Finals Starting', subtitle: 'Brief intermission...', icon: '☕', phase: 'break' },
  SEMI_FINALS: { title: 'Semi-Finals', subtitle: '4 teams remain', icon: '⚡', phase: 'Semi-finals' },
  FINAL_BREAK: { title: 'The Final Awaits', subtitle: 'Who will lift the trophy?', icon: '🏆', phase: 'break' },
  FINAL: { title: 'THE FINAL', subtitle: 'The ultimate showdown', icon: '🏆', phase: 'Final' },
  RESULTS: { title: 'Tournament Complete', subtitle: 'Champion crowned!', icon: '👑', phase: 'complete' },
  COMPLETE: { title: 'Tournament Complete', subtitle: 'Next tournament in 5 minutes', icon: '🎉', phase: 'complete' },
}

// Map state to current round
const STATE_TO_ROUND = {
  ROUND_OF_16: 'Round of 16',
  QF_BREAK: 'Quarter-finals',
  QUARTER_FINALS: 'Quarter-finals',
  SF_BREAK: 'Semi-finals',
  SEMI_FINALS: 'Semi-finals',
  FINAL_BREAK: 'Final',
  FINAL: 'Final',
}

// Auto-cycle: Duration for each phase (2.5 minutes)
const AUTO_CYCLE_DURATION = 150000

export default function LiveDashboard() {
  const { addToast } = useToast()
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [showTeamPanel, setShowTeamPanel] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const [celebrationShown, setCelebrationShown] = useState(false)

  // Auto-cycle state for automatic tournament restart
  const [autoCyclePhase, setAutoCyclePhase] = useState(null) // null | 'WINNER_DISPLAY' | 'STARTING_TOURNAMENT' | 'FIXTURES_PREVIEW'
  const [autoCycleCountdown, setAutoCycleCountdown] = useState(0)
  const autoCyclePhaseStartRef = useRef(null)
  const autoCycledTournamentIdRef = useRef(null)

  const {
    tournament,
    fixtures,
    matches,
    completedMatches,
    lastCompletedTournament,
    lastCompletedFixtures,
    recentEvents,
    connected,
    connecting,
    error,
    isLoading,
    isInitialLoad,
    fetchSnapshot,
    handleEvent,
  } = useLiveStore()

  // Handle incoming SSE events
  const onEvent = useCallback((event) => {
    console.log('[LiveDashboard] SSE Event received:', event.type, event)
    handleEvent(event)

    // Show celebration for tournament winner
    if (event.type === 'tournament_end') {
      setShowCelebration(true)
    }
  }, [handleEvent])

  // Debug: Log recentEvents changes
  useEffect(() => {
    if (recentEvents.length > 0) {
      console.log('[LiveDashboard] recentEvents updated:', recentEvents.length, 'events', recentEvents.slice(-3))
    }
  }, [recentEvents])

  // Connect to SSE stream
  const {
    connected: sseConnected,
    connecting: sseConnecting,
    reconnect
  } = useLiveEvents({
    tournamentId: tournament?.tournamentId,
    onEvent,
    enabled: true,
  })

  // Fetch initial snapshot and poll for updates
  useEffect(() => {
    // Initial fetch
    fetchSnapshot().catch(err => {
      console.error('Failed to fetch snapshot:', err)
    })

    // Poll every 10 seconds to keep data fresh
    const pollInterval = setInterval(() => {
      fetchSnapshot().catch(err => {
        console.error('Poll failed:', err)
      })
    }, 10000)

    return () => clearInterval(pollInterval)
  }, [fetchSnapshot])

  // Poll for recent events as fallback for SSE (since SSE might not deliver all events)
  const lastEventSeqRef = useRef(0)
  useEffect(() => {
    const isLiveRound = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'].includes(tournament?.state)
    if (!isLiveRound) return

    const pollRecentEvents = async () => {
      try {
        const data = await liveApi.getRecentEvents({ limit: 20 })
        const events = data.events || []

        // Process new events that we haven't seen yet
        events.forEach(event => {
          const seq = event.seq || 0
          if (seq > lastEventSeqRef.current) {
            console.log('[LiveDashboard] Polled event:', event.type, event)
            onEvent(event)
            lastEventSeqRef.current = seq
          }
        })
      } catch (err) {
        console.error('Failed to poll events:', err)
      }
    }

    // Poll every 2 seconds for events during live rounds
    const eventPollInterval = setInterval(pollRecentEvents, 2000)
    pollRecentEvents() // Initial poll

    return () => clearInterval(eventPollInterval)
  }, [tournament?.state, onEvent])

  // Update store connection state from SSE
  useEffect(() => {
    useLiveStore.setState({ connected: sseConnected, connecting: sseConnecting })
  }, [sseConnected, sseConnecting])

  // Force refresh when entering a new live round - ensures all matches display simultaneously
  const prevTournamentStateRef = useRef(tournament?.state)
  useEffect(() => {
    const prevState = prevTournamentStateRef.current
    const currentState = tournament?.state
    prevTournamentStateRef.current = currentState

    // Only trigger refresh when entering a new live round (not on initial load)
    const isNowLive = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'].includes(currentState)
    const wasBreak = ['SETUP', 'QF_BREAK', 'SF_BREAK', 'FINAL_BREAK'].includes(prevState)

    // Trigger immediate refresh when transitioning from break/previous round to a new live round
    if (isNowLive && (wasBreak || (prevState && prevState !== currentState))) {
      console.log('[LiveDashboard] Entering new round:', currentState, '- forcing refresh')
      fetchSnapshot()
    }
  }, [tournament?.state, fetchSnapshot])

  // Show celebration when there's a winner (and we haven't shown it yet)
  useEffect(() => {
    if (tournament?.winner && tournament?.state === 'RESULTS' && !celebrationShown) {
      setShowCelebration(true)
      setCelebrationShown(true)
    }
    // Reset celebration flag when tournament changes
    if (tournament?.state === 'IDLE' || tournament?.state === 'SETUP') {
      setCelebrationShown(false)
    }
  }, [tournament?.winner, tournament?.state, celebrationShown])

  // ─── Auto-cycle: Detect tournament completion and start winner display ───
  useEffect(() => {
    const state = tournament?.state
    const tId = tournament?.tournamentId
    if (
      (state === 'RESULTS' || state === 'COMPLETE') &&
      tId &&
      autoCycledTournamentIdRef.current !== tId &&
      !autoCyclePhase
    ) {
      console.log('[AutoCycle] Tournament completed, starting winner display')
      autoCycledTournamentIdRef.current = tId
      setAutoCyclePhase('WINNER_DISPLAY')
      autoCyclePhaseStartRef.current = Date.now()
      setAutoCycleCountdown(AUTO_CYCLE_DURATION)
    }
  }, [tournament?.state, tournament?.tournamentId, autoCyclePhase])

  // ─── Auto-cycle: Countdown timer and phase transitions ───
  useEffect(() => {
    if (!autoCyclePhase || autoCyclePhase === 'STARTING_TOURNAMENT') return
    if (!autoCyclePhaseStartRef.current) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - autoCyclePhaseStartRef.current
      const remaining = Math.max(0, AUTO_CYCLE_DURATION - elapsed)
      setAutoCycleCountdown(remaining)

      if (remaining <= 0) {
        clearInterval(interval)

        if (autoCyclePhase === 'WINNER_DISPLAY') {
          console.log('[AutoCycle] Winner display complete, starting new tournament')
          setAutoCyclePhase('STARTING_TOURNAMENT')
          liveApi.startTournament()
            .then(() => {
              console.log('[AutoCycle] Tournament started, fetching fixtures')
              return fetchSnapshot()
            })
            .then(() => {
              setAutoCyclePhase('FIXTURES_PREVIEW')
              autoCyclePhaseStartRef.current = Date.now()
              setAutoCycleCountdown(AUTO_CYCLE_DURATION)
            })
            .catch(err => {
              console.error('[AutoCycle] Failed to start tournament:', err)
              setAutoCyclePhase(null)
            })
        } else if (autoCyclePhase === 'FIXTURES_PREVIEW') {
          console.log('[AutoCycle] Fixtures preview complete, transitioning to live')
          setAutoCyclePhase(null)
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [autoCyclePhase, fetchSnapshot])

  // ─── Auto-cycle: Poll for fixtures during preview if none available yet ───
  useEffect(() => {
    if (autoCyclePhase !== 'FIXTURES_PREVIEW') return

    const r16Fixtures = fixtures.filter(f => {
      const round = normalizeRound(f.round)
      return round === 'Round of 16'
    })

    if (r16Fixtures.length > 0) return

    console.log('[AutoCycle] No R16 fixtures yet, polling...')
    const poll = setInterval(() => {
      fetchSnapshot()
    }, 3000)

    return () => clearInterval(poll)
  }, [autoCyclePhase, fixtures, fetchSnapshot])

  // ─── Auto-cycle: Reset when new tournament starts playing ───
  useEffect(() => {
    if (!autoCyclePhase) return
    const state = tournament?.state
    // If backend started a new tournament while we're showing winner
    if (autoCyclePhase === 'WINNER_DISPLAY' && state === 'SETUP') {
      const tId = tournament?.tournamentId
      if (tId && tId !== autoCycledTournamentIdRef.current) {
        console.log('[AutoCycle] Backend started new tournament, switching to fixtures preview')
        setAutoCyclePhase('FIXTURES_PREVIEW')
        autoCyclePhaseStartRef.current = Date.now()
        setAutoCycleCountdown(AUTO_CYCLE_DURATION)
      }
    }
  }, [tournament?.state, tournament?.tournamentId, autoCyclePhase])

  // Get state config
  const liveTournament = tournament?.state && tournament.state !== 'IDLE'
    ? tournament
    : (lastCompletedTournament || tournament)

  const stateConfig = TOURNAMENT_STATE_CONFIG[liveTournament?.state] || TOURNAMENT_STATE_CONFIG.IDLE
  const currentRound = normalizeRound(STATE_TO_ROUND[liveTournament?.state])

  // Organize matches by round - use fixtures array if available
  const baseFixtures = fixtures.length > 0 ? fixtures : (liveTournament === lastCompletedTournament ? (lastCompletedFixtures || []) : [])
  const allMatches = baseFixtures.length > 0 ? baseFixtures : [...(completedMatches || []), ...(matches || [])]
  const matchesByRound = ROUNDS.reduce((acc, round) => {
    acc[round] = []
    return acc
  }, {})
  allMatches.forEach(match => {
    const round = normalizeRound(match?.round)
    if (round && matchesByRound[round]) {
      matchesByRound[round].push(match)
    }
  })

  // Determine round states
  const getRoundState = (round) => {
    const roundMatches = matchesByRound[round]
    const allFinished = roundMatches.length > 0 && roundMatches.every(m => m.isFinished || m.state === 'FINISHED')
    const anyInProgress = roundMatches.some(m =>
      ['FIRST_HALF', 'SECOND_HALF', 'EXTRA_TIME_1', 'EXTRA_TIME_2', 'PENALTIES', 'HALFTIME', 'ET_HALFTIME'].includes(m.state)
    )

    // A round is "current" if:
    // 1. Tournament state says this is the current round (currentRound === round), OR
    // 2. Any match in this round is actively playing (anyInProgress), OR
    // 3. Tournament state says this round should be playing AND matches exist but aren't finished
    const tournamentSaysCurrentRound = currentRound === round
    const hasUnfinishedMatches = roundMatches.length > 0 && !allFinished
    const isCurrent = tournamentSaysCurrentRound || anyInProgress || (tournamentSaysCurrentRound && hasUnfinishedMatches)

    return {
      isCompleted: allFinished,
      isCurrent,
      // Only pending if no matches exist AND it's not the current round per tournament state
      isPending: !allFinished && !anyInProgress && roundMatches.length === 0 && !tournamentSaysCurrentRound
    }
  }

  // Handle team click
  const handleTeamClick = (team) => {
    if (team?.name) {
      setSelectedTeam(team)
      setShowTeamPanel(true)
    }
  }

  // Loading state
  if (isInitialLoad && isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-20">
          <LoadingSpinner size="lg" className="mb-4" />
          <p className="text-text-muted">Connecting to live tournament...</p>
        </div>
      </div>
    )
  }

  // Note: Error state is now handled inline with an error banner

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Winner Celebration */}
      <WinnerCelebration
        winner={tournament?.winner}
        runnerUp={tournament?.runnerUp}
        show={showCelebration}
        onClose={() => setShowCelebration(false)}
      />

      {/* Team Stats Panel */}
      <TeamStatsPanel
        team={selectedTeam}
        isOpen={showTeamPanel}
        onClose={() => setShowTeamPanel(false)}
      />

      {/* Error Banner (if API failed) */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-live/10 border border-live/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-live font-medium">Unable to connect to tournament server</p>
                <p className="text-sm text-text-muted">{error}</p>
              </div>
            </div>
            <button
              onClick={() => fetchSnapshot().catch(() => { })}
              className="btn btn-secondary text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Connection Status */}
      {!error && (
        <ConnectionStatus
          connected={connected}
          connecting={connecting}
          onReconnect={reconnect}
        />
      )}

      {/* Main Content - Auto-cycle phases or normal tournament view */}
      {autoCyclePhase === 'WINNER_DISPLAY' || autoCyclePhase === 'STARTING_TOURNAMENT' ? (
        <AutoCycleWinnerDisplay
          winner={tournament?.winner}
          runnerUp={tournament?.runnerUp}
          countdown={autoCycleCountdown}
          isStarting={autoCyclePhase === 'STARTING_TOURNAMENT'}
          matchesByRound={matchesByRound}
          getRoundState={getRoundState}
          onTeamClick={handleTeamClick}
        />
      ) : autoCyclePhase === 'FIXTURES_PREVIEW' ? (
        <AutoCycleFixturesPreview
          matches={matchesByRound['Round of 16'] || []}
          countdown={autoCycleCountdown}
          onTeamClick={handleTeamClick}
        />
      ) : (
        <>
          {/* Tournament Header */}
          <TournamentHeader
            tournament={tournament}
            stateConfig={stateConfig}
            currentRound={currentRound}
          />

          {/* Goal Ticker - Shows scores and announces goals during live rounds */}
          <GoalTicker
            goalEvents={recentEvents}
            matches={currentRound ? matchesByRound[currentRound] || [] : []}
            isLive={['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'].includes(tournament?.state)}
            isBreak={['QF_BREAK', 'SF_BREAK', 'FINAL_BREAK', 'SETUP'].includes(tournament?.state)}
            currentRound={currentRound || ''}
            nextRound={stateConfig?.phase === 'break' ? stateConfig?.title?.replace(' Starting', '') : ''}
          />

          {/* Current Round Highlight (when live) */}
          {currentRound && matchesByRound[currentRound]?.length > 0 && (
            <div className="mb-8 animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full bg-live animate-pulse" />
                <h2 className="text-xl font-bold text-text">Now Playing</h2>
              </div>
              <RoundSection
                round={currentRound}
                matches={matchesByRound[currentRound]}
                isCurrentRound={true}
                onTeamClick={handleTeamClick}
              />
            </div>
          )}

          {/* Tournament Progress / All Rounds */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-text-muted uppercase tracking-wider">
              Tournament Progress
            </h2>

            <div className="space-y-4">
              {ROUNDS.map((round, idx) => {
                const { isCompleted, isCurrent, isPending } = getRoundState(round)
                // Skip showing current round again if already shown above
                if (isCurrent && currentRound === round && matchesByRound[round]?.length > 0) {
                  return null
                }

                return (
                  <div
                    key={round}
                    className="animate-slide-up"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                    <RoundSection
                      round={round}
                      matches={matchesByRound[round]}
                      isCompleted={isCompleted}
                      isCurrentRound={isCurrent}
                      isPending={isPending}
                      onTeamClick={handleTeamClick}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tournament Winner Section (persisted after celebration closes) */}
          {tournament?.winner && (tournament?.state === 'RESULTS' || tournament?.state === 'COMPLETE') && !autoCyclePhase && (
            <div className="mt-8 animate-slide-up">
              <div className="bg-gradient-to-br from-gold/10 via-card to-gold/10 rounded-3xl border border-gold/30 p-8 text-center glow-gold">
                <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-yellow-400 via-gold to-yellow-500 flex items-center justify-center text-5xl shadow-xl shadow-gold/30">
                  🏆
                </div>
                <p className="text-gold text-sm font-semibold uppercase tracking-wider mb-2">Tournament Champion</p>
                <h3 className="text-3xl font-bold text-text mb-2">
                  {tournament.winner?.name || tournament.winner}
                </h3>
                {tournament.runnerUp && (
                  <p className="text-text-muted">
                    Runner-up: <span className="text-text">{tournament.runnerUp?.name || tournament.runnerUp}</span>
                  </p>
                )}
                <button
                  onClick={() => handleTeamClick(tournament.winner)}
                  className="mt-4 btn btn-ghost text-gold hover:bg-gold/10"
                >
                  View Champion Stats →
                </button>
              </div>
            </div>
          )}

          {/* Waiting State (No tournament) */}
          {(!tournament || tournament?.state === 'IDLE') && (
            <div className="mt-8 text-center py-12 bg-card rounded-2xl border border-border">
              <span className="text-6xl block mb-4">⏳</span>
              <h3 className="text-xl font-bold text-text mb-2">Waiting for Next Tournament</h3>
              <p className="text-text-muted mb-4">
                Each round starts 5 minutes after the last. The next tournament begins 5 minutes after the previous one finishes.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Connection Status Component
function ConnectionStatus({ connected, connecting, onReconnect }) {
  if (connected) {
    return (
      <div className="flex items-center justify-center gap-2 mb-4 py-2 px-4 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm">
        <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
        Connected to live stream
      </div>
    )
  }

  if (connecting) {
    return (
      <div className="flex items-center justify-center gap-2 mb-4 py-2 px-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
        <LoadingSpinner size="sm" />
        Connecting...
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between mb-4 py-2 px-4 rounded-xl bg-live/10 border border-live/20 text-live text-sm">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-live" />
        Disconnected
      </span>
      <button
        onClick={() => onReconnect(true)}
        className="text-xs font-medium underline hover:no-underline"
      >
        Reconnect
      </button>
    </div>
  )
}

// Tournament Header Component
function TournamentHeader({ tournament, stateConfig, currentRound }) {
  const isLive = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'FINAL'].includes(tournament?.state)
  const isComplete = tournament?.state === 'RESULTS' || tournament?.state === 'COMPLETE'

  return (
    <div className={`
      relative overflow-hidden rounded-3xl mb-8 p-6 sm:p-8
      bg-gradient-to-br from-card via-card to-primary/5
      border transition-all duration-500
      ${isLive ? 'border-live/30 shadow-xl shadow-live/10' : isComplete ? 'border-gold/30' : 'border-border'}
    `}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 25px 25px, currentColor 2px, transparent 0)`,
          backgroundSize: '50px 50px',
        }} />
      </div>

      <div className="relative flex flex-col sm:flex-row items-center gap-6">
        {/* Icon */}
        <div className={`
          w-20 h-20 sm:w-24 sm:h-24 rounded-2xl flex items-center justify-center text-5xl shadow-xl
          ${isComplete
            ? 'bg-gradient-to-br from-gold/30 to-yellow-500/20 shadow-gold/20'
            : isLive
              ? 'bg-gradient-to-br from-live/30 to-live/10 shadow-live/20 animate-pulse'
              : 'bg-gradient-to-br from-primary/20 to-primary/10 shadow-primary/20'}
        `}>
          {stateConfig.icon}
        </div>

        {/* Info */}
        <div className="flex-1 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3 mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold text-text">
              {stateConfig.title}
            </h1>
            {isLive && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-live/20 border border-live/30">
                <span className="w-2 h-2 rounded-full bg-live animate-pulse" />
                <span className="text-sm font-bold text-live">LIVE</span>
              </div>
            )}
          </div>
          <p className="text-text-muted">{stateConfig.subtitle}</p>

          {/* Round Progress Indicator */}
          {tournament && !['IDLE', 'SETUP', 'RESULTS', 'COMPLETE'].includes(tournament.state) && (
            <div className="mt-4 flex items-center gap-2">
              {ROUNDS.map((round, idx) => {
                const isPast = ROUNDS.indexOf(currentRound) > idx
                const isCurrent = currentRound === round

                return (
                  <div key={round} className="flex items-center gap-2">
                    <div className={`
                      w-3 h-3 rounded-full transition-all duration-300
                      ${isCurrent
                        ? 'bg-live w-4 h-4 animate-pulse'
                        : isPast
                          ? 'bg-primary'
                          : 'bg-border'}
                    `} />
                    {idx < ROUNDS.length - 1 && (
                      <div className={`
                        w-8 h-0.5 rounded-full transition-all duration-300
                        ${isPast ? 'bg-primary' : 'bg-border'}
                      `} />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tournament ID */}
        {tournament?.tournamentId && (
          <div className="text-sm text-text-muted font-mono">
            #{tournament.tournamentId}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Auto-Cycle Components ───

function CountdownTimer({ countdown, label }) {
  const minutes = Math.floor(countdown / 60000)
  const seconds = Math.floor((countdown % 60000) / 1000)

  return (
    <div className="text-center">
      <p className="text-text-muted text-sm mb-2">{label}</p>
      <div className="font-mono text-4xl font-bold text-primary">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </div>
      {/* Progress bar */}
      <div className="mt-3 w-48 mx-auto h-1.5 rounded-full bg-border overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${(countdown / AUTO_CYCLE_DURATION) * 100}%` }}
        />
      </div>
    </div>
  )
}

function AutoCycleWinnerDisplay({ winner, runnerUp, countdown, isStarting, matchesByRound, getRoundState, onTeamClick }) {
  return (
    <div className="animate-slide-up">
      {/* Winner Showcase */}
      <div className="flex flex-col items-center justify-center min-h-[50vh] py-12">
        {/* Trophy */}
        <div className="relative mb-8">
          <div className="w-36 h-36 rounded-full bg-gradient-to-br from-yellow-400 via-gold to-yellow-500 flex items-center justify-center text-8xl shadow-2xl shadow-gold/30 animate-bounce-in">
            🏆
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-44 h-44 rounded-full trophy-shine" />
          </div>
        </div>

        {/* Champion Title */}
        <h1 className="text-4xl sm:text-6xl font-bold mb-4">
          <span className="text-gradient-gold">CHAMPION!</span>
        </h1>

        {/* Winner Name */}
        <div className="bg-gradient-to-r from-gold/10 via-gold/20 to-gold/10 rounded-3xl px-12 py-8 mb-4 border border-gold/20 text-center glow-gold">
          <h2 className="text-3xl sm:text-5xl font-bold text-text">
            {winner?.name || winner || 'Unknown'}
          </h2>
        </div>

        {/* Runner Up */}
        {runnerUp && (
          <p className="text-text-muted text-xl mb-8">
            Runner-up: <span className="text-text font-semibold">{runnerUp?.name || runnerUp}</span>
          </p>
        )}

        {/* Countdown */}
        <div className="mt-4">
          {isStarting ? (
            <div className="flex items-center gap-3 text-primary text-lg">
              <LoadingSpinner size="sm" />
              <span>Starting new tournament...</span>
            </div>
          ) : (
            <CountdownTimer
              countdown={countdown}
              label="New tournament starting in"
            />
          )}
        </div>
      </div>

      {/* Completed Tournament Rounds (below winner, dimmed) */}
      <div className="mt-8 space-y-4 opacity-40">
        <h2 className="text-lg font-bold text-text-muted uppercase tracking-wider">
          Tournament Results
        </h2>
        <div className="space-y-4">
          {ROUNDS.map((round, idx) => {
            const roundMatches = matchesByRound[round] || []
            if (roundMatches.length === 0) return null
            const { isCompleted } = getRoundState(round)
            return (
              <div key={round} className="animate-slide-up" style={{ animationDelay: `${idx * 100}ms` }}>
                <RoundSection
                  round={round}
                  matches={roundMatches}
                  isCompleted={isCompleted}
                  onTeamClick={onTeamClick}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AutoCycleFixturesPreview({ matches, countdown, onTeamClick }) {
  return (
    <div className="animate-slide-up">
      {/* Header */}
      <div className="text-center mb-10 pt-8">
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/20 border border-primary/30 text-primary text-sm font-bold mb-6">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          NEW TOURNAMENT
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-text mb-3">Round of 16</h1>
        <p className="text-text-muted text-lg">8 matches coming up</p>
      </div>

      {/* Fixtures Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10 max-w-4xl mx-auto">
        {matches.length > 0 ? (
          matches.map((match, idx) => (
            <FixturePreviewCard
              key={match.fixtureId || idx}
              match={match}
              index={idx}
              onTeamClick={onTeamClick}
            />
          ))
        ) : (
          <div className="col-span-2 text-center py-12 text-text-muted">
            <LoadingSpinner size="md" className="mb-4" />
            <p>Loading fixtures...</p>
          </div>
        )}
      </div>

      {/* Countdown */}
      <div className="text-center pb-8">
        <CountdownTimer
          countdown={countdown}
          label="Matches starting in"
        />
      </div>
    </div>
  )
}

function FixturePreviewCard({ match, index, onTeamClick }) {
  const { homeTeam, awayTeam } = match

  return (
    <div
      className="bg-card rounded-2xl border border-border p-5 animate-slide-up hover:border-primary/30 transition-all duration-200"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => onTeamClick?.(homeTeam)}
          className="flex-1 text-right font-semibold text-text hover:text-primary transition-colors truncate"
        >
          {homeTeam?.name || 'TBD'}
        </button>
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <span className="text-primary font-bold text-sm">VS</span>
        </div>
        <button
          onClick={() => onTeamClick?.(awayTeam)}
          className="flex-1 text-left font-semibold text-text hover:text-primary transition-colors truncate"
        >
          {awayTeam?.name || 'TBD'}
        </button>
      </div>
    </div>
  )
}
